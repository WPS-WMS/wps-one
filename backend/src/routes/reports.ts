import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { activeTimeEntryWhere } from "../lib/activeTimeEntryWhere.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { errorSummary } from "../lib/devLog.js";
import {
  computeCashFlow,
  computeExecutiveSummary,
  computeFullAnalysesReport,
  computeGerencialDre,
  parseReportPeriod,
  ReportPeriodError,
} from "../lib/financialReportHelpers.js";
import { listHoursVsRevenueReport } from "../lib/hoursVsRevenueReportHelpers.js";
import { getProjectVisibilityWhere } from "../lib/projectVisibility.js";

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

function reportPeriodOr400(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  startRaw: string,
  endRaw: string,
) {
  try {
    return parseReportPeriod(startRaw, endRaw);
  } catch (err) {
    if (err instanceof ReportPeriodError) {
      res.status(400).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

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
reportsRouter.get("/hours", requireFeature("relatorios.horas"), async (req, res) => {
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
    if (
      userId &&
      (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || user.role === "FINANCEIRO")
    ) {
      where.userId = String(userId);
    }
    if (projectId) where.projectId = String(projectId);
    if (clientId) where.project = { clientId: String(clientId), client: { tenantId: user.tenantId } };

    where = activeTimeEntryWhere(where);

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
    console.error("GET /api/reports/hours error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar relatório de horas" });
  }
});

/** GET /api/reports/utilization?start=&end= - horas por consultor vs capacidade */
reportsRouter.get("/utilization", requireFeature("relatorios.utilizacao"), async (req, res) => {
  try {
    const user = req.user;
    const { start, end } = req.query;
    const startDate = start ? new Date(String(start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = end ? new Date(String(end)) : new Date();

    const consultants = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        role: { in: ["CONSULTOR", "CONSULTOR_ONDEMAND", "ADMIN_PORTAL", "GESTOR_PROJETOS"] },
      },
      select: { id: true, name: true, cargaHorariaSemanal: true },
    });

    const entries = await prisma.timeEntry.findMany({
      where: activeTimeEntryWhere({
        project: { client: { tenantId: user.tenantId } },
        date: { gte: startDate, lte: endDate },
        userId: { in: consultants.map((c) => c.id) },
      }),
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
    console.error("GET /api/reports/utilization error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar relatório de utilização" });
  }
});

/** GET /api/reports/tickets?start=&end=&projectId=&status= - contagem por status ou lista detalhada por status */
reportsRouter.get("/tickets", requireFeature("relatorios.chamados"), async (req, res) => {
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
    console.error("GET /api/reports/tickets error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar relatório de chamados" });
  }
});

/** GET /api/reports/export/hours?start=&end=&format=csv - exportação para faturamento (dados para CSV) */
reportsRouter.get("/export/hours", requireFeature("relatorios.exportacao"), async (req, res) => {
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
    if (
      userId &&
      (user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || user.role === "FINANCEIRO")
    ) {
      where.userId = String(userId);
    }
    if (projectId) where.projectId = String(projectId);
    if (clientId) where.project = { clientId: String(clientId), client: { tenantId: user.tenantId } };

    where = activeTimeEntryWhere(where);

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
    console.error("GET /api/reports/export/hours error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao exportar horas" });
  }
});

/** GET /api/reports/finance/cost-centers?start=&end=&costCenterId=&view= */
reportsRouter.get("/finance/cost-centers", requireFeature("relatorios.financeiroCentroCusto"), async (req, res) => {
  try {
    const user = req.user!;
    const now = new Date();
    const year = now.getUTCFullYear();
    const startRaw = String(req.query.start ?? "").trim() || `${year}-01-01`;
    const endRaw = String(req.query.end ?? "").trim() || `${year}-12-31`;
    const period = reportPeriodOr400(res, startRaw, endRaw);
    if (!period) return;
    const startDate = period.start;
    const endDate = period.end;
    const costCenterId = String(req.query.costCenterId ?? "").trim();
    const view = String(req.query.view ?? req.query.type ?? "").trim().toUpperCase();

    const costCenters = await prisma.costCenter.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(costCenterId ? { id: costCenterId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });
    if (costCenters.length === 0) {
      return res.json({
        groups: [],
        totalOrcadoCents: 0,
        totalRealizadoCents: 0,
        saldoCents: 0,
        totalReceitaCents: 0,
        totalDespesaCents: 0,
      });
    }

    const ccIds = costCenters.map((c) => c.id);
    const months: Date[] = [];
    {
      let y = startDate.getUTCFullYear();
      let m = startDate.getUTCMonth();
      const endY = endDate.getUTCFullYear();
      const endM = endDate.getUTCMonth();
      while (y < endY || (y === endY && m <= endM)) {
        months.push(new Date(Date.UTC(y, m, 1)));
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }
    }

    const [budgets, expenses] = await Promise.all([
      months.length === 0
        ? Promise.resolve([])
        : prisma.costCenterBudget.findMany({
            where: {
              tenantId: user.tenantId,
              costCenterId: { in: ccIds },
              competenceDate: { in: months },
            },
            select: { costCenterId: true, amountCents: true },
          }),
      prisma.financialEntry.groupBy({
        by: ["costCenterId"],
        where: {
          tenantId: user.tenantId,
          status: "LANCADO",
          type: "DESPESA",
          costCenterId: { in: ccIds },
          entryDate: { gte: startDate, lte: endDate },
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);

    const orcadoByCc = new Map<string, number>();
    for (const b of budgets) {
      orcadoByCc.set(b.costCenterId, (orcadoByCc.get(b.costCenterId) ?? 0) + b.amountCents);
    }
    const realizadoByCc = new Map<string, { cents: number; count: number }>();
    for (const e of expenses) {
      realizadoByCc.set(e.costCenterId, {
        cents: e._sum.amountCents ?? 0,
        count: e._count._all,
      });
    }

    let totalOrcadoCents = 0;
    let totalRealizadoCents = 0;
    const viewKey =
      view === "RECEITA" || view === "ORCADO"
        ? "ORCADO"
        : view === "DESPESA" || view === "REALIZADO"
          ? "REALIZADO"
          : "";

    const groups = costCenters
      .map((cc) => {
        const orcadoCents = orcadoByCc.get(cc.id) ?? 0;
        const realizado = realizadoByCc.get(cc.id) ?? { cents: 0, count: 0 };
        const realizadoCents = realizado.cents;
        const saldoCents = orcadoCents - realizadoCents;
        const consumoPercentual =
          orcadoCents > 0 ? Math.round((realizadoCents / orcadoCents) * 10000) / 100 : null;
        return {
          id: cc.id,
          name: cc.name,
          code: cc.code,
          orcadoCents,
          realizadoCents,
          saldoCents,
          consumoPercentual,
          count: realizado.count,
          receitaCents: orcadoCents,
          despesaCents: realizadoCents,
          orcadoFormatted: (orcadoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          realizadoFormatted: (realizadoCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
          receitaFormatted: (orcadoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          despesaFormatted: (realizadoCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
          saldoFormatted: (saldoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        };
      })
      .filter((g) => {
        if (viewKey === "ORCADO") return g.orcadoCents > 0;
        if (viewKey === "REALIZADO") return g.realizadoCents > 0;
        return true;
      });

    // Totais alinhados à tabela exibida
    totalOrcadoCents = groups.reduce((s, g) => s + g.orcadoCents, 0);
    totalRealizadoCents = groups.reduce((s, g) => s + g.realizadoCents, 0);

    return res.json({
      groups,
      totalOrcadoCents,
      totalRealizadoCents,
      saldoCents: totalOrcadoCents - totalRealizadoCents,
      totalReceitaCents: totalOrcadoCents,
      totalDespesaCents: totalRealizadoCents,
    });
  } catch (err) {
    console.error("GET /api/reports/finance/cost-centers error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar relatório por centro de custo." });
  }
});

/** GET /api/reports/finance/executive-summary?start=&end= */
reportsRouter.get(
  "/finance/executive-summary",
  requireFeature("relatorios.financeiroDashboard"),
  async (req, res) => {
    try {
      const user = req.user!;
      const period = reportPeriodOr400(res, String(req.query.start ?? ""), String(req.query.end ?? ""));
      if (!period) return;
      const data = await computeExecutiveSummary(user.tenantId, period);
      return res.json(data);
    } catch (err) {
      console.error("GET /api/reports/finance/executive-summary error:", errorSummary(err));
      res.status(500).json({ error: "Erro ao gerar dashboard financeiro." });
    }
  },
);

/** GET /api/reports/finance/dre?start=&end= */
reportsRouter.get("/finance/dre", requireFeature("relatorios.financeiroDre"), async (req, res) => {
  try {
    const user = req.user!;
    const period = reportPeriodOr400(res, String(req.query.start ?? ""), String(req.query.end ?? ""));
    if (!period) return;
    const data = await computeGerencialDre(user.tenantId, period);
    return res.json(data);
  } catch (err) {
    console.error("GET /api/reports/finance/dre error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar DRE gerencial." });
  }
});

/** GET /api/reports/finance/cash-flow?start=&end=&granularity=DAY|WEEK|MONTH */
reportsRouter.get(
  "/finance/cash-flow",
  requireFeature("relatorios.financeiroFluxoCaixa"),
  async (req, res) => {
    try {
      const user = req.user!;
      const period = reportPeriodOr400(res, String(req.query.start ?? ""), String(req.query.end ?? ""));
      if (!period) return;
      const g = String(req.query.granularity ?? "MONTH").trim().toUpperCase();
      const granularity = g === "DAY" || g === "WEEK" || g === "MONTH" ? g : "MONTH";
      const data = await computeCashFlow(user.tenantId, period, granularity);
      return res.json(data);
    } catch (err) {
      console.error("GET /api/reports/finance/cash-flow error:", errorSummary(err));
      res.status(500).json({ error: "Erro ao gerar fluxo de caixa." });
    }
  },
);

/** GET /api/reports/finance/analyses?start=&end= */
reportsRouter.get(
  "/finance/analyses",
  requireFeature("relatorios.financeiroAnalises"),
  async (req, res) => {
    try {
      const user = req.user!;
      const period = reportPeriodOr400(res, String(req.query.start ?? ""), String(req.query.end ?? ""));
      if (!period) return;
      const data = await computeFullAnalysesReport(user.tenantId, period);
      return res.json(data);
    } catch (err) {
      console.error("GET /api/reports/finance/analyses error:", errorSummary(err));
      res.status(500).json({ error: "Erro ao gerar relatórios financeiros." });
    }
  },
);

/** GET /api/reports/finance/hours-vs-revenue?start=&end= */
reportsRouter.get(
  "/finance/hours-vs-revenue",
  requireFeature("relatorios.financeiroMedicaoHoras"),
  async (req, res) => {
    try {
      const user = req.user!;
      const period = reportPeriodOr400(res, String(req.query.start ?? ""), String(req.query.end ?? ""));
      if (!period) return;
      const visibility = await getProjectVisibilityWhere(user);
      const projects = await listHoursVsRevenueReport(user.tenantId, visibility, period);
      return res.json({ projects, period: { start: period.start.toISOString().slice(0, 10), end: period.end.toISOString().slice(0, 10) } });
    } catch (err) {
      console.error("GET /api/reports/finance/hours-vs-revenue error:", errorSummary(err));
      res.status(500).json({ error: "Erro ao gerar medição de horas vs receita." });
    }
  },
);
