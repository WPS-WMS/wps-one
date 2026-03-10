import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";

export const timeEntriesRouter = Router();
timeEntriesRouter.use(authMiddleware);
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
    return typeof v === "number" && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function parseHours(h: string): number {
  const [hh, mm] = String(h || "0").split(":").map(Number);
  return (hh || 0) + (mm || 0) / 60;
}

timeEntriesRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { userId, start, end, projectId, ticketId, view } = req.query;

    console.log("GET /api/time-entries - Query params:", { userId, start, end, projectId, ticketId, view, userRole: user.role });

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
        select: { id: true },
      });
      
      if (!ticket) {
        console.log("Ticket não encontrado ou não pertence ao tenant:", ticketId);
        res.json([]);
        return;
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
      (user.role === "ADMIN" || user.role === "GESTOR_PROJETOS") &&
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
      const targetUserId =
        (user.role === "ADMIN" || user.role === "GESTOR_PROJETOS") && userId
          ? String(userId)
          : user.id;
      where = { ...tenantFilter, userId: targetUserId };
    }
    if (start && end) {
      where.date = { gte: new Date(String(start)), lte: new Date(String(end)) };
    }
    if (projectId && !ticketId && !(view === "project" && (user.role === "ADMIN" || user.role === "GESTOR_PROJETOS"))) {
      // Filtro adicional por projeto quando não estamos na visão agregada de projeto
      where.projectId = projectId;
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        project: { include: { client: true } },
        ticket: true,
        activity: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { horaInicio: "asc" }],
    });
    
    console.log(`Encontrados ${entries.length} apontamentos`);
    res.json(entries);
  } catch (error) {
    console.error("Erro ao buscar apontamentos:", error);
    res.status(500).json({ error: "Erro ao buscar apontamentos" });
  }
});

timeEntriesRouter.post("/", async (req, res) => {
  try {
  const user = (req as Request & { user: { id: string; tenantId: string; permitirMaisHoras?: boolean; limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null } }).user;
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

    if (!date || !horaInicio || !horaFim || !projectId) {
      res.status(400).json({
        error: "Data, hora início, hora fim e projeto são obrigatórios",
      });
      return;
    }
  if (description && String(description).length > 600) {
    res.status(400).json({ error: "Descrição deve ter no máximo 600 caracteres" });
    return;
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
  });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
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
    res.json(entry);
  } catch (error) {
    console.error("Erro ao criar apontamento:", error);
    res.status(500).json({ error: "Erro ao criar apontamento" });
  }
});

timeEntriesRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string; permitirMaisHoras?: boolean; limiteHorasDiarias?: number | null; limiteHorasPorDia?: string | null } }).user;
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
    existing.userId === user.id || user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canEdit) {
    res.status(403).json({ error: "Sem permissão para editar este apontamento" });
    return;
  }
  if (description !== undefined && description != null && String(description).length > 600) {
    res.status(400).json({ error: "Descrição deve ter no máximo 600 caracteres" });
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

  let total = parseHours(String(hFim)) - parseHours(String(hInicio));
  if (intIni && intFim) {
    total -= parseHours(String(intFim)) - parseHours(String(intIni));
  }
  if (total <= 0) {
    res.status(400).json({ error: "Total de horas deve ser positivo" });
    return;
  }

  // Regra: usuários sem permissão não podem registrar mais do que o limite diário em um único apontamento
  const effectiveDate = payload.date ?? existing.date;
  const dailyLimit = getDailyLimitFromUser(user, effectiveDate as Date);
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
    });
    if (!project) {
      res.status(404).json({ error: "Projeto não encontrado" });
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
    existing.userId === user.id || user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canDelete) {
    res.status(403).json({ error: "Sem permissão para excluir este apontamento" });
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
