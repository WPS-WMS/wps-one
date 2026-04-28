import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { getDailyLimitFromUser, sumTimeEntryHoursForUserOnStoredUtcDay } from "../lib/timeEntryLimits.js";
import { notifyGestoresIfApontamentoExcedeuLimiteDiario } from "../lib/timeEntryEmailNotifications.js";

export const timeEntriesRouter = Router();
timeEntriesRouter.use(authMiddleware);
// Cliente precisa visualizar apontamentos nas tarefas, mas não pode criar/editar/excluir.
// A feature "apontamentos" continua obrigatória para operações internas e visões agregadas.
timeEntriesRouter.use((req, res, next) => {
  const user = (req as Request & { user?: { role?: string } }).user;
  const role = String(user?.role ?? "").trim().toUpperCase();
  const isCliente = role === "CLIENTE";
  if (isCliente && req.method === "GET") return next();
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

function getMaxPastDaysFromUser(user: {
  diasPermitidos?: string | null;
  permitirOutroPeriodo?: boolean | null;
}): number {
  // Se o usuário NÃO tem permissão para apontar em outro período,
  // ele só pode apontar na data de hoje (0 dias para trás).
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

function parseHours(h: string): number {
  const [hh, mm] = String(h || "0").split(":").map(Number);
  return (hh || 0) + (mm || 0) / 60;
}

timeEntriesRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { userId, start, end, projectId, ticketId, view, aggregateBy, limit, cursorId, light, report, includeDescription } = req.query;

    console.log("GET /api/time-entries - Query params:", {
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
      userRole: user.role,
    });

    const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
    let where: Record<string, unknown> = {};
    
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
        console.log("Ticket não encontrado ou não pertence ao tenant:", ticketId);
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
      console.log("Buscando apontamentos para ticketId:", ticketId);
    } else if (
      // Visão agregada por projeto (todas as pessoas) para ADMIN / GESTOR
      projectId &&
      (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS") &&
      view === "project"
    ) {
      where = { ...tenantFilter, projectId: String(projectId) };
      console.log("Buscando apontamentos do projeto (visão agregada):", projectId);
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
      // - SUPER_ADMIN / GESTOR_PROJETOS: se não houver userId, pode ver todos (tenant); se houver, filtra pelo usuário
      // - Demais perfis: sempre filtra pelo próprio usuário
      const isAdminViewer = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
      if (isAdminViewer) {
        where = { ...tenantFilter };
        if (userId) where.userId = String(userId);
      } else {
        where = { ...tenantFilter, userId: user.id };
      }
    }
    if (start && end) {
      where.date = { gte: new Date(String(start)), lte: new Date(String(end)) };
    }
    if (projectId && !ticketId && !(view === "project" && (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS"))) {
      // Filtro adicional por projeto quando não estamos na visão agregada de projeto
      where.projectId = projectId;
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
    const isAdminViewer = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
    const isBroadAdminQuery =
      isAdminViewer &&
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
      baseQuery.select = {
        id: true,
        date: true,
        horaInicio: true,
        horaFim: true,
        intervaloInicio: true,
        intervaloFim: true,
        totalHoras: true,
        ...(omitDescriptionForReport ? {} : { description: true }),
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
    } else {
      baseQuery.include = {
        project: { include: { client: true } },
        ticket: true,
        activity: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      };
    }

    const entries = await prisma.timeEntry.findMany(baseQuery);
    
    console.log(`Encontrados ${entries.length} apontamentos`);
    if (take > 0) {
      const nextCursor = entries.length === take ? String((entries as any)[entries.length - 1]?.id ?? "") : "";
      res.json({ items: entries, nextCursor: nextCursor || null });
      return;
    }
    res.json(entries);
  } catch (error) {
    console.error("Erro ao buscar apontamentos:", error);
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

    console.log("POST /api/time-entries - Dados recebidos:", {
      date,
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
      projectId,
      ticketId,
      userId: user.id,
    });

    console.log("[TIME-ENTRIES][POST] Nova requisição de apontamento", {
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
  if (description && String(description).length > 800) {
    console.log("[TIME-ENTRIES][POST] Bloqueado: descrição > 800 caracteres", {
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
    console.log("[TIME-ENTRIES][POST] Bloqueado: data futura", { entryYmd, todayYmd });
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  // Regra adicional: respeitar janela de dias permitidos para apontamento (sempre datas ANTERIORES)
  const maxPastDays = getMaxPastDaysFromUser(user);
  const entryDate = new Date(entryYmd + "T00:00:00");
  const diffMs = today.getTime() - entryDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > maxPastDays) {
    console.log("[TIME-ENTRIES][POST] Bloqueado: fora da janela de diasPermitidos", {
      entryYmd,
      todayYmd,
      diffDays,
      maxPastDays,
      raw: user.diasPermitidos,
    });
    res.status(400).json({
      error:
        maxPastDays === 0
          ? "Você só pode apontar horas na data de hoje."
          : `Você só pode apontar horas até ${maxPastDays} dia(s) para trás.`,
    });
    return;
  }

  // Regra: finais de semana e feriados exigem permissão explícita no usuário (permitirFimDeSemana).
  const entryWeekday = entryDate.getDay(); // 0 = domingo, 6 = sábado
  const isWeekend = entryWeekday === 0 || entryWeekday === 6;
  const isHoliday = await isTenantHoliday(user.tenantId, entryYmd);
  if ((isWeekend || isHoliday) && !user.permitirFimDeSemana) {
    console.log("[TIME-ENTRIES][POST] Bloqueado: final de semana/feriado sem permissão", {
      entryYmd,
      userId: user.id,
      isWeekend,
      isHoliday,
      permitirFimDeSemana: user.permitirFimDeSemana,
    });
    res.status(403).json({
      error:
        "Você não tem permissão para apontar horas em finais de semana ou feriados. Solicite liberação ao administrador.",
    });
    return;
  }

  // Limite diário = 0: dia não apontável (nem com permissão)
  const dailyLimitForDay = getDailyLimitFromUser(
    { limiteHorasDiarias: user.limiteHorasDiarias ?? null, limiteHorasPorDia: user.limiteHorasPorDia ?? null },
    entryDate
  );
  if (dailyLimitForDay === 0) {
    console.log("[TIME-ENTRIES][POST] Bloqueado: limite diário 0 para o dia", {
      entryYmd,
      userId: user.id,
    });
    res.status(400).json({
      error:
        "Você não pode apontar horas neste dia, pois o limite diário para este dia está configurado como 0. Ajuste o limite diário ou escolha outro dia.",
    });
    return;
  }

  // Validação de intervalo: se informado, deve estar dentro do horário apontado
  const startHours = parseHours(horaInicio);
  const endHours = parseHours(horaFim);
  if ((intervaloInicio && !intervaloFim) || (!intervaloInicio && intervaloFim)) {
    console.log("[TIME-ENTRIES][POST] Bloqueado: intervalo incompleto", {
      horaInicio,
      horaFim,
      intervaloInicio,
      intervaloFim,
    });
    res
      .status(400)
      .json({ error: "Preencha início e fim do intervalo ou deixe ambos em branco." });
    return;
  }
  if (intervaloInicio && intervaloFim) {
    const intervalStart = parseHours(intervaloInicio);
    const intervalEnd = parseHours(intervaloFim);
    if (intervalStart >= intervalEnd) {
      console.log("[TIME-ENTRIES][POST] Bloqueado: intervalo início >= fim", {
        horaInicio,
        horaFim,
        intervaloInicio,
        intervaloFim,
        intervalStart,
        intervalEnd,
      });
      res
        .status(400)
        .json({ error: "Horário de início do intervalo deve ser menor que o fim do intervalo." });
      return;
    }
    if (intervalStart < startHours || intervalEnd > endHours) {
      console.log("[TIME-ENTRIES][POST] Bloqueado: intervalo fora do período apontado", {
        horaInicio,
        horaFim,
        intervaloInicio,
        intervaloFim,
        startHours,
        endHours,
        intervalStart,
        intervalEnd,
      });
      res.status(400).json({
        error:
          "O intervalo deve estar totalmente dentro do período apontado (entre a hora de início e a hora de fim).",
      });
      return;
    }
  }

  let total = parseHours(horaFim) - parseHours(horaInicio);
  if (intervaloInicio && intervaloFim) {
    total -= parseHours(intervaloFim) - parseHours(intervaloInicio);
  }
  if (total <= 0) {
    res.status(400).json({ error: "Total de horas deve ser positivo" });
    return;
  }

  // Regra: usuários sem permissão não podem registrar mais do que o limite diário em um único apontamento
  const dailyLimit = getDailyLimitFromUser(user, date);
  if (!user.permitirMaisHoras && total > dailyLimit) {
    res.status(400).json({
      error:
        `Este apontamento excede o limite de ${dailyLimit} horas permitido para o seu usuário e precisa de aprovação do Administrador ou Gestor de Projetos.`,
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

    const entry = await prisma.timeEntry.create({
      data: {
        date: new Date(date),
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
          details: `Apontamento de ${total}h registrado para ${new Date(date).toLocaleDateString("pt-BR")}`,
        },
      });
    }
    
    console.log("Apontamento criado com sucesso:", entry.id, "ticketId:", entry.ticketId);

    const sumAfter = await sumTimeEntryHoursForUserOnStoredUtcDay(user.id, entry.date);
    const sumBefore = sumAfter - total;
    void notifyGestoresIfApontamentoExcedeuLimiteDiario({
      tenantId: user.tenantId,
      projectId: entry.projectId,
      apontadorUserId: user.id,
      entryDate: entry.date,
      totalHorasNoDiaAgora: sumAfter,
      totalHorasNoDiaAntes: sumBefore,
    });

    res.json(entry);
  } catch (error) {
    console.error("Erro ao criar apontamento:", error);
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
    console.log("[TIME-ENTRIES][PATCH] Bloqueado: descrição > 800 caracteres", {
      length: String(description).length,
      id,
    });
    res.status(400).json({ error: "Descrição deve ter no máximo 800 caracteres" });
    return;
  }

  // Regra global: ninguém pode deixar o apontamento em data futura (comparação por AAAA-MM-DD em horário local)
  const effectiveDateForRules = date != null ? new Date(date) : existing.date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = formatYmdLocal(today);
  const entryYmd = formatYmdLocal(effectiveDateForRules as Date);
  if (entryYmd > todayYmd) {
    console.log("[TIME-ENTRIES][PATCH] Bloqueado: data futura", {
      id,
      entryYmd,
      todayYmd,
    });
    res.status(400).json({ error: "Não é permitido apontar horas em datas futuras." });
    return;
  }

  // Janela de dias permitidos também se aplica em edições
  const maxPastDays = getMaxPastDaysFromUser(user);
  const diffMs = today.getTime() - (effectiveDateForRules as Date).setHours(0, 0, 0, 0);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > maxPastDays) {
    console.log("[TIME-ENTRIES][PATCH] Bloqueado: fora da janela de diasPermitidos", {
      id,
      entryYmd,
      todayYmd,
      diffDays,
      maxPastDays,
      raw: user.diasPermitidos,
    });
    res.status(400).json({
      error:
        maxPastDays === 0
          ? "Você só pode apontar horas na data de hoje."
          : `Você só pode apontar horas até ${maxPastDays} dia(s) para trás.`,
    });
    return;
  }

  // Regra: finais de semana e feriados exigem permissão explícita no usuário (permitirFimDeSemana).
  // Em PATCH, se o usuário estiver alterando a data para um final de semana/feriado, deve ser bloqueado.
  // Também bloqueia se o apontamento já estiver nessa condição e o usuário não tiver permissão.
  const effectiveYmd = formatYmdLocal(effectiveDateForRules as Date);
  const effectiveWeekday = (effectiveDateForRules as Date).getDay();
  const effectiveIsWeekend = effectiveWeekday === 0 || effectiveWeekday === 6;
  const effectiveIsHoliday = await isTenantHoliday(user.tenantId, effectiveYmd);
  const permitirFimDeSemana = (user as any).permitirFimDeSemana;
  if ((effectiveIsWeekend || effectiveIsHoliday) && !permitirFimDeSemana) {
    console.log("[TIME-ENTRIES][PATCH] Bloqueado: final de semana/feriado sem permissão", {
      id,
      effectiveYmd,
      userId: user.id,
      effectiveIsWeekend,
      effectiveIsHoliday,
      permitirFimDeSemana,
    });
    res.status(403).json({
      error:
        "Você não tem permissão para apontar horas em finais de semana ou feriados. Solicite liberação ao administrador.",
    });
    return;
  }

  const payload: Record<string, unknown> = {};
  if (date != null) payload.date = new Date(date);
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
  const intIni = payload.intervaloInicio ?? existing.intervaloInicio;
  const intFim = payload.intervaloFim ?? existing.intervaloFim;

  // Validação de intervalo: se informado, deve estar dentro do horário apontado
  const startHours = parseHours(String(hInicio));
  const endHours = parseHours(String(hFim));
  if ((intIni && !intFim) || (!intIni && intFim)) {
    console.log("[TIME-ENTRIES][PATCH] Bloqueado: intervalo incompleto", {
      id,
      horaInicio: String(hInicio),
      horaFim: String(hFim),
      intervaloInicio: String(intIni ?? ""),
      intervaloFim: String(intFim ?? ""),
    });
    res
      .status(400)
      .json({ error: "Preencha início e fim do intervalo ou deixe ambos em branco." });
    return;
  }
  if (intIni && intFim) {
    const intervalStart = parseHours(String(intIni));
    const intervalEnd = parseHours(String(intFim));
    if (intervalStart >= intervalEnd) {
      console.log("[TIME-ENTRIES][PATCH] Bloqueado: intervalo início >= fim", {
        id,
        horaInicio: String(hInicio),
        horaFim: String(hFim),
        intervaloInicio: String(intIni),
        intervaloFim: String(intFim),
        intervalStart,
        intervalEnd,
      });
      res
        .status(400)
        .json({ error: "Horário de início do intervalo deve ser menor que o fim do intervalo." });
      return;
    }
    if (intervalStart < startHours || intervalEnd > endHours) {
      console.log("[TIME-ENTRIES][PATCH] Bloqueado: intervalo fora do período apontado", {
        id,
        horaInicio: String(hInicio),
        horaFim: String(hFim),
        intervaloInicio: String(intIni),
        intervaloFim: String(intFim),
        startHours,
        endHours,
        intervalStart,
        intervalEnd,
      });
      res.status(400).json({
        error:
          "O intervalo deve estar totalmente dentro do período apontado (entre a hora de início e a hora de fim).",
      });
      return;
    }
  }

  let total = parseHours(String(hFim)) - parseHours(String(hInicio));
  if (intIni && intFim) {
    total -= parseHours(String(intFim)) - parseHours(String(intIni));
  }
  if (total <= 0) {
    res.status(400).json({ error: "Total de horas deve ser positivo" });
    return;
  }

  // Regra: usuários sem permissão não podem registrar mais do que o limite diário em um único apontamento
  const effectiveDateForLimit = payload.date ?? existing.date;
  const dailyLimit = getDailyLimitFromUser(user, effectiveDateForLimit as Date);
  if (!user.permitirMaisHoras && total > dailyLimit) {
    res.status(400).json({
      error:
        `Este apontamento excede o limite de ${dailyLimit} horas permitido para o seu usuário e precisa de aprovação do Administrador ou Gestor de Projetos.`,
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

  const ymdExisting =
    existing.date instanceof Date
      ? existing.date.toISOString().slice(0, 10)
      : String(existing.date).slice(0, 10);
  const ymdEntry =
    entry.date instanceof Date
      ? entry.date.toISOString().slice(0, 10)
      : String(entry.date).slice(0, 10);
  const sameIsoDay = ymdExisting === ymdEntry;
  const sumAfter = await sumTimeEntryHoursForUserOnStoredUtcDay(existing.userId, entry.date);
  const totalAntes = sameIsoDay ? sumAfter - total + existing.totalHoras : sumAfter - total;
  void notifyGestoresIfApontamentoExcedeuLimiteDiario({
    tenantId: user.tenantId,
    projectId: entry.projectId,
    apontadorUserId: existing.userId,
    entryDate: entry.date,
    totalHorasNoDiaAgora: sumAfter,
    totalHorasNoDiaAntes: totalAntes,
  });

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
