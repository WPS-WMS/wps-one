import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { getDailyLimitFromUser, sumTimeEntryMinutesForUserOnStoredUtcDay } from "../lib/timeEntryLimits.js";
import { notifyProjectResponsibleOfApontamento } from "../lib/timeEntryEmailNotifications.js";
import { startOfSaoPauloCalendarDayUtc } from "../lib/brasilCalendarMonthBounds.js";
import { DEBUG_TIME_ENTRIES, devDebugLog, errorSummary } from "../lib/devLog.js";
import { calcSameDayApontamentoMinutes } from "../lib/timeEntrySameDay.js";
import { hasGlobalViewAccess } from "../lib/permissions.js";

/** Super admin / gestor: relatórios e visões agregadas. Tela Apontamentos = só o próprio usuário. */
function canViewAllHorasInReports(role: string): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "SUPER_ADMIN" || r === "GESTOR_PROJETOS";
}

export const timeEntriesRouter = Router();
timeEntriesRouter.use(authMiddleware);
// Cliente precisa visualizar apontamentos nas tarefas, mas não pode criar/editar/excluir.
// A feature "apontamentos" continua obrigatória para operações internas e visões agregadas.
timeEntriesRouter.use((req, res, next) => {
  const user = (req as Request & { user?: { role?: string } }).user;
  const role = String(user?.role ?? "").trim().toUpperCase();
  const isCliente = role === "CLIENTE";
  if (isCliente && req.method === "GET") return next();
  const report = String((req.query as { report?: unknown }).report ?? "")
    .trim()
    .toLowerCase();
  if (req.method === "GET" && report === "gestao-horas") {
    return requireAnyFeature([
      "apontamentos",
      "relatorios.gestaoHoras",
      "relatorios.gestaoHorasVerTodos",
    ])(req, res, next);
  }
  return requireFeature("apontamentos")(req, res, next);
});

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

async function isTenantHoliday(tenantId: string, ymd: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const date = ymdToUtcDate(ymd);
  const row = await prisma.tenantHoliday.findFirst({
    where: { tenantId, isActive: true, date },
    select: { id: true },
  });
  return !!row;
}

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

import {
  computeDailyLimitViolation,
  detectApontamentoViolations,
  getMaxPastDaysFromUser,
  getOutsideCurrentMonthMessage,
  getViolationBlockMessage,
  isOutsideCurrentMonth,
  normalizeApontamentoViolacaoModo,
  resolveApontamentoViolations,
} from "../lib/apontamentoViolacao.js";

/**
 * Data civil AAAA-MM-DD do formulário → instante UTC do início desse dia em America/Sao_Paulo.
 * Evita `new Date("AAAA-MM-DD")` (meia-noite UTC), que em BR cai no dia anterior e quebra
 * “horas utilizadas” mensais (AMS / Time & Material) e filtros por mês civil BR.
 */
function storedDateFromApontamentoDateInput(dateInput: unknown): Date {
  const s = String(dateInput ?? "");
  const ymd = s.length >= 10 ? s.slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const y = parseInt(ymd.slice(0, 4), 10);
    const m = parseInt(ymd.slice(5, 7), 10);
    const d = parseInt(ymd.slice(8, 10), 10);
    return startOfSaoPauloCalendarDayUtc(y, m, d);
  }
  return new Date(String(dateInput));
}

function parseHours(h: string): number {
  const [hh, mm] = String(h || "0").split(":").map(Number);
  return (hh || 0) + (mm || 0) / 60;
}

function isValidTimeHHMM(input: unknown): boolean {
  const s = String(input ?? "").trim();
  // Aceita "H:MM" ou "HH:MM"
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfUtcWeekMonday(d: Date): Date {
  const x = startOfUtcDay(d);
  const day = x.getUTCDay(); // 0=dom,1=seg...
  const diffToMonday = (day + 6) % 7; // seg ->0, dom->6
  x.setUTCDate(x.getUTCDate() - diffToMonday);
  return x;
}

/** GET /api/time-entries/summary/home - resumo Hoje/Semana/Mês para Home */
timeEntriesRouter.get("/summary/home", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const qUserId = String(req.query.userId ?? "").trim();
    const canViewAllHoras = canViewAllHorasInReports(user.role);
    const effectiveUserId = canViewAllHoras && qUserId ? qUserId : user.id;

    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const todayEnd = endOfUtcDay(now);
    const weekStart = startOfUtcWeekMonday(now);
    const weekEnd = endOfUtcDay(new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6)));
    const monthStart = startOfUtcMonth(now);
    const monthEnd = todayEnd;

    const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
    const baseWhere: any = { ...tenantFilter, userId: effectiveUserId };

    const [todayAgg, weekAgg, monthAgg] = await Promise.all([
      prisma.timeEntry.aggregate({
        where: { ...baseWhere, date: { gte: todayStart, lte: todayEnd } },
        _sum: { totalHoras: true },
      }),
      prisma.timeEntry.aggregate({
        where: { ...baseWhere, date: { gte: weekStart, lte: weekEnd } },
        _sum: { totalHoras: true },
      }),
      prisma.timeEntry.aggregate({
        where: { ...baseWhere, date: { gte: monthStart, lte: monthEnd } },
        _sum: { totalHoras: true },
      }),
    ]);

    res.json({
      hoje: todayAgg._sum.totalHoras ?? 0,
      semana: weekAgg._sum.totalHoras ?? 0,
      mes: monthAgg._sum.totalHoras ?? 0,
      // extras úteis para debug
      meta: {
        userId: effectiveUserId,
        todayStart,
        weekStart,
        monthStart,
      },
    });
  } catch (err) {
    console.error("GET /api/time-entries/summary/home error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao calcular resumo de horas" });
  }
});

timeEntriesRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const canViewAllHoras = canViewAllHorasInReports(user.role);
    const canViewAllGestaoHoras =
      canViewAllHoras ||
      (await hasGlobalViewAccess({
        tenantId: user.tenantId,
        role: user.role,
        featureId: "relatorios.gestaoHorasVerTodos",
      }));
    const {
      userId,
      start,
      end,
      projectId,
      ticketId,
      view,
      aggregateBy,
      limit,
      cursorId,
      light,
      report,
      includeDescription,
      userStatus,
    } = req.query;

    devDebugLog(DEBUG_TIME_ENTRIES, "GET /api/time-entries - Query params:", {
      userId,
      start,
      end,
      projectId,
      ticketId,
      view,
      aggregateBy,
      limit,
      cursorId,
      light,
      report,
      includeDescription,
      userStatus,
      userRole: user.role,
    });

    const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
    let where: Record<string, unknown> = {};
    const viewStr = String(view ?? "").trim().toLowerCase();
    const reportStr0 = String(report ?? "").trim().toLowerCase();
    
    // Se ticketId for fornecido, buscar todos os apontamentos desse ticket (sem filtrar por userId)
    if (ticketId) {
      // Verificar se o ticket pertence ao tenant antes de buscar os apontamentos
      const ticket = await prisma.ticket.findFirst({
        where: {
          id: String(ticketId),
          project: { client: { tenantId: user.tenantId } },
        },
        select: {
          id: true,
          project: { select: { client: { select: { users: { select: { userId: true } } } } } },
        },
      });
      
      if (!ticket) {
        devDebugLog(DEBUG_TIME_ENTRIES, "Ticket não encontrado ou não pertence ao tenant:", ticketId);
        res.json([]);
        return;
      }

      // Cliente: só pode ver apontamentos de tickets do(s) seu(s) cliente(s)
      if (user.role === "CLIENTE") {
        const hasAccess = (ticket.project?.client?.users ?? []).some((u) => u.userId === user.id);
        if (!hasAccess) {
          res.status(403).json({ error: "Sem permissão para visualizar apontamentos deste ticket." });
          return;
        }
      }
      
      // Quando ticketId é fornecido, já verificamos que pertence ao tenant
      // Então podemos buscar diretamente por ticketId
      where = {
        ticketId: String(ticketId),
      };
      devDebugLog(DEBUG_TIME_ENTRIES, "Buscando apontamentos para ticketId:", ticketId);
    } else if (
      // Visão agregada por projeto (todas as pessoas) para ADMIN / GESTOR
      projectId &&
      canViewAllHoras &&
      view === "project"
    ) {
      where = { ...tenantFilter, projectId: String(projectId) };
      devDebugLog(DEBUG_TIME_ENTRIES, "Buscando apontamentos do projeto (visão agregada):", projectId);
    } else if (user.role === "CLIENTE" && view === "client") {
      const clientIds = (
        await prisma.clientUser.findMany({
          where: { userId: user.id },
          select: { clientId: true },
        })
      ).map((c) => c.clientId);
      const projects = await prisma.project.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true },
      });
      where = { ...tenantFilter, projectId: { in: projects.map((p) => p.id) } };
    } else {
      // Padrão:
      // - SUPER_ADMIN / GESTOR_PROJETOS:
      //   - na visão padrão (sem `view/report/userId/projectId/ticketId`) retorna APENAS os apontamentos do próprio usuário
      //     (isso garante que a tela de Apontamentos mostre só o que o usuário logado lançou).
      //   - em visões explicitamente agregadas/relatórios, mantém comportamento anterior.
      //   - se houver userId explícito, filtra pelo usuário.
      // - Demais perfis: sempre filtra pelo próprio usuário (exceto relatório Gestão de horas com permissão global)
      const isGestaoHorasReport = reportStr0 === "gestao-horas";
      const canQueryOtherUsers = isGestaoHorasReport ? canViewAllGestaoHoras : canViewAllHoras;
      if (canQueryOtherUsers) {
        const isDefaultSelfView =
          !ticketId &&
          !projectId &&
          !userId &&
          !viewStr &&
          !reportStr0 &&
          !aggregateBy;
        const forceSelfOnly = isDefaultSelfView && !isGestaoHorasReport;
        where = { ...tenantFilter, ...(forceSelfOnly ? { userId: user.id } : {}) };
        if (userId) where.userId = String(userId);
      } else {
        where = { ...tenantFilter, userId: user.id };
      }
    }
    if (start && end) {
      where.date = { gte: new Date(String(start)), lte: new Date(String(end)) };
    }
    if (projectId && !ticketId && !(view === "project" && canViewAllHoras)) {
      // Filtro adicional por projeto quando não estamos na visão agregada de projeto
      where.projectId = projectId;
    }

    const reportStrEarly = String(report ?? "").trim().toLowerCase();
    const userStatusStr = String(userStatus ?? "").trim().toLowerCase();
    if (
      reportStrEarly === "gestao-horas" &&
      canViewAllGestaoHoras &&
      (userStatusStr === "ativos" || userStatusStr === "inativos")
    ) {
      where.user = { ativo: userStatusStr === "inativos" ? false : true };
    }

    const isLight = String(light ?? "").toLowerCase() === "true";
    const parsedLimitRaw = Number(limit);
    const requestedLimit = Number.isFinite(parsedLimitRaw) ? parsedLimitRaw : 0;
    // Segurança/estabilidade: cap de paginação para evitar respostas enormes por acidente.
    let take = requestedLimit > 0 ? Math.min(Math.max(1, requestedLimit), 500) : 0;
    const cursorIdStr = cursorId ? String(cursorId) : "";

    if (aggregateBy === "ticket") {
      const grouped = await prisma.timeEntry.groupBy({
        by: ["ticketId"],
        where: {
          ...where,
          ticketId: { not: null },
        },
        _sum: { totalHoras: true },
      });
      const payload = grouped
        .filter((row) => row.ticketId != null)
        .map((row) => ({
          ticketId: String(row.ticketId),
          totalHoras: row._sum.totalHoras ?? 0,
        }));
      res.json(payload);
      return;
    }

    // Guard rail anti-OOM: consultas muito amplas (especialmente para SUPER_ADMIN/GESTOR) podem estourar RAM.
    // Se o cliente não pede paginação e o filtro é amplo, fazemos um count rápido e instruímos a paginar/filtrar.
    const isBroadAdminQuery =
      canViewAllHoras &&
      !ticketId &&
      !projectId &&
      !userId &&
      // views agregadas/cliente já têm restrições próprias
      view !== "client" &&
      view !== "project";

    if (take === 0 && isBroadAdminQuery) {
      const total = await prisma.timeEntry.count({ where });
      if (total > 3000) {
        res.status(413).json({
          error:
            "Consulta muito ampla para este período. Use filtros (userId/projectId/ticketId) ou paginação (limit/cursorId) para evitar sobrecarga.",
          total,
        });
        return;
      }
    }

    const orderByPaged = [{ date: "desc" as const }, { id: "desc" as const }];
    const orderByLegacy = [{ date: "desc" as const }, { horaInicio: "asc" as const }];

    const baseQuery: any = {
      where,
      orderBy: take > 0 ? orderByPaged : orderByLegacy,
      ...(take > 0 ? { take } : {}),
      ...(take > 0 && cursorIdStr ? { cursor: { id: cursorIdStr }, skip: 1 } : {}),
    };

    const reportStr = String(report ?? "").trim().toLowerCase();
    const wantsDescription = String(includeDescription ?? "").toLowerCase() === "true";
    const isGestaoHorasReport = reportStr === "gestao-horas";
    const omitDescriptionForReport = isGestaoHorasReport && !wantsDescription;
    // Hardening: relatórios devem paginar por padrão para evitar payload gigante
    // mesmo que o cliente não envie `limit` por algum motivo.
    if (isGestaoHorasReport && take === 0) {
      take = 200;
    }

    if (isLight) {
      // Payload mínimo para aba "Apontamentos" dentro da modal de tarefa:
      // evita trazer project/ticket completos quando já estamos no contexto do ticket.
      const isTaskApontamentos = reportStr === "task-apontamentos";
      if (isTaskApontamentos) {
        baseQuery.select = {
          id: true,
          date: true,
          horaInicio: true,
          horaFim: true,
          intervaloInicio: true,
          intervaloFim: true,
          totalHoras: true,
          description: true,
          activity: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        };
      } else {
        baseQuery.select = {
          id: true,
          date: true,
          horaInicio: true,
          horaFim: true,
          intervaloInicio: true,
          intervaloFim: true,
          totalHoras: true,
          // Em Gestão de Horas, evitamos enviar descrições completas por padrão (payload grande).
          // Ainda assim, enviamos um preview truncado para visualização rápida na tabela.
          description: true,
          project: {
            select: {
              id: true,
              name: true,
              statusInicial: true,
              client: { select: { id: true, name: true } },
            },
          },
          ticket: {
            select: {
              id: true,
              code: true,
              title: true,
              type: true,
              parentTicketId: true,
            },
          },
          activity: { select: { id: true, name: true } },
          // Relatórios não precisam de avatar; isso pode vir como data URL (base64) e explodir o payload.
          user: isGestaoHorasReport
            ? { select: { id: true, name: true } }
            : { select: { id: true, name: true, avatarUrl: true } },
        };
      }
    } else {
      baseQuery.include = {
        project: { include: { client: true } },
        ticket: true,
        activity: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      };
    }

    const entries = await prisma.timeEntry.findMany(baseQuery);

    // Para o relatório de Gestão de Horas (modo light), se o cliente não pediu explicitamente,
    // devolvemos somente um preview truncado no campo `description` (para manter compatibilidade do payload).
    if (isLight && omitDescriptionForReport && Array.isArray(entries)) {
      const PREVIEW_LEN = 120;
      for (const e of entries as any[]) {
        const raw = typeof e?.description === "string" ? e.description : "";
        const trimmed = raw.trim();
        if (!trimmed) {
          e.description = null;
          continue;
        }
        e.description =
          trimmed.length > PREVIEW_LEN ? `${trimmed.slice(0, PREVIEW_LEN).trimEnd()}…` : trimmed;
      }
    }
    
    devDebugLog(DEBUG_TIME_ENTRIES, `Encontrados ${entries.length} apontamentos`);
    if (take > 0) {
      const nextCursor = entries.length === take ? String((entries as any)[entries.length - 1]?.id ?? "") : "";
      res.json({ items: entries, nextCursor: nextCursor || null });
      return;
    }
    res.json(entries);
  } catch (error) {
    console.error("Erro ao buscar apontamentos:", errorSummary(error));
    res.status(500).json({ error: "Erro ao buscar apontamentos" });
  }
});

timeEntriesRouter.post("/", async (req, res) => {
  try {
  const user = (req as Request & { user: { id: string; tenantId: string; permitirMaisHoras?: boolean; limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null; permitirOutroPeriodo?: boolean | null; permitirFimDeSemana?: boolean | null } }).user;
    if ((req as Request & { user: { role?: string } }).user.role === "CLIENTE") {
      res.status(403).json({ error: "Cliente não pode criar apontamentos." });
      return;
    }
    const {
      date,
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
      description,
      projectId,
      ticketId,
      activityId,
    } = req.body;

    devDebugLog(DEBUG_TIME_ENTRIES, "POST /api/time-entries - Dados recebidos:", {
      date,
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
      projectId,
      ticketId,
      userId: user.id,
    });

    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Nova requisição de apontamento", {
      date,
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
      projectId,
      ticketId,
      userId: user.id,
    });

    if (!date || !horaInicio || !horaFim || !projectId) {
      res.status(400).json({
        error: "Data, hora início, hora fim e projeto são obrigatórios",
      });
      return;
    }
    if (!isValidTimeHHMM(horaInicio) || !isValidTimeHHMM(horaFim)) {
      res.status(400).json({ error: "Hora início e hora fim devem estar no formato HH:MM (00:00 a 23:59)." });
      return;
    }
    if ((intervaloInicio && !intervaloFim) || (!intervaloInicio && intervaloFim)) {
      // Mantém mensagem específica para intervalo incompleto
      // (a validação detalhada acontece mais abaixo).
    } else if (intervaloInicio && intervaloFim) {
      if (!isValidTimeHHMM(intervaloInicio) || !isValidTimeHHMM(intervaloFim)) {
        res.status(400).json({ error: "Intervalo início e fim devem estar no formato HH:MM (00:00 a 23:59)." });
        return;
      }
    }
  if (description && String(description).length > 800) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Bloqueado: descrição > 800 caracteres", {
      length: String(description).length,
    });
    res.status(400).json({ error: "Descrição deve ter no máximo 800 caracteres" });
    return;
  }

  // Regra global: ninguém pode apontar horas em data futura (comparação por AAAA-MM-DD em horário local, sem parse UTC)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = formatYmdLocal(today);
  const entryStr = String(date);
  const entryYmd = entryStr.length >= 10 ? entryStr.slice(0, 10) : formatYmdLocal(new Date(entryStr));
  if (entryYmd > todayYmd) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Bloqueado: data futura", { entryYmd, todayYmd });
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  if (isOutsideCurrentMonth(entryYmd, todayYmd)) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Bloqueado: fora do mês atual", { entryYmd, todayYmd });
    res.status(400).json({ error: getOutsideCurrentMonthMessage() });
    return;
  }

  const maxPastDays = getMaxPastDaysFromUser(user);
  const entryDate = new Date(entryYmd + "T00:00:00");
  const entryWeekday = entryDate.getDay();
  const isWeekend = entryWeekday === 0 || entryWeekday === 6;
  const isHoliday = await isTenantHoliday(user.tenantId, entryYmd);

  // Limite diário = 0: dia não apontável (nem com permissão)
  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    entryDate
  );
  if (dailyLimitForDay === 0) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Bloqueado: limite diário 0 para o dia", {
      entryYmd,
      userId: user.id,
    });
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  const spanResult = calcSameDayApontamentoMinutes(
    horaInicio,
    horaFim,
    intervaloInicio,
    intervaloFim,
  );
  if (spanResult.ok === false) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][POST] Bloqueado: horários inválidos", {
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
      error: spanResult.error,
    });
    res.status(400).json({ error: spanResult.error });
    return;
  }
  const total = spanResult.totalMinutes / 60;

  const storedEntryDatePreview = storedDateFromApontamentoDateInput(date);
  const dayTotalMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(user.id, storedEntryDatePreview);
  const dailyLimit = getDailyLimitFromUser(user, date);
  const { willExceedByEntry, willExceedByDay } = computeDailyLimitViolation({
    dailyLimitHours: dailyLimit,
    dayTotalMinutes,
    entryTotalMinutes: spanResult.totalMinutes,
  });
  const modo = normalizeApontamentoViolacaoModo((user as any).violacaoApontamentoModo);
  const violations = detectApontamentoViolations({
    permitirMaisHoras: user.permitirMaisHoras,
    permitirFimDeSemana: user.permitirFimDeSemana,
    permitirOutroPeriodo: user.permitirOutroPeriodo,
    entryYmd,
    todayYmd,
    maxPastDays,
    violacaoModo: modo,
    isWeekend,
    isHoliday,
    willExceedByEntry,
    willExceedByDay,
  });
  const violationAction = resolveApontamentoViolations({ modo, violations });
  if (violationAction === "BLOCK") {
    res.status(400).json({ error: getViolationBlockMessage(violations[0]) });
    return;
  }
  if (violationAction === "APPROVAL") {
    res.status(400).json({
      error:
        "Este apontamento precisa de aprovação. Envie uma solicitação em Permissões antes de registrar as horas.",
      requiresApproval: true,
    });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    select: { id: true, statusInicial: true },
  });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  const statusProjeto = String(project.statusInicial ?? "").toUpperCase();
  const normalized =
    statusProjeto === "ATIVO" || statusProjeto === "ENCERRADO" || statusProjeto === "EM_ESPERA"
      ? statusProjeto
      : statusProjeto === "EM_ANDAMENTO"
        ? "ATIVO"
        : statusProjeto === "PLANEJADO"
          ? "EM_ESPERA"
          : statusProjeto === "CONCLUIDO"
            ? "ENCERRADO"
            : statusProjeto;
  if (normalized !== "ATIVO") {
    res.status(400).json({ error: "O status do projeto não permite apontamento de horas" });
    return;
  }

    const storedEntryDate = storedDateFromApontamentoDateInput(date);

    const entry = await prisma.timeEntry.create({
      data: {
        date: storedEntryDate,
        horaInicio,
        horaFim,
        intervaloInicio: intervaloInicio || null,
        intervaloFim: intervaloFim || null,
        totalHoras: total,
        description: description || null,
        userId: user.id,
        projectId,
        ticketId: ticketId || null,
        activityId: activityId || null,
      },
      include: {
        project: { include: { client: true } },
        ticket: true,
        activity: true,
        user: { select: { id: true, name: true } },
      },
    });
    
    // Registrar no histórico se for um apontamento de tarefa
    if (ticketId) {
      await prisma.ticketHistory.create({
        data: {
          ticketId,
          userId: user.id,
          action: "TIME_ENTRY_ADDED",
          field: null,
          oldValue: null,
          newValue: String(total),
          details: `Apontamento de ${total}h registrado para ${storedEntryDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        },
      });
    }
    
    devDebugLog(DEBUG_TIME_ENTRIES, "Apontamento criado com sucesso:", entry.id, "ticketId:", entry.ticketId);

    void notifyProjectResponsibleOfApontamento({
      tenantId: user.tenantId,
      projectId: entry.projectId,
      ticketId: entry.ticketId,
      apontadorUserId: user.id,
      entryDate: entry.date,
      totalHoras: total,
      description: description || null,
    });

    res.json(entry);
  } catch (error) {
    console.error("Erro ao criar apontamento:", errorSummary(error));
    res.status(500).json({ error: "Erro ao criar apontamento" });
  }
});

timeEntriesRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string; permitirMaisHoras?: boolean; limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null; permitirOutroPeriodo?: boolean | null } }).user;
  if (user.role === "CLIENTE") {
    res.status(403).json({ error: "Cliente não pode editar apontamentos." });
    return;
  }
  const { id } = req.params;
  const {
    date,
    horaInicio,
    horaFim,
    intervaloInicio,
    intervaloFim,
    description,
    projectId,
    ticketId,
    activityId,
  } = req.body;

  const existing = await prisma.timeEntry.findFirst({
    where: { id },
    include: { project: { include: { client: true } } },
  });
  if (!existing || existing.project.client.tenantId !== user.tenantId) {
    res.status(404).json({ error: "Apontamento não encontrado" });
    return;
  }
  const canEdit =
    existing.userId === user.id || user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canEdit) {
    res.status(403).json({ error: "Sem permissão para editar este apontamento" });
    return;
  }
  if (description !== undefined && description != null && String(description).length > 800) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][PATCH] Bloqueado: descrição > 800 caracteres", {
      length: String(description).length,
      id,
    });
    res.status(400).json({ error: "Descrição deve ter no máximo 800 caracteres" });
    return;
  }

  // Regra global: ninguém pode deixar o apontamento em data futura (comparação por AAAA-MM-DD em horário local)
  const effectiveDateForRules = date != null ? storedDateFromApontamentoDateInput(date) : existing.date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = formatYmdLocal(today);
  const entryYmd = formatYmdLocal(effectiveDateForRules as Date);
  if (entryYmd > todayYmd) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][PATCH] Bloqueado: data futura", {
      id,
      entryYmd,
      todayYmd,
    });
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  if (isOutsideCurrentMonth(entryYmd, todayYmd)) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][PATCH] Bloqueado: fora do mês atual", {
      id,
      entryYmd,
      todayYmd,
    });
    res.status(400).json({ error: getOutsideCurrentMonthMessage() });
    return;
  }

  const maxPastDays = getMaxPastDaysFromUser(user);
  const effectiveYmd = entryYmd;
  const effectiveWeekday = (effectiveDateForRules as Date).getDay();
  const effectiveIsWeekend = effectiveWeekday === 0 || effectiveWeekday === 6;
  const effectiveIsHoliday = await isTenantHoliday(user.tenantId, effectiveYmd);

  const payload: Record<string, unknown> = {};
  if (date != null) payload.date = storedDateFromApontamentoDateInput(date);
  if (horaInicio != null) payload.horaInicio = horaInicio;
  if (horaFim != null) payload.horaFim = horaFim;
  if (intervaloInicio !== undefined) payload.intervaloInicio = intervaloInicio || null;
  if (intervaloFim !== undefined) payload.intervaloFim = intervaloFim || null;
  if (description !== undefined) payload.description = description || null;
  if (projectId != null) payload.projectId = projectId;
  if (ticketId !== undefined) payload.ticketId = ticketId || null;
  if (activityId !== undefined) payload.activityId = activityId || null;

  const hInicio = payload.horaInicio ?? existing.horaInicio;
  const hFim = payload.horaFim ?? existing.horaFim;
  // `??` não serve: null explícito no body deve limpar intervalo (não reaproveitar o existente).
  const intIni =
    intervaloInicio !== undefined ? (intervaloInicio ? String(intervaloInicio) : null) : existing.intervaloInicio;
  const intFim =
    intervaloFim !== undefined ? (intervaloFim ? String(intervaloFim) : null) : existing.intervaloFim;

  if (!isValidTimeHHMM(String(hInicio)) || !isValidTimeHHMM(String(hFim))) {
    res.status(400).json({ error: "Hora início e hora fim devem estar no formato HH:MM (00:00 a 23:59)." });
    return;
  }
  if ((intIni && !intFim) || (!intIni && intFim)) {
    // Validação detalhada do intervalo já trata este caso com mensagem própria abaixo.
  } else if (intIni && intFim) {
    if (!isValidTimeHHMM(String(intIni)) || !isValidTimeHHMM(String(intFim))) {
      res.status(400).json({ error: "Intervalo início e fim devem estar no formato HH:MM (00:00 a 23:59)." });
      return;
    }
  }

  const spanResult = calcSameDayApontamentoMinutes(
    String(hInicio),
    String(hFim),
    intIni as string | null | undefined,
    intFim as string | null | undefined,
  );
  if (spanResult.ok === false) {
    devDebugLog(DEBUG_TIME_ENTRIES, "[TIME-ENTRIES][PATCH] Bloqueado: horários inválidos", {
      id,
      horaInicio: String(hInicio),
      horaFim: String(hFim),
      intervaloInicio: String(intIni ?? ""),
      intervaloFim: String(intFim ?? ""),
      error: spanResult.error,
    });
    res.status(400).json({ error: spanResult.error });
    return;
  }
  const total = spanResult.totalMinutes / 60;

  const effectiveDateForLimit = payload.date ?? existing.date;
  const dayTotalMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(user.id, effectiveDateForLimit as Date, {
    excludeEntryId: existing.id,
  });
  const dailyLimit = getDailyLimitFromUser(user, effectiveDateForLimit as Date);
  const { willExceedByEntry, willExceedByDay } = computeDailyLimitViolation({
    dailyLimitHours: dailyLimit,
    dayTotalMinutes,
    entryTotalMinutes: spanResult.totalMinutes,
  });
  const modo = normalizeApontamentoViolacaoModo((user as any).violacaoApontamentoModo);
  const violations = detectApontamentoViolations({
    permitirMaisHoras: user.permitirMaisHoras,
    permitirFimDeSemana: user.permitirFimDeSemana,
    permitirOutroPeriodo: user.permitirOutroPeriodo,
    entryYmd: effectiveYmd,
    todayYmd,
    maxPastDays,
    violacaoModo: modo,
    isWeekend: effectiveIsWeekend,
    isHoliday: effectiveIsHoliday,
    willExceedByEntry,
    willExceedByDay,
  });
  const violationAction = resolveApontamentoViolations({ modo, violations });
  if (violationAction === "BLOCK") {
    res.status(400).json({ error: getViolationBlockMessage(violations[0]) });
    return;
  }
  if (violationAction === "APPROVAL") {
    res.status(400).json({
      error:
        "Este apontamento precisa de aprovação. Envie uma solicitação em Permissões antes de registrar as horas.",
      requiresApproval: true,
    });
    return;
  }

  payload.totalHoras = total;

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, client: { tenantId: user.tenantId } },
      select: { id: true, statusInicial: true },
    });
    if (!project) {
      res.status(404).json({ error: "Projeto não encontrado" });
      return;
    }
    const st = String(project.statusInicial ?? "").toUpperCase();
    const normalized =
      st === "ATIVO" || st === "ENCERRADO" || st === "EM_ESPERA"
        ? st
        : st === "EM_ANDAMENTO"
          ? "ATIVO"
          : st === "PLANEJADO"
            ? "EM_ESPERA"
            : st === "CONCLUIDO"
              ? "ENCERRADO"
              : st;
    if (normalized !== "ATIVO") {
      res.status(400).json({ error: "O status do projeto não permite apontamento de horas" });
      return;
    }
  } else {
    // Mesmo sem troca de projeto, bloqueia edição quando o projeto do apontamento está inativo
    const st = String(existing.project.statusInicial ?? "").toUpperCase();
    const normalized =
      st === "ATIVO" || st === "ENCERRADO" || st === "EM_ESPERA"
        ? st
        : st === "EM_ANDAMENTO"
          ? "ATIVO"
          : st === "PLANEJADO"
            ? "EM_ESPERA"
            : st === "CONCLUIDO"
              ? "ENCERRADO"
              : st;
    if (normalized !== "ATIVO") {
      res.status(400).json({ error: "O status do projeto não permite apontamento de horas" });
      return;
    }
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: payload,
    include: {
      project: { include: { client: true } },
      ticket: true,
      activity: true,
      user: { select: { id: true, name: true } },
    },
  });
  
  // Registrar no histórico se for um apontamento de tarefa
  if (entry.ticketId) {
    await prisma.ticketHistory.create({
      data: {
        ticketId: entry.ticketId,
        userId: user.id,
        action: "TIME_ENTRY_EDITED",
        field: null,
        oldValue: String(existing.totalHoras),
        newValue: String(total),
        details: `Apontamento editado: ${existing.totalHoras}h → ${total}h`,
      },
    });
  }

  res.json(entry);
});

timeEntriesRouter.delete("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  if (user.role === "CLIENTE") {
    res.status(403).json({ error: "Cliente não pode excluir apontamentos." });
    return;
  }
  const { id } = req.params;

  const existing = await prisma.timeEntry.findFirst({
    where: { id },
    include: { project: { include: { client: true } } },
  });
  if (!existing || existing.project.client.tenantId !== user.tenantId) {
    res.status(404).json({ error: "Apontamento não encontrado" });
    return;
  }
  const canDelete =
    existing.userId === user.id || user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canDelete) {
    res.status(403).json({ error: "Sem permissão para excluir este apontamento" });
    return;
  }
  const st = String(existing.project.statusInicial ?? "").toUpperCase();
  const normalized =
    st === "ATIVO" || st === "ENCERRADO" || st === "EM_ESPERA"
      ? st
      : st === "EM_ANDAMENTO"
        ? "ATIVO"
        : st === "PLANEJADO"
          ? "EM_ESPERA"
          : st === "CONCLUIDO"
            ? "ENCERRADO"
            : st;
  if (normalized !== "ATIVO") {
    res.status(400).json({ error: "O status do projeto não permite apontamento de horas" });
    return;
  }

  const ticketId = existing.ticketId;
  
  await prisma.timeEntry.delete({ where: { id } });
  
  // Registrar no histórico se for um apontamento de tarefa
  if (ticketId) {
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "TIME_ENTRY_DELETED",
        field: null,
        oldValue: String(existing.totalHoras),
        newValue: null,
        details: `Apontamento de ${existing.totalHoras}h removido`,
      },
    });
  }
  
  res.status(204).send();
});
