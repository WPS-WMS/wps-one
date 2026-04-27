import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const holidaysRouter = Router();
holidaysRouter.use(authMiddleware);
holidaysRouter.use(requireFeature("configuracoes.feriados"));

function parseYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

holidaysRouter.get("/", async (req, res) => {
  const user = req.user;
  const yearRaw = req.query.year ? parseInt(String(req.query.year), 10) : NaN;
  const year = Number.isFinite(yearRaw) ? yearRaw : undefined;

  const where: any = { tenantId: user.tenantId };
  if (year) {
    where.date = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }

  const rows = await prisma.tenantHoliday.findMany({
    where,
    orderBy: [{ date: "asc" }],
    select: { id: true, date: true, name: true, isActive: true },
  });

  res.json(
    rows.map((r) => ({
      id: r.id,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      name: r.name,
      isActive: r.isActive,
    })),
  );
});

holidaysRouter.post("/", async (req, res) => {
  const user = req.user;
  const ymd = parseYmd(req.body?.date);
  const name = String(req.body?.name ?? "").trim();
  const isActive = req.body?.isActive === false ? false : true;

  if (!ymd) {
    res.status(400).json({ error: "Data inválida. Use YYYY-MM-DD." });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "Nome do feriado é obrigatório." });
    return;
  }

  const date = ymdToDate(ymd);
  const created = await prisma.tenantHoliday.upsert({
    where: { tenantId_date: { tenantId: user.tenantId, date } },
    create: { tenantId: user.tenantId, date, name, isActive },
    update: { name, isActive },
    select: { id: true, date: true, name: true, isActive: true },
  });

  res.status(201).json({
    id: created.id,
    date: created.date.toISOString().slice(0, 10),
    name: created.name,
    isActive: created.isActive,
  });
});

holidaysRouter.delete("/:id", async (req, res) => {
  const user = req.user;
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const existing = await prisma.tenantHoliday.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Feriado não encontrado." });
    return;
  }
  await prisma.tenantHoliday.delete({ where: { id } });
  res.status(204).end();
});

