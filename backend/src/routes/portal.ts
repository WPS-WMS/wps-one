import { Router } from "express";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
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

/** Seções padrão do intranet (slug estável para o front). */
const DEFAULT_PORTAL_SECTIONS: Array<{ slug: string; title: string; order: number }> = [
  { slug: "noticias", title: "Notícias", order: 0 },
  { slug: "colaborador-do-mes", title: "WPSer do mês", order: 1 },
  { slug: "premios", title: "Pontos de Inspiração", order: 2 },
  { slug: "manuais", title: "Manuais e documentos", order: 3 },
];

// POST /api/portal/bootstrap-sections — cria seções padrão do tenant (idempotente)
portalRouter.post("/bootstrap-sections", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const created: string[] = [];
  for (const s of DEFAULT_PORTAL_SECTIONS) {
    await prisma.portalSection.upsert({
      where: { tenantId_slug: { tenantId: user.tenantId, slug: s.slug } },
      create: {
        tenantId: user.tenantId,
        slug: s.slug,
        title: s.title,
        order: s.order,
      },
      update: { title: s.title, order: s.order },
    });
    created.push(s.slug);
  }
  const sections = await prisma.portalSection.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { order: "asc" },
  });
  res.json({ ok: true, slugs: created, sections });
});

const portalMediaDir = join(process.cwd(), "uploads", "portal");
if (!existsSync(portalMediaDir)) {
  mkdir(portalMediaDir, { recursive: true }).catch(console.error);
}

// POST /api/portal/media — upload de imagem para banners do portal (admin)
portalRouter.post("/media", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const { fileName, fileData, fileType } = req.body as {
    fileName?: string;
    fileData?: string;
    fileType?: string;
  };
  if (!fileName || !fileData) {
    res.status(400).json({ error: "fileName e fileData são obrigatórios" });
    return;
  }
  const allowedMime = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const allowedExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  const ext = String(fileName).toLowerCase().substring(String(fileName).lastIndexOf("."));
  if (!allowedExt.has(ext)) {
    res.status(400).json({ error: "Envie apenas imagem (PNG, JPG, WebP ou GIF)." });
    return;
  }
  const mimeFromData =
    typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
  const effective = String(fileType || mimeFromData || "");
  if (effective && !allowedMime.has(effective)) {
    res.status(400).json({ error: "Tipo de imagem não permitido." });
    return;
  }
  const base64 = fileData.replace(/^data:.*,/, "");
  const buffer = Buffer.from(base64, "base64");
  const max = 8 * 1024 * 1024;
  if (buffer.length > max) {
    res.status(400).json({ error: "Imagem muito grande (máx. 8MB)." });
    return;
  }
  const tenantDir = join(portalMediaDir, user.tenantId);
  if (!existsSync(tenantDir)) {
    await mkdir(tenantDir, { recursive: true });
  }
  const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${safe}`;
  const filePath = join(tenantDir, unique);
  await writeFile(filePath, buffer);
  const fileUrl = `/uploads/portal/${user.tenantId}/${unique}`;
  res.status(201).json({ fileUrl });
});

// POST /api/portal/events — novo evento na agenda
portalRouter.post("/events", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const { title, description, date } = req.body as {
    title?: string;
    description?: string | null;
    date?: string;
  };
  if (!title?.trim() || !date) {
    res.status(400).json({ error: "Título e data são obrigatórios." });
    return;
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    res.status(400).json({ error: "Data inválida." });
    return;
  }
  const ev = await prisma.portalEvent.create({
    data: {
      tenantId: user.tenantId,
      title: String(title).trim(),
      description: description != null ? String(description).trim() || null : null,
      date: d,
    },
  });
  res.status(201).json(ev);
});

// PATCH /api/portal/events/:id
portalRouter.patch("/events/:id", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const id = req.params.id;
  const existing = await prisma.portalEvent.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Evento não encontrado" });
    return;
  }
  const { title, description, date } = req.body as {
    title?: string;
    description?: string | null;
    date?: string;
  };
  let nextDate = existing.date;
  if (date !== undefined) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Data inválida." });
      return;
    }
    nextDate = d;
  }
  const updated = await prisma.portalEvent.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: String(title).trim() }),
      ...(description !== undefined && {
        description: description === null ? null : String(description).trim() || null,
      }),
      ...(date !== undefined && { date: nextDate }),
    },
  });
  res.json(updated);
});

// DELETE /api/portal/events/:id
portalRouter.delete("/events/:id", ensurePortalAdmin, async (req, res) => {
  const user = req.user;
  const id = req.params.id;
  const existing = await prisma.portalEvent.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Evento não encontrado" });
    return;
  }
  await prisma.portalEvent.delete({ where: { id } });
  res.status(204).end();
});

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

