import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const permissionRequestsRouter = Router();
permissionRequestsRouter.use(authMiddleware);
// Importante:
// - Consultor/usuário precisa acessar/criar suas próprias solicitações via Apontamento.
// - A permissão "configuracoes.permissoes" deve proteger APENAS as ações de aprovação/reprovação.

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMaxPastDaysFromUser(user: {
  diasPermitidos?: string | null;
  permitirOutroPeriodo?: boolean | null;
}): number {
  // Se o usuário NÃO tem permissão para apontar em outro período,
  // ele só pode solicitar permissão para a data de hoje (0 dias para trás).
  if (!user.permitirOutroPeriodo) {
    return 0;
  }

  const raw = user.diasPermitidos;
  if (raw == null || raw === "") return 0;

  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 0) return n;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    // ignore
  }
  return 0;
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

// Listar pedidos de permissão (ADMIN: todos; usuário: apenas os seus)
permissionRequestsRouter.get("/", requireFeature("apontamentos"), async (req, res) => {
  const user = req.user;
  const statusFilter = req.query.status as string | undefined;
  const scope = req.query.scope as string | undefined;

  const where: { userId?: string; status?: string } = {};

  // Escopo "own": sempre retorna apenas solicitações do próprio usuário
  if (scope === "own") {
    where.userId = user.id;
  } else {
    // Admin e Gestor de Projetos veem todas; demais veem apenas as próprias
    if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
      where.userId = user.id;
    }
  }

  if (statusFilter && ["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const list = await prisma.timeEntryPermissionRequest.findMany({
    where,
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
  res.json(list);
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
  } = req.body;

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

  const totalHorasNum = typeof totalHoras === "number" ? totalHoras : parseFloat(totalHoras);
  if (isNaN(totalHorasNum) || totalHorasNum <= 0) {
    res.status(400).json({ error: "Total de horas inválido" });
    return;
  }

  // Mesma regra global dos apontamentos: ninguém pode solicitar permissão para data futura
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = formatYmdLocal(today);
  const dateStr = String(date);
  const requestedYmd =
    dateStr.length >= 10 ? dateStr.slice(0, 10) : formatYmdLocal(new Date(dateStr));
  if (requestedYmd > todayYmd) {
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  const requestedDateForRules = new Date(requestedYmd + "T00:00:00");
  // Regra específica: finais de semana/feriados (hoje tratamos fim de semana; feriados podem ser adicionados depois)
  const weekday = requestedDateForRules.getDay(); // 0 = domingo, 6 = sábado
  const isWeekend = weekday === 0 || weekday === 6;
  if (isWeekend) {
    if (!user.permitirFimDeSemana) {
      res.status(400).json({
        error: "Você não tem permissão para apontar em finais de semana ou feriados.",
      });
      return;
    }
    // Só permitir solicitar para fim de semana/feriado NO PRÓPRIO DIA.
    // Se tentar solicitar um domingo em outra data, precisa da permissão de outro período.
    if (requestedYmd !== todayYmd && !user.permitirOutroPeriodo) {
      res.status(400).json({
        error: "Você não tem permissão para apontar em outras datas fora da data atual.",
      });
      return;
    }
  }

  // Respeitar também a janela de dias permitidos do usuário (sempre datas ANTERIORES)
  const maxPastDays = getMaxPastDaysFromUser(user);
  const diffMs = today.getTime() - requestedDateForRules.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > maxPastDays) {
    res.status(400).json({
      error:
        maxPastDays === 0
          ? "Você só pode apontar horas na data de hoje."
          : `Você só pode apontar horas até ${maxPastDays} dia(s) para trás.`,
    });
    return;
  }

  // Limite diário = 0: dia não apontável (nem com permissão),
  // EXCETO para fim de semana/feriado no próprio dia (onde a regra é "sempre por solicitação").
  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    requestedDateForRules
  );
  // Em fim de semana, o limite diário 0 NÃO deve bloquear o envio da solicitação:
  // o apontamento de fim de semana sempre precisa de aprovação.
  if (dailyLimitForDay === 0 && !isWeekend) {
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  // Construir a data do apontamento em horário local (evita voltar um dia em fuso -03)
  const [year, month, day] = requestedYmd.split("-").map((n) => Number(n));
  const storedDate = new Date(year, (month || 1) - 1, day || 1);

  // Idempotência simples: evita duplicar solicitações PENDING iguais
  // quando o frontend dispara o POST duas vezes (double-click/race condition).
  const existingPending = await prisma.timeEntryPermissionRequest.findFirst({
    where: {
      userId: user.id,
      status: "PENDING",
      date: storedDate,
      horaInicio: String(horaInicio),
      horaFim: String(horaFim),
      intervaloInicio: intervaloInicio ? String(intervaloInicio) : null,
      intervaloFim: intervaloFim ? String(intervaloFim) : null,
      projectId: String(projectId),
      ticketId: ticketId ? String(ticketId) : null,
      activityId: activityId ? String(activityId) : null,
    },
  });

  if (existingPending) {
    const updated = await prisma.timeEntryPermissionRequest.update({
      where: { id: existingPending.id },
      data: {
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
        // Garante um estado "limpo" para PENDING
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
    res.status(200).json(updated);
    return;
  }

  const created = await prisma.timeEntryPermissionRequest.create({
    data: {
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
  res.status(201).json(created);
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

  const totalHorasNum = typeof totalHoras === "number" ? totalHoras : parseFloat(totalHoras);
  if (isNaN(totalHorasNum) || totalHorasNum <= 0) {
    res.status(400).json({ error: "Total de horas inválido" });
    return;
  }

  // Mesma regra global dos apontamentos: ninguém pode solicitar permissão para data futura
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = formatYmdLocal(today);
  const dateStr = String(date);
  const requestedYmd =
    dateStr.length >= 10 ? dateStr.slice(0, 10) : formatYmdLocal(new Date(dateStr));
  if (requestedYmd > todayYmd) {
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  const requestedDateForRules = new Date(requestedYmd + "T00:00:00");
  const weekday = requestedDateForRules.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  if (isWeekend) {
    if (!user.permitirFimDeSemana) {
      res.status(400).json({
        error: "Você não tem permissão para apontar em finais de semana ou feriados.",
      });
      return;
    }
    if (requestedYmd !== todayYmd && !user.permitirOutroPeriodo) {
      res.status(400).json({
        error: "Você não tem permissão para apontar em outras datas fora da data atual.",
      });
      return;
    }
  }

  // Respeitar também a janela de dias permitidos do usuário
  const maxPastDays = getMaxPastDaysFromUser(user);
  const diffMs = today.getTime() - requestedDateForRules.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > maxPastDays) {
    res.status(400).json({
      error:
        maxPastDays === 0
          ? "Você só pode apontar horas na data de hoje."
          : `Você só pode apontar horas até ${maxPastDays} dia(s) para trás.`,
    });
    return;
  }

  // Limite diário = 0: dia não apontável (nem com permissão),
  // EXCETO para fim de semana/feriado no próprio dia (onde a regra é "sempre por solicitação").
  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    requestedDateForRules
  );
  if (dailyLimitForDay === 0 && !isWeekend) {
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  // Construir a data do apontamento em horário local (evita voltar um dia em fuso -03)
  const [year, month, day] = requestedYmd.split("-").map((n) => Number(n));
  const storedDate = new Date(year, (month || 1) - 1, day || 1);

  const updated = await prisma.timeEntryPermissionRequest.update({
    where: { id },
    data: {
      status: "PENDING",
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
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
  if (request.status !== "PENDING") {
    res.status(400).json({ error: "Esta solicitação já foi processada" });
    return;
  }

  const now = new Date();

  if (status === "APPROVED") {
    // Bloqueio extra de segurança: mesmo pedidos antigos não podem ser aprovados se a data for futura
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYmd = formatYmdLocal(today);
    const requestYmd = formatYmdLocal(request.date);
    if (requestYmd > todayYmd) {
      res.status(400).json({ error: "Não é permitido aprovar apontamentos em datas futuras." });
      return;
    }

    // E também deve respeitar janela de dias permitidos do usuário solicitante
    const maxPastDays = getMaxPastDaysFromUser(request.user);
    if (maxPastDays != null) {
      const diffMs = today.getTime() - request.date.setHours(0, 0, 0, 0);
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays > maxPastDays) {
        res.status(400).json({
          error:
            maxPastDays === 0
              ? "Você só pode aprovar horas na data de hoje para este usuário."
              : `Você só pode aprovar horas até ${maxPastDays} dia(s) para trás para este usuário.`,
        });
        return;
      }
    }

    await prisma.$transaction([
      prisma.timeEntry.create({
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
      }),
      prisma.timeEntryPermissionRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: now,
          reviewedById: authUser.id,
          rejectionReason: null,
        },
      }),
    ]);
  } else {
    const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "Motivo da reprovação é obrigatório" });
      return;
    }

    await prisma.timeEntryPermissionRequest.update({
      where: { id },
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
