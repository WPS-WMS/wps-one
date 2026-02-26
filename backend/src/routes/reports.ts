import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

function getWorkingDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  while (d <= endDate) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** GET /api/reports/hours?start=&end=&groupBy=user|project|client&userId=&projectId=&clientId= */
reportsRouter.get("/hours", async (req, res) => {
  try {
    const user = req.user;
    const { start, end, groupBy, userId, projectId, clientId } = req.query;
    const tenantFilter = { project: { client: { tenantId: user.tenantId } } };

    const startDate = start ? new Date(String(start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(String(end)) : new Date();

    let where: Record<string, unknown> = {
      ...tenantFilter,
      date: { gte: startDate, lte: endDate },
    };
    if (userId && (user.role === "ADMIN" || user.role === "GESTOR_PROJETOS")) where.userId = String(userId);
    if (projectId) where.projectId = String(projectId);
    if (clientId) where.project = { clientId: String(clientId), client: { tenantId: user.tenantId } };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
    });

    const group = (groupBy as string) || "none";
    const totalHours = entries.reduce((s, e) => s + (e.totalHoras || 0), 0);

    if (group === "user") {
      const byUser = new Map<string, { id: string; name: string; hours: number; count: number }>();
      for (const e of entries) {
        const u = e.user;
        const cur = byUser.get(u.id) || { id: u.id, name: u.name, hours: 0, count: 0 };
        cur.hours += e.totalHoras || 0;
        cur.count += 1;
        byUser.set(u.id, cur);
      }
      const groups = Array.from(byUser.values()).map((g) => ({ ...g, totalHours: g.hours }));
      return res.json({ groups, totalHours });
    }
    if (group === "project") {
      const byProject = new Map<string, { id: string; name: string; hours: number; count: number }>();
      for (const e of entries) {
        const p = e.project;
        const cur = byProject.get(p.id) || { id: p.id, name: p.name, hours: 0, count: 0 };
        cur.hours += e.totalHoras || 0;
        cur.count += 1;
        byProject.set(p.id, cur);
      }
      const groups = Array.from(byProject.values()).map((g) => ({ ...g, totalHours: g.hours }));
      return res.json({ groups, totalHours });
    }
    if (group === "client") {
      const byClient = new Map<string, { id: string; name: string; hours: number; count: number }>();
      for (const e of entries) {
        const c = e.project.client;
        const cur = byClient.get(c.id) || { id: c.id, name: c.name, hours: 0, count: 0 };
        cur.hours += e.totalHoras || 0;
        cur.count += 1;
        byClient.set(c.id, cur);
      }
      const groups = Array.from(byClient.values()).map((g) => ({ ...g, totalHours: g.hours }));
      return res.json({ groups, totalHours });
    }

    return res.json({ entries: entries.length, totalHours });
  } catch (err) {
    console.error("GET /api/reports/hours error:", err);
    res.status(500).json({ error: "Erro ao gerar relatório de horas" });
  }
});

/** GET /api/reports/utilization?start=&end= - horas por consultor vs capacidade */
reportsRouter.get("/utilization", async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
      return res.status(403).json({ error: "Não autorizado" });
    }
    const { start, end } = req.query;
    const startDate = start ? new Date(String(start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(String(end)) : new Date();

    const consultants = await prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { in: ["CONSULTOR", "GESTOR_PROJETOS"] } },
      select: { id: true, name: true, cargaHorariaSemanal: true },
    });

    const entries = await prisma.timeEntry.findMany({
      where: {
        project: { client: { tenantId: user.tenantId } },
        date: { gte: startDate, lte: endDate },
        userId: { in: consultants.map((c) => c.id) },
      },
      select: { userId: true, totalHoras: true },
    });

    const workingDays = getWorkingDaysBetween(startDate, endDate);
    const hoursByUser = new Map<string, number>();
    for (const e of entries) {
      hoursByUser.set(e.userId, (hoursByUser.get(e.userId) || 0) + (e.totalHoras || 0));
    }

    const list = consultants.map((c) => {
      const carga = c.cargaHorariaSemanal ?? 40;
      const dailyHours = carga / 5;
      const expectedHours = workingDays * dailyHours;
      const workedHours = hoursByUser.get(c.id) || 0;
      const utilization = expectedHours > 0 ? Math.round((workedHours / expectedHours) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        cargaHorariaSemanal: carga,
        workedHours: Math.round(workedHours * 100) / 100,
        expectedHours: Math.round(expectedHours * 100) / 100,
        utilization,
      };
    });

    return res.json({ list, workingDays });
  } catch (err) {
    console.error("GET /api/reports/utilization error:", err);
    res.status(500).json({ error: "Erro ao gerar relatório de utilização" });
  }
});

/** GET /api/reports/tickets?start=&end=&projectId= - contagem por status */
reportsRouter.get("/tickets", async (req, res) => {
  try {
    const user = req.user;
    const { start, end, projectId } = req.query;
    const where: Record<string, unknown> = { project: { client: { tenantId: user.tenantId } } };
    if (projectId) where.projectId = String(projectId);
    if (start && end) {
      where.createdAt = {
        gte: new Date(String(start)),
        lte: new Date(String(end)),
      };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: { id: true, status: true },
    });

    const byStatus: Record<string, number> = {};
    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    }
    const total = tickets.length;
    return res.json({ byStatus, total });
  } catch (err) {
    console.error("GET /api/reports/tickets error:", err);
    res.status(500).json({ error: "Erro ao gerar relatório de chamados" });
  }
});

/** GET /api/reports/export/hours?start=&end=&format=csv - exportação para faturamento (dados para CSV) */
reportsRouter.get("/export/hours", async (req, res) => {
  try {
    const user = req.user;
    const { start, end, userId, projectId, clientId } = req.query;
    const tenantFilter = { project: { client: { tenantId: user.tenantId } } };

    const startDate = start ? new Date(String(start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(String(end)) : new Date();

    let where: Record<string, unknown> = {
      ...tenantFilter,
      date: { gte: startDate, lte: endDate },
    };
    if (userId && (user.role === "ADMIN" || user.role === "GESTOR_PROJETOS")) where.userId = String(userId);
    if (projectId) where.projectId = String(projectId);
    if (clientId) where.project = { clientId: String(clientId), client: { tenantId: user.tenantId } };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { name: true } },
        project: { select: { name: true, client: { select: { name: true } } } },
        activity: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { horaInicio: "asc" }],
    });

    const rows = entries.map((e) => ({
      data: e.date.toISOString().slice(0, 10),
      consultor: e.user.name,
      cliente: e.project.client.name,
      projeto: e.project.name,
      atividade: e.activity?.name ?? "",
      horas: e.totalHoras,
      descricao: e.description ?? "",
    }));

    return res.json({ rows });
  } catch (err) {
    console.error("GET /api/reports/export/hours error:", err);
    res.status(500).json({ error: "Erro ao exportar horas" });
  }
});
