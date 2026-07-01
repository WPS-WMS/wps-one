import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { isFeatureAllowed } from "../lib/permissions.js";
import { notifyPermissionRequestEmail, notifyProjectResponsibleOfApontamento } from "../lib/timeEntryEmailNotifications.js";
import { sumTimeEntryMinutesForUserOnStoredUtcDay } from "../lib/timeEntryLimits.js";
import { calcSameDayApontamentoMinutes } from "../lib/timeEntrySameDay.js";
import {
  computeDailyLimitViolation,
  detectApontamentoViolations,
  dedupePendingPermissionRequests,
  encodeViolationRules,
  getMaxPastDaysFromUser,
  getOutsideCurrentMonthMessage,
  getViolationBlockMessage,
  isOutsideCurrentMonth,
  normalizeApontamentoViolacaoModo,
  parseViolationRules,
  permissionRequestDedupeKey,
  type ApontamentoViolationRule,
} from "../lib/apontamentoViolacao.js";
import { todayYmdInBrasil, ymdInBrasilFromInstant } from "../lib/brasilCalendarMonthBounds.js";

export const permissionRequestsRouter = Router();
permissionRequestsRouter.use(authMiddleware);
// Importante:
// - Consultor/usuário precisa acessar/criar suas próprias solicitações via Apontamento.
// - A permissão "configuracoes.permissoes" deve proteger APENAS as ações de aprovação/reprovação.

function ymdFromApontamentoDateInput(dateInput: unknown): string {
  const s = String(dateInput ?? "");
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return ymdInBrasilFromInstant(new Date(s));
}

async function isTenantHoliday(tenantId: string, ymd: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const row = await prisma.tenantHoliday.findFirst({
    where: { tenantId, isActive: true, date },
    select: { id: true },
  });
  return !!row;
}

function storedDatePreviewFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function getDailyLimitFromUser(
  user: { limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null },
  dateValue: string | Date
): number {
  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : 8;
  const raw = user.limiteHorasPorDia;
  if (!raw) return fallback;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return fallback;
    const idx = d.getDay(); // 0..6 => Dom..Sáb
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    const key = keys[idx] as string;
    const v = map[key];
    return typeof v === "number" && v >= 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

async function nextPermissionRequestCode(tx: typeof prisma, tenantId: string): Promise<{ seq: number; code: string }> {
  // Upsert + increment atômico por tenant
  const row = await tx.tenantCounter.upsert({
    where: { tenantId_key: { tenantId, key: "timeEntryPermissionRequest" } },
    create: { tenantId, key: "timeEntryPermissionRequest", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  const seq = row.value;
  const code = `PERM-${String(seq).padStart(6, "0")}`;
  return { seq, code };
}

async function findPendingDuplicateRequestIds(request: {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  date: Date;
  horaInicio: string;
  horaFim: string;
  projectId: string;
  ticketId: string | null;
  replacesTimeEntryId: string | null;
  submissionBatchId: string | null;
}): Promise<string[]> {
  const batchId = request.submissionBatchId?.trim() || null;
  if (batchId) {
    const batch = await prisma.timeEntryPermissionRequest.findMany({
      where: { tenantId: request.tenantId, submissionBatchId: batchId, status: "PENDING" },
      select: { id: true },
    });
    return batch.map((r) => r.id);
  }
  const key = permissionRequestDedupeKey({
    userId: request.userId,
    date: request.date,
    horaInicio: request.horaInicio,
    horaFim: request.horaFim,
    projectId: request.projectId,
    ticketId: request.ticketId,
    replacesTimeEntryId: request.replacesTimeEntryId,
  });
  const pending = await prisma.timeEntryPermissionRequest.findMany({
    where: {
      tenantId: request.tenantId,
      userId: request.userId,
      status: "PENDING",
      projectId: request.projectId,
      horaInicio: request.horaInicio,
      horaFim: request.horaFim,
    },
    select: {
      id: true,
      date: true,
      ticketId: true,
      replacesTimeEntryId: true,
    },
  });
  return pending
    .filter(
      (r) =>
        permissionRequestDedupeKey({
          userId: request.userId,
          date: r.date,
          horaInicio: request.horaInicio,
          horaFim: request.horaFim,
          projectId: request.projectId,
          ticketId: r.ticketId,
          replacesTimeEntryId: r.replacesTimeEntryId,
        }) === key,
    )
    .map((r) => r.id);
}

// Listar pedidos de permissão (tela Configurações > Permissões: todos; apontamento: próprios ou escopo gestor)
permissionRequestsRouter.get(
  "/",
  requireAnyFeature(["apontamentos", "configuracoes.permissoes"]),
  async (req, res) => {
  const user = req.user;
  const statusFilter = req.query.status as string | undefined;
  const scope = req.query.scope as string | undefined;

  const where: { userId?: string; status?: string; project?: any; user?: any } = {};

  // Escopo "own": sempre retorna apenas solicitações do próprio usuário
  if (scope === "own") {
    where.userId = user.id;
  } else {
    const canManageAll = await isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureId: "configuracoes.permissoes",
    });
    const role = String(user.role);

    if (canManageAll || ["SUPER_ADMIN", "ADMIN_PORTAL"].includes(role)) {
      // Todos do tenant (equivalente a super admin na tela de permissões)
    } else if (role === "GESTOR_PROJETOS") {
      where.project = { responsibles: { some: { userId: user.id } } };
    } else {
      where.userId = user.id;
    }
  }

  if (statusFilter && ["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const list = await prisma.timeEntryPermissionRequest.findMany({
    where: { ...where, tenantId: user.tenantId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { id: true, name: true } },
        },
      },
      ticket: { select: { id: true, code: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(dedupePendingPermissionRequests(list));
});

// Criar pedido de permissão (qualquer usuário autenticado)
permissionRequestsRouter.post("/", requireFeature("apontamentos"), async (req, res) => {
  const user = req.user;
  const {
    justification,
    date,
    horaInicio,
    horaFim,
    intervaloInicio,
    intervaloFim,
    totalHoras,
    description,
    projectId,
    ticketId,
    activityId,
    replacesTimeEntryId: replacesTimeEntryIdBody,
    violationRule: violationRuleBody,
    violationRules: violationRulesBody,
    submissionBatchId: submissionBatchIdBody,
  } = req.body as {
    justification?: unknown;
    date?: unknown;
    horaInicio?: unknown;
    horaFim?: unknown;
    intervaloInicio?: unknown;
    intervaloFim?: unknown;
    totalHoras?: unknown;
    description?: unknown;
    projectId?: unknown;
    ticketId?: unknown;
    activityId?: unknown;
    replacesTimeEntryId?: unknown;
    violationRule?: unknown;
    violationRules?: unknown;
    submissionBatchId?: unknown;
  };

  if (!justification || typeof justification !== "string" || justification.trim().length === 0) {
    res.status(400).json({ error: "Justificativa é obrigatória" });
    return;
  }
  if (!date || !horaInicio || !horaFim || totalHoras == null || !projectId) {
    res.status(400).json({ error: "Data, horário, total de horas e projeto são obrigatórios" });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: String(projectId) },
    select: { id: true },
  });
  if (!project) {
    res.status(400).json({ error: "Projeto não encontrado" });
    return;
  }

  const totalHorasNum =
    typeof totalHoras === "number" ? totalHoras : parseFloat(String(totalHoras));
  if (isNaN(totalHorasNum) || totalHorasNum <= 0) {
    res.status(400).json({ error: "Total de horas inválido" });
    return;
  }

  let replacesTimeEntryId: string | null = null;
  const rawReplace = replacesTimeEntryIdBody != null ? String(replacesTimeEntryIdBody).trim() : "";
  if (rawReplace) {
    const te = await prisma.timeEntry.findFirst({
      where: { id: rawReplace, userId: user.id },
      select: {
        id: true,
        project: { select: { client: { select: { tenantId: true } } } },
      },
    });
    if (!te) {
      res.status(400).json({ error: "Apontamento a substituir não encontrado." });
      return;
    }
    const tenantFromProject = te.project?.client?.tenantId;
    if (tenantFromProject && tenantFromProject !== user.tenantId) {
      res.status(403).json({ error: "Sem permissão para este apontamento." });
      return;
    }
    replacesTimeEntryId = te.id;
  }

  // Mesma regra global dos apontamentos: ninguém pode solicitar permissão para data futura
  const todayYmd = todayYmdInBrasil();
  const requestedYmd = ymdFromApontamentoDateInput(date);
  if (requestedYmd > todayYmd) {
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  if (isOutsideCurrentMonth(requestedYmd, todayYmd)) {
    res.status(400).json({ error: getOutsideCurrentMonthMessage() });
    return;
  }

  const requestedDateForRules = new Date(requestedYmd + "T00:00:00");
  const weekday = requestedDateForRules.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const isHoliday = await isTenantHoliday(user.tenantId, requestedYmd);
  const requestedViolationRules = (() => {
    const fromArray = parseViolationRules(violationRulesBody);
    if (fromArray.length > 0) return fromArray;
    return parseViolationRules(violationRuleBody);
  })();
  const violationRuleStored = encodeViolationRules(requestedViolationRules);
  const submissionBatchId =
    submissionBatchIdBody != null && String(submissionBatchIdBody).trim()
      ? String(submissionBatchIdBody).trim()
      : null;
  const modo = normalizeApontamentoViolacaoModo((user as any).violacaoApontamentoModo);

  if (requestedViolationRules.length > 0 && modo !== "ENVIAR_APROVACAO") {
    res.status(400).json({ error: "Este usuário não está configurado para enviar violações à aprovação." });
    return;
  }

  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    requestedDateForRules,
  );
  const entryTotalMinutes = (() => {
    const span = calcSameDayApontamentoMinutes(
      String(horaInicio),
      String(horaFim),
      intervaloInicio ? String(intervaloInicio) : null,
      intervaloFim ? String(intervaloFim) : null,
    );
    return span.ok ? span.totalMinutes : Math.round(totalHorasNum * 60);
  })();
  const dayTotalMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(user.id, storedDatePreviewFromYmd(requestedYmd), {
    excludeEntryId: replacesTimeEntryId ?? undefined,
  });
  const { willExceedByEntry, willExceedByDay } = computeDailyLimitViolation({
    dailyLimitHours: dailyLimitForDay,
    dayTotalMinutes,
    entryTotalMinutes,
  });
  const maxPastDays = getMaxPastDaysFromUser(user);
  const violations = detectApontamentoViolations({
    permitirMaisHoras: user.permitirMaisHoras,
    permitirFimDeSemana: user.permitirFimDeSemana,
    permitirOutroPeriodo: user.permitirOutroPeriodo,
    entryYmd: requestedYmd,
    todayYmd,
    maxPastDays,
    violacaoModo: modo,
    isWeekend,
    isHoliday,
    willExceedByEntry,
    willExceedByDay,
  });

  if (requestedViolationRules.length > 0) {
    for (const rule of requestedViolationRules) {
      if (!violations.includes(rule)) {
        res.status(400).json({ error: getViolationBlockMessage(rule) });
        return;
      }
    }
  }

  // Limite diário = 0: dia não apontável,
  // EXCETO solicitação explícita de fim de semana/feriado em modo de aprovação.
  if (
    dailyLimitForDay === 0 &&
    !isWeekend &&
    !isHoliday &&
    !requestedViolationRules.includes("FIM_DE_SEMANA_FERIADO")
  ) {
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  // Construir a data do apontamento em horário local (evita voltar um dia em fuso -03)
  const [year, month, day] = requestedYmd.split("-").map((n) => Number(n));
  const storedDate = new Date(year, (month || 1) - 1, day || 1);

  // Idempotência: reutiliza solicitação PENDING do mesmo apontamento (independente da regra).
  const existingPending = await prisma.timeEntryPermissionRequest.findFirst({
    where: {
      userId: user.id,
      tenantId: user.tenantId,
      status: "PENDING",
      replacesTimeEntryId: replacesTimeEntryId ?? null,
      date: storedDate,
      horaInicio: String(horaInicio),
      horaFim: String(horaFim),
      projectId: String(projectId),
      ticketId: ticketId ? String(ticketId) : null,
    },
    orderBy: { createdAt: "asc" },
  });

  async function removeDuplicatePendingExcept(keepId: string) {
    const keep = await prisma.timeEntryPermissionRequest.findUnique({ where: { id: keepId } });
    if (!keep) return;
    const duplicateIds = await findPendingDuplicateRequestIds(keep);
    const toDelete = duplicateIds.filter((rid) => rid !== keepId);
    if (toDelete.length > 0) {
      await prisma.timeEntryPermissionRequest.deleteMany({ where: { id: { in: toDelete } } });
    }
  }

  if (existingPending) {
    const updated = await prisma.timeEntryPermissionRequest.update({
      where: { id: existingPending.id },
      data: {
        tenantId: user.tenantId,
        status: "PENDING",
        justification: String(justification).trim(),
        date: storedDate,
        horaInicio: String(horaInicio),
        horaFim: String(horaFim),
        intervaloInicio: intervaloInicio ? String(intervaloInicio) : null,
        intervaloFim: intervaloFim ? String(intervaloFim) : null,
        totalHoras: totalHorasNum,
        description: description ? String(description).trim() : null,
        projectId: String(projectId),
        ticketId: ticketId ? String(ticketId) : null,
        activityId: activityId ? String(activityId) : null,
        replacesTimeEntryId: replacesTimeEntryId,
        violationRule: violationRuleStored,
        submissionBatchId,
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
        ticket: { select: { id: true, code: true, title: true } },
      },
    });
    await removeDuplicatePendingExcept(updated.id);
    res.status(200).json(updated);
    void notifyPermissionRequestEmail({
      tenantId: user.tenantId,
      projectId: String(projectId),
      requestId: updated.code || updated.id,
      apontadorUserId: user.id,
      entryDate: storedDate,
      totalHorasRequest: totalHorasNum,
      replacesTimeEntryId,
      description: description ? String(description).trim() : null,
    });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const { seq, code } = await nextPermissionRequestCode(tx as any, user.tenantId);
    return await tx.timeEntryPermissionRequest.create({
      data: {
        tenantId: user.tenantId,
        seq,
        code,
        userId: user.id,
        status: "PENDING",
        justification: String(justification).trim(),
        date: storedDate,
        horaInicio: String(horaInicio),
        horaFim: String(horaFim),
        intervaloInicio: intervaloInicio ? String(intervaloInicio) : null,
        intervaloFim: intervaloFim ? String(intervaloFim) : null,
        totalHoras: totalHorasNum,
        description: description ? String(description).trim() : null,
        projectId: String(projectId),
        ticketId: ticketId ? String(ticketId) : null,
        activityId: activityId ? String(activityId) : null,
        replacesTimeEntryId: replacesTimeEntryId,
        violationRule: violationRuleStored,
        submissionBatchId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
        ticket: { select: { id: true, code: true, title: true } },
      },
    });
  });
  await removeDuplicatePendingExcept(created.id);
  res.status(201).json(created);
  void notifyPermissionRequestEmail({
    tenantId: user.tenantId,
    projectId: String(projectId),
    requestId: created.code || created.id,
    apontadorUserId: user.id,
    entryDate: storedDate,
    totalHorasRequest: totalHorasNum,
    replacesTimeEntryId,
    description: description ? String(description).trim() : null,
  });
});

// Reenviar uma solicitação REJECTED (apenas o dono pode reenviar)
permissionRequestsRouter.post("/:id/resend", requireFeature("apontamentos"), async (req, res) => {
  const user = req.user;
  const id = req.params.id;
  const {
    date,
    horaInicio,
    horaFim,
    intervaloInicio,
    intervaloFim,
    totalHoras,
    description,
    projectId,
    ticketId,
    activityId,
  } = req.body;

  const existing = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!existing) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  if (existing.user?.tenantId !== user.tenantId) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }

  if (existing.userId !== user.id) {
    res.status(403).json({ error: "Você só pode reenviar suas próprias solicitações" });
    return;
  }

  if (existing.status !== "REJECTED") {
    res.status(400).json({ error: "Somente solicitações reprovadas podem ser reenviadas" });
    return;
  }

  if (!date || !horaInicio || !horaFim || totalHoras == null || !projectId) {
    res.status(400).json({ error: "Data, horário, total de horas e projeto são obrigatórios" });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: String(projectId) },
    select: { id: true },
  });
  if (!project) {
    res.status(400).json({ error: "Projeto não encontrado" });
    return;
  }

  const totalHorasNum =
    typeof totalHoras === "number" ? totalHoras : parseFloat(String(totalHoras));
  if (isNaN(totalHorasNum) || totalHorasNum <= 0) {
    res.status(400).json({ error: "Total de horas inválido" });
    return;
  }

  // Mesma regra global dos apontamentos: ninguém pode solicitar permissão para data futura
  const todayYmd = todayYmdInBrasil();
  const requestedYmd = ymdFromApontamentoDateInput(date);
  if (requestedYmd > todayYmd) {
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  if (isOutsideCurrentMonth(requestedYmd, todayYmd)) {
    res.status(400).json({ error: getOutsideCurrentMonthMessage() });
    return;
  }

  const requestedDateForRules = new Date(requestedYmd + "T00:00:00");
  const weekday = requestedDateForRules.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const isHoliday = await isTenantHoliday(user.tenantId, requestedYmd);
  const modo = normalizeApontamentoViolacaoModo((user as any).violacaoApontamentoModo);

  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    requestedDateForRules,
  );

  const spanResult = calcSameDayApontamentoMinutes(
    String(horaInicio),
    String(horaFim),
    intervaloInicio ? String(intervaloInicio) : null,
    intervaloFim ? String(intervaloFim) : null,
  );
  if (spanResult.ok === false) {
    res.status(400).json({ error: spanResult.error });
    return;
  }
  const entryTotalMinutes = spanResult.totalMinutes;
  const totalHorasFromSpan = entryTotalMinutes / 60;

  const dayTotalMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(user.id, storedDatePreviewFromYmd(requestedYmd), {
    excludeEntryId: existing.replacesTimeEntryId ?? undefined,
  });
  const { willExceedByEntry, willExceedByDay } = computeDailyLimitViolation({
    dailyLimitHours: dailyLimitForDay,
    dayTotalMinutes,
    entryTotalMinutes,
  });
  const violations = detectApontamentoViolations({
    permitirMaisHoras: user.permitirMaisHoras,
    permitirFimDeSemana: user.permitirFimDeSemana,
    permitirOutroPeriodo: user.permitirOutroPeriodo,
    entryYmd: requestedYmd,
    todayYmd,
    maxPastDays: getMaxPastDaysFromUser(user),
    violacaoModo: modo,
    isWeekend,
    isHoliday,
    willExceedByEntry,
    willExceedByDay,
  });

  if (violations.length > 0 && modo !== "ENVIAR_APROVACAO") {
    res.status(400).json({ error: getViolationBlockMessage(violations[0]) });
    return;
  }

  if (
    dailyLimitForDay === 0 &&
    !isWeekend &&
    !isHoliday &&
    !violations.includes("FIM_DE_SEMANA_FERIADO")
  ) {
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  const violationRuleStored = encodeViolationRules(violations);

  // Construir a data do apontamento em horário local (evita voltar um dia em fuso -03)
  const [year, month, day] = requestedYmd.split("-").map((n) => Number(n));
  const storedDate = new Date(year, (month || 1) - 1, day || 1);

  const updated = await prisma.timeEntryPermissionRequest.update({
    where: { id },
    data: {
      tenantId: user.tenantId,
      status: "PENDING",
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
      date: storedDate,
      horaInicio: String(horaInicio),
      horaFim: String(horaFim),
      intervaloInicio: intervaloInicio ? String(intervaloInicio) : null,
      intervaloFim: intervaloFim ? String(intervaloFim) : null,
      totalHoras: totalHorasFromSpan,
      violationRule: violationRuleStored,
      description: description ? String(description).trim() : null,
      projectId: String(projectId),
      ticketId: ticketId ? String(ticketId) : null,
      activityId: activityId ? String(activityId) : null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { id: true, name: true } },
        },
      },
      ticket: { select: { id: true, code: true, title: true } },
    },
  });

  res.json(updated);
  void notifyPermissionRequestEmail({
    tenantId: user.tenantId,
    projectId: String(projectId),
    requestId: updated.code || updated.id,
    apontadorUserId: user.id,
    entryDate: storedDate,
    totalHorasRequest: totalHorasFromSpan,
    replacesTimeEntryId: updated.replacesTimeEntryId ?? null,
    description: description ? String(description).trim() : null,
  });
});

// Aprovar ou rejeitar (ADMIN ou GESTOR_PROJETOS)
permissionRequestsRouter.patch("/:id", requireFeature("configuracoes.permissoes"), async (req, res) => {
  const authUser = req.user;

  const id = req.params.id;
  const { status, rejectionReason } = req.body as {
    status?: string;
    rejectionReason?: string;
  };
  if (!status || !["APPROVED", "REJECTED"].includes(status)) {
    res.status(400).json({ error: "Status deve ser APPROVED ou REJECTED" });
    return;
  }

  const request = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    include: { user: true, project: true },
  });
  if (!request) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  // Isolamento por tenant (evita aprovar itens de outro tenant por acidente)
  if (request.user?.tenantId && request.user.tenantId !== authUser.tenantId) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  if (request.status !== "PENDING") {
    res.status(400).json({ error: "Esta solicitação já foi processada" });
    return;
  }

  const canManageAll = await isFeatureAllowed({
    tenantId: authUser.tenantId,
    role: authUser.role,
    featureId: "configuracoes.permissoes",
  });
  // Gestor sem "Configurações > Permissões": só projetos em que é responsável
  if (String(authUser.role) === "GESTOR_PROJETOS" && !canManageAll) {
    const isResponsible = await prisma.projectResponsible.findFirst({
      where: { projectId: request.projectId, userId: authUser.id },
      select: { id: true },
    });
    if (!isResponsible) {
      res.status(403).json({
        error: "Você só pode aprovar/reprovar solicitações de projetos em que você é responsável.",
      });
      return;
    }
  }

  const now = new Date();
  const duplicateIds = await findPendingDuplicateRequestIds(request);

  if (status === "APPROVED") {
    // Bloqueio extra de segurança: mesmo pedidos antigos não podem ser aprovados se a data for futura
    const todayYmd = todayYmdInBrasil();
    const requestYmd = ymdInBrasilFromInstant(request.date);
    if (requestYmd > todayYmd) {
      res.status(400).json({ error: "Não é permitido aprovar apontamentos em datas futuras." });
      return;
    }

    const createdEntry = await prisma.$transaction(async (tx) => {
      const siblings = await tx.timeEntryPermissionRequest.findMany({
        where: { id: { in: duplicateIds } },
        select: { id: true, createdTimeEntryId: true },
      });
      const existingEntryId = siblings.find((r) => r.createdTimeEntryId)?.createdTimeEntryId ?? null;

      await tx.timeEntryPermissionRequest.updateMany({
        where: { id: { in: duplicateIds } },
        data: {
          status: "APPROVED",
          reviewedAt: now,
          reviewedById: authUser.id,
          rejectionReason: null,
        },
      });

      if (existingEntryId) {
        return await tx.timeEntry.findUnique({ where: { id: existingEntryId } });
      }

      let e;
      if (request.replacesTimeEntryId) {
        const existing = await tx.timeEntry.findFirst({
          where: { id: request.replacesTimeEntryId, userId: request.userId },
        });
        if (existing) {
          e = await tx.timeEntry.update({
            where: { id: request.replacesTimeEntryId },
            data: {
              date: request.date,
              horaInicio: request.horaInicio,
              horaFim: request.horaFim,
              intervaloInicio: request.intervaloInicio,
              intervaloFim: request.intervaloFim,
              totalHoras: request.totalHoras,
              description: request.description,
              projectId: request.projectId,
              ticketId: request.ticketId,
              activityId: request.activityId,
            },
          });
        } else {
          e = await tx.timeEntry.create({
            data: {
              userId: request.userId,
              date: request.date,
              horaInicio: request.horaInicio,
              horaFim: request.horaFim,
              intervaloInicio: request.intervaloInicio,
              intervaloFim: request.intervaloFim,
              totalHoras: request.totalHoras,
              description: request.description,
              projectId: request.projectId,
              ticketId: request.ticketId,
              activityId: request.activityId,
            },
          });
        }
      } else {
        e = await tx.timeEntry.create({
          data: {
            userId: request.userId,
            date: request.date,
            horaInicio: request.horaInicio,
            horaFim: request.horaFim,
            intervaloInicio: request.intervaloInicio,
            intervaloFim: request.intervaloFim,
            totalHoras: request.totalHoras,
            description: request.description,
            projectId: request.projectId,
            ticketId: request.ticketId,
            activityId: request.activityId,
          },
        });
      }

      if (e) {
        await tx.timeEntryPermissionRequest.updateMany({
          where: { id: { in: duplicateIds } },
          data: { createdTimeEntryId: e.id },
        });
      }
      return e;
    });

    if (createdEntry) {
      void notifyProjectResponsibleOfApontamento({
        tenantId: authUser.tenantId,
        projectId: request.projectId,
        ticketId: request.ticketId,
        apontadorUserId: request.userId,
        entryDate: createdEntry.date,
        totalHoras: Number(createdEntry.totalHoras),
        description: request.description,
      });
    }
  } else {
    const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "Motivo da reprovação é obrigatório" });
      return;
    }

    await prisma.timeEntryPermissionRequest.updateMany({
      where: { id: { in: duplicateIds } },
      data: {
        status: "REJECTED",
        reviewedAt: now,
        reviewedById: authUser.id,
        rejectionReason: reason,
      },
    });
  }

  const updated = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { id: true, name: true } },
        },
      },
      ticket: { select: { id: true, code: true, title: true } },
    },
  });
  res.json(updated);
});

// Excluir própria solicitação (só o dono pode excluir; some da lista de permissões e do apontamento)
permissionRequestsRouter.delete("/:id", async (req, res) => {
  const user = req.user;
  const id = req.params.id;

  const request = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!request) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  if (request.userId !== user.id) {
    res.status(403).json({ error: "Só é possível excluir sua própria solicitação" });
    return;
  }

  await prisma.timeEntryPermissionRequest.delete({
    where: { id },
  });
  res.status(204).end();
});

// Limpar (deletar) em lote solicitações selecionadas (ADMIN e GESTOR via feature "configuracoes.permissoes")
permissionRequestsRouter.post(
  "/bulk-delete",
  requireFeature("configuracoes.permissoes"),
  async (req, res) => {
    const authUser = req.user;
    const { ids } = (req.body ?? {}) as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "Informe `ids` para limpar." });
      return;
    }

    const idList = ids.map((x) => String(x)).slice(0, 500);

    const result = await prisma.timeEntryPermissionRequest.deleteMany({
      where: {
        id: { in: idList },
        // Garante isolamento por tenant
        user: { tenantId: authUser.tenantId },
        status: { in: ["APPROVED", "REJECTED"] },
      },
    });

    res.json({ ok: true, deletedCount: result.count });
  },
);

// Limpeza automática periódica: remove pedidos APPROVED/REJECTED mais antigos que N dias.
permissionRequestsRouter.post(
  "/cleanup",
  requireFeature("configuracoes.permissoes"),
  async (req, res) => {
    const authUser = req.user;
    const { days } = (req.body ?? {}) as { days?: number };
    const nDays = typeof days === "number" && days > 0 ? Math.floor(days) : 90;
    const cutoff = new Date(Date.now() - nDays * 24 * 60 * 60 * 1000);

    const result = await prisma.timeEntryPermissionRequest.deleteMany({
      where: {
        user: { tenantId: authUser.tenantId },
        createdAt: { lt: cutoff },
        status: { in: ["APPROVED", "REJECTED"] },
      },
    });

    res.json({ ok: true, deletedCount: result.count, days: nDays });
  },
);
