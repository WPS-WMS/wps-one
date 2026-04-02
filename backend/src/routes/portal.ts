import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const portalRouter = Router();

portalRouter.use(authMiddleware);
portalRouter.use(requireFeature("portal.corporativo"));

// GET /api/portal/sections
portalRouter.get("/sections", async (req, res) => {
  const user = req.user;
  const sections = await prisma.portalSection.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { order: "asc" },
  });
  res.json(sections);
});

// GET /api/portal/sections/:id/items
portalRouter.get("/sections/:id/items", async (req, res) => {
  const user = req.user;
  const sectionId = req.params.id;
  const items = await prisma.portalItem.findMany({
    where: {
      tenantId: user.tenantId,
      sectionId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

// GET /api/portal/events?month=&year=
portalRouter.get("/events", async (req, res) => {
  const user = req.user;
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const now = new Date();
  const y = Number.isFinite(year) && year ? year : now.getFullYear();
  const m = Number.isFinite(month) && month ? month : now.getMonth() + 1;

  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);

  const events = await prisma.portalEvent.findMany({
    where: {
      tenantId: user.tenantId,
      date: { gte: start, lte: end },
    },
    orderBy: { date: "asc" },
  });

  // Aniversariantes: filtrar por mês (independente do ano) e excluir CLIENTE.
  // birthDate guarda a data completa (com ano), então não podemos filtrar por intervalo do ano atual.
  const birthdays = await prisma.$queryRaw<
    Array<{ id: string; name: string; birthDate: Date; cargo: string | null; avatarUrl: string | null }>
  >`
    select
      id,
      name,
      "birthDate",
      cargo,
      "avatarUrl"
    from "users"
    where
      "tenantId" = ${user.tenantId}
      and role <> 'CLIENTE'
      and ativo = true
      and "birthDate" is not null
      and extract(month from "birthDate") = ${m}
    order by extract(day from "birthDate") asc, name asc
  `;

  res.json({ events, birthdays });
});

const ensurePortalAdmin = requireFeature("portal.corporativo.editar");

// POST /api/portal/items
portalRouter.post("/items", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const { sectionId, title, content, type, metadata, isActive = true } = req.body;

  if (!sectionId || !title) {
    return res.status(400).json({ error: "Seção e título são obrigatórios" });
  }

  const section = await prisma.portalSection.findFirst({
    where: { id: sectionId, tenantId: user.tenantId },
  });
  if (!section) {
    return res.status(400).json({ error: "Seção inválida" });
  }

  const item = await prisma.portalItem.create({
    data: {
      tenantId: user.tenantId,
      sectionId,
      title: String(title).trim(),
      content: String(content || "").trim(),
      type: String(type || "text").toLowerCase(),
      metadata: metadata ?? null,
      isActive: !!isActive,
    },
  });

  res.status(201).json(item);
});

// PATCH /api/portal/items/:id
portalRouter.patch("/items/:id", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const id = req.params.id;

  const existing = await prisma.portalItem.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Item não encontrado" });
  }

  const { title, content, type, metadata, isActive } = req.body;
  const updated = await prisma.portalItem.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: String(title).trim() }),
      ...(content !== undefined && { content: String(content).trim() }),
      ...(type !== undefined && { type: String(type).toLowerCase() }),
      ...(metadata !== undefined && { metadata }),
      ...(isActive !== undefined && { isActive: !!isActive }),
    },
  });

  res.json(updated);
});

// DELETE /api/portal/items/:id
portalRouter.delete("/items/:id", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const id = req.params.id;

  const existing = await prisma.portalItem.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    return res.status(404).json({ error: "Item não encontrado" });
  }

  await prisma.portalItem.delete({ where: { id } });
  res.status(204).end();
});

