import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);
reportsRouter.use(requireFeature("relatorios"));

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
    if (userId && (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS")) where.userId = String(userId);
    if (projectId) where.projectId = String(projectId);
    if (clientId) where.project = { clientId: String(clientId), client: { tenantId: user.tenantId } };

    const group = (groupBy as string) || "none";
    const totalAgg = await prisma.timeEntry.aggregate({
      where,
      _sum: { totalHoras: true },
      _count: { _all: true },
    });
    const totalHours = totalAgg._sum.totalHoras ?? 0;

    if (group === "user") {
      const grouped = await prisma.timeEntry.groupBy({
        by: ["userId"],
        where,
        _sum: { totalHoras: true },
        _count: { _all: true },
      });
      const userIds = grouped.map((g) => g.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, tenantId: user.tenantId },
        select: { id: true, name: true },
      });
      const usersById = new Map(users.map((u) => [u.id, u.name]));
      const groups = grouped
        .filter((g) => !!g.userId)
        .map((g) => ({
          id: g.userId,
          name: usersById.get(g.userId) ?? "—",
          hours: g._sum.totalHoras ?? 0,
          count: g._count._all,
          totalHours: g._sum.totalHoras ?? 0,
        }));
      return res.json({ groups, totalHours });
    }
    if (group === "project") {
      const grouped = await prisma.timeEntry.groupBy({
        by: ["projectId"],
        where,
        _sum: { totalHoras: true },
        _count: { _all: true },
      });
      const projectIds = grouped.map((g) => g.projectId);
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds }, client: { tenantId: user.tenantId } },
        select: { id: true, name: true },
      });
      const projectsById = new Map(projects.map((p) => [p.id, p.name]));
      const groups = grouped.map((g) => ({
        id: g.projectId,
        name: projectsById.get(g.projectId) ?? "—",
        hours: g._sum.totalHoras ?? 0,
        count: g._count._all,
        totalHours: g._sum.totalHoras ?? 0,
      }));
      return res.json({ groups, totalHours });
    }
    if (group === "client") {
      // Prisma não faz groupBy em relation (client) diretamente; agregamos por projeto no DB e somamos por cliente em memória.
      const grouped = await prisma.timeEntry.groupBy({
        by: ["projectId"],
        where,
        _sum: { totalHoras: true },
        _count: { _all: true },
      });
      const projectIds = grouped.map((g) => g.projectId);
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds }, client: { tenantId: user.tenantId } },
        select: { id: true, client: { select: { id: true, name: true } } },
      });
      const clientByProjectId = new Map(projects.map((p) => [p.id, p.client]));
      const byClient = new Map<string, { id: string; name: string; hours: number; count: number }>();
      for (const g of grouped) {
        const client = clientByProjectId.get(g.projectId);
        if (!client) continue;
        const cur = byClient.get(client.id) || { id: client.id, name: client.name, hours: 0, count: 0 };
        cur.hours += g._sum.totalHoras ?? 0;
        cur.count += g._count._all;
        byClient.set(client.id, cur);
      }
      const groups = Array.from(byClient.values()).map((g) => ({ ...g, totalHours: g.hours }));
      return res.json({ groups, totalHours });
    }

    return res.json({ entries: totalAgg._count._all, totalHours });
  } catch (err) {
    console.error("GET /api/reports/hours error:", err);
    res.status(500).json({ error: "Erro ao gerar relatório de horas" });
  }
});

/** GET /api/reports/utilization?start=&end= - horas por consultor vs capacidade */
reportsRouter.get("/utilization", async (req, res) => {
  try {
    const user = req.user;
    // "ADMIN" antigo virou SUPER_ADMIN/ADMIN_PORTAL.
    if (!["SUPER_ADMIN", "ADMIN_PORTAL", "GESTOR_PROJETOS"].includes(String(user.role))) {
      return res.status(403).json({ error: "Não autorizado" });
    }
    const { start, end } = req.query;
    const startDate = start ? new Date(String(start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(String(end)) : new Date();

    const consultants = await prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { in: ["CONSULTOR", "ADMIN_PORTAL", "GESTOR_PROJETOS"] } },
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

/** GET /api/reports/tickets?start=&end=&projectId=&status= - contagem por status ou lista detalhada por status */
reportsRouter.get("/tickets", async (req, res) => {
  try {
    const user = req.user;
    const { start, end, projectId, status } = req.query;
    const where: Record<string, unknown> = {
      project: { client: { tenantId: user.tenantId } },
      // Relatórios de chamados devem listar apenas tarefas (não tópicos/subprojetos).
      // IDs/códigos de tópicos só são relevantes para consulta interna no banco.
      type: { notIn: ["SUBPROJETO"] },
    };
    if (projectId) where.projectId = String(projectId);
    if (status) where.status = String(status);
    if (start && end) {
      where.createdAt = {
        gte: new Date(String(start)),
        lte: new Date(String(end)),
      };
    }

    // Quando um status específico é informado, retornamos a lista detalhada de tickets
    if (status) {
      const tickets = await prisma.ticket.findMany({
        where,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          createdAt: true,
          project: {
            select: {
              id: true,
              name: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ tickets });
    }

    // Sem status, não há necessidade de trazer todos os tickets: agregamos no banco.
    const grouped = await prisma.ticket.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      const key = row.status ?? "UNKNOWN";
      const count = row._count._all;
      byStatus[key] = count;
      total += count;
    }
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
    if (userId && (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS")) where.userId = String(userId);
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
