import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const costCenterBudgetsRouter = Router();

const FEATURE = "relatorios.financeiroCentroCusto" as const;

function competenceUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** GET /budgets?year=2026 */
costCenterBudgetsRouter.get("/budgets", requireFeature(FEATURE), async (req, res) => {
  const user = req.user!;
  const year = Number.parseInt(String(req.query.year ?? new Date().getUTCFullYear()), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Ano inválido." });
    return;
  }

  const start = competenceUtc(year, 1);
  const end = competenceUtc(year, 12);

  const [costCenters, budgets] = await Promise.all([
    prisma.costCenter.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.costCenterBudget.findMany({
      where: {
        tenantId: user.tenantId,
        competenceDate: { gte: start, lte: end },
      },
      select: { costCenterId: true, competenceDate: true, amountCents: true },
    }),
  ]);

  const amountByKey = new Map<string, number>();
  for (const b of budgets) {
    const month = b.competenceDate.getUTCMonth() + 1;
    amountByKey.set(`${b.costCenterId}:${month}`, b.amountCents);
  }

  const rows = costCenters.map((cc) => {
    const months: Record<string, number> = {};
    let yearTotalCents = 0;
    for (let month = 1; month <= 12; month += 1) {
      const cents = amountByKey.get(`${cc.id}:${month}`) ?? 0;
      months[String(month)] = cents;
      yearTotalCents += cents;
    }
    return {
      costCenterId: cc.id,
      name: cc.name,
      code: cc.code,
      months,
      yearTotalCents,
      yearTotalFormatted: formatCents(yearTotalCents),
    };
  });

  res.json({ year, rows });
});

/**
 * PUT /budgets
 * body: { year: number, items: [{ costCenterId, month, amountCents }] }
 */
costCenterBudgetsRouter.put("/budgets", requireFeature(FEATURE), async (req, res) => {
  const user = req.user!;
  const year = Number.parseInt(String(req.body?.year ?? ""), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Ano inválido." });
    return;
  }

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
  type Item = { costCenterId: string; month: number; amountCents: number };
  const items: Item[] = [];
  for (const raw of itemsRaw) {
    const costCenterId = String(raw?.costCenterId ?? "").trim();
    const month = Number.parseInt(String(raw?.month ?? ""), 10);
    const amountCents = Math.round(Number(raw?.amountCents ?? 0));
    if (!costCenterId) continue;
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      res.status(400).json({ error: "Mês inválido." });
      return;
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      res.status(400).json({ error: "Valor orçado inválido." });
      return;
    }
    items.push({ costCenterId, month, amountCents });
  }

  if (items.length === 0) {
    res.status(400).json({ error: "Informe ao menos um valor de orçamento." });
    return;
  }

  const ccIds = [...new Set(items.map((i) => i.costCenterId))];
  const owned = await prisma.costCenter.findMany({
    where: { tenantId: user.tenantId, id: { in: ccIds } },
    select: { id: true },
  });
  if (owned.length !== ccIds.length) {
    res.status(400).json({ error: "Centro de custo inválido." });
    return;
  }

  await prisma.$transaction(
    items.map((item) => {
      const competenceDate = competenceUtc(year, item.month);
      if (item.amountCents === 0) {
        return prisma.costCenterBudget.deleteMany({
          where: {
            tenantId: user.tenantId,
            costCenterId: item.costCenterId,
            competenceDate,
          },
        });
      }
      return prisma.costCenterBudget.upsert({
        where: {
          tenantId_costCenterId_competenceDate: {
            tenantId: user.tenantId,
            costCenterId: item.costCenterId,
            competenceDate,
          },
        },
        create: {
          tenantId: user.tenantId,
          costCenterId: item.costCenterId,
          competenceDate,
          amountCents: item.amountCents,
          createdById: user.id,
        },
        update: {
          amountCents: item.amountCents,
        },
      });
    }),
  );

  res.json({ ok: true, saved: items.length });
});

export { competenceUtc, formatCents as formatBudgetCents };
