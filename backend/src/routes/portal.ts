import { Router } from "express";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, normalize, sep } from "path";
import { existsSync } from "fs";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { sendMail, type MailAttachment } from "../lib/mailer.js";
import { renderEmailLayout, escapeHtml as escapeHtmlTemplate } from "../lib/emailTemplate.js";
import { errorSummary } from "../lib/devLog.js";

export const portalRouter = Router();

portalRouter.use(authMiddleware);
portalRouter.use(requireFeature("portal.corporativo"));

const PORTAL_FEEDBACK_TO = "contato@wpsone.com.br";
const portalFeedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas mensagens. Tente novamente em alguns minutos." },
});

/** Limites do mês civil em UTC (evita eventos “sumirem” por fuso no servidor). */
function portalMonthRangeUtc(year: number, month: number): { gte: Date; lt: Date } {
  const y = Math.floor(year);
  const m = Math.min(12, Math.max(1, Math.floor(month)));
  return {
    gte: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0, 0)),
  };
}

function parsePortalEventDateInput(input: string): Date | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0, 0),
  );
}

function isValidFeedbackType(t: unknown): t is "BUG" | "MELHORIA" {
  const s = String(t ?? "").trim().toUpperCase();
  return s === "BUG" || s === "MELHORIA";
}

function safeBase64FromDataUrl(input: string): { base64: string; mime: string } | null {
  const s = String(input || "");
  const m = s.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) return null;
  const mime = String(m[1] || "").trim().toLowerCase();
  const base64 = String(m[2] || "").trim();
  if (!mime.startsWith("image/")) return null;
  if (!base64) return null;
  return { base64, mime };
}

// POST /api/portal/feedback — colaboradores reportam bug/melhoria com imagens
portalRouter.post("/feedback", portalFeedbackLimiter, async (req, res) => {
  try {
    const user = req.user as any;
    const body = req.body as Record<string, unknown>;
    const typeRaw = body.type;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const images = Array.isArray(body.images) ? (body.images as any[]) : [];

    if (!isValidFeedbackType(typeRaw)) {
      res.status(400).json({ error: "Tipo inválido. Use BUG ou MELHORIA." });
      return;
    }
    if (!description || description.length < 10) {
      res.status(400).json({ error: "Descreva o problema/sugestão (mínimo 10 caracteres)." });
      return;
    }
    if (description.length > 8000) {
      res.status(400).json({ error: "Descrição muito longa." });
      return;
    }
    if (images.length > 5) {
      res.status(400).json({ error: "Envie no máximo 5 imagens." });
      return;
    }

    const attachments: MailAttachment[] = [];
    const filenames: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const it = images[i] as { fileName?: unknown; fileData?: unknown };
      const fileName = typeof it?.fileName === "string" ? it.fileName.trim() : `imagem-${i + 1}.png`;
      const fileData = typeof it?.fileData === "string" ? it.fileData : "";
      const parsed = safeBase64FromDataUrl(fileData);
      if (!parsed) {
        res.status(400).json({ error: "Imagens inválidas. Envie PNG/JPG/WebP/GIF em base64." });
        return;
      }
      const buffer = Buffer.from(parsed.base64, "base64");
      const maxBytes = 2 * 1024 * 1024; // 2MB por imagem (mantém e-mail leve)
      if (buffer.length > maxBytes) {
        res.status(400).json({ error: "Uma das imagens é muito grande (máx. 2MB por imagem)." });
        return;
      }
      // Sanitiza nome
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
      attachments.push({ filename: safeName || `imagem-${i + 1}.png`, contentType: parsed.mime, contentBase64: parsed.base64 });
      filenames.push(safeName || `imagem-${i + 1}.png`);
    }

    const userEmail = typeof user?.email === "string" && user.email.trim() ? user.email.trim() : "(sem e-mail)";
    const userName = typeof user?.name === "string" && user.name.trim() ? user.name.trim() : "Usuário";
    const tenantId = typeof user?.tenantId === "string" ? user.tenantId : "";
    const tenantName = tenantId
      ? await prisma.tenant
          .findUnique({ where: { id: tenantId }, select: { name: true } })
          .then((t) => (t?.name ? String(t.name) : ""))
          .catch(() => "")
      : "";

    const subject = `[Portal colaborativo] ${String(typeRaw).toUpperCase()} — ${userEmail}`;
    const html = renderEmailLayout({
      subject,
      title: "Novo feedback do portal colaborativo",
      preheader: `${userName} enviou ${String(typeRaw).toLowerCase() === "bug" ? "um bug" : "uma melhoria"}`,
      summaryRows: [
        { label: "Tipo", value: String(typeRaw).toUpperCase() },
        { label: "Usuário", value: userName },
        { label: "E-mail", value: userEmail },
        ...((tenantName || tenantId) ? [{ label: "Empresa", value: tenantName || tenantId }] : []),
        { label: "Anexos", value: filenames.length ? filenames.join(", ") : "Nenhum" },
      ],
      bodyHtml: `
        <div style="margin:0 0 10px 0;color:#64748b;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">
          Descrição
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px 16px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap">
          ${escapeHtmlTemplate(description)}
        </div>
      `,
      footerNote: "Este e-mail foi gerado automaticamente pelo Portal colaborativo.",
    });

    const result = await sendMail({ to: PORTAL_FEEDBACK_TO, subject, html, attachments });
    if ("skipped" in result && result.skipped) {
      res.status(503).json({ error: "Envio de e-mail não configurado no servidor." });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[PORTAL][feedback]", errorSummary(e));
    res.status(500).json({ error: "Não foi possível enviar. Tente novamente." });
  }
});

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
  const section = await prisma.portalSection.findFirst({
    where: { id: sectionId, tenantId: user.tenantId },
    select: { slug: true },
  });
  if (!section) {
    res.status(404).json({ error: "Seção não encontrada" });
    return;
  }
  // Notícias: primeiro anexado = primeira posição no carrossel (ordem cronológica de criação).
  const items = await prisma.portalItem.findMany({
    where: {
      tenantId: user.tenantId,
      sectionId,
      isActive: true,
    },
    orderBy: { createdAt: section.slug === "noticias" ? "asc" : "desc" },
  });
  res.json(items);
});

// GET /api/portal/events?month=&year=
portalRouter.get("/events", async (req, res) => {
  const user = req.user;
  const upcoming =
    String(req.query.upcoming ?? "").trim() === "1" ||
    String(req.query.upcoming ?? "").trim().toLowerCase() === "true";
  const rawLimit = req.query.limit;
  const limitParsed = rawLimit !== undefined && String(rawLimit).trim() !== "" ? Number(rawLimit) : NaN;
  const limit = Number.isFinite(limitParsed) ? Math.min(10, Math.max(1, Math.floor(limitParsed))) : 3;

  // Modo "próximos eventos": não depende de mês/ano selecionado.
  // Retorna apenas os próximos eventos a partir de hoje (mantendo o mesmo shape { events, birthdays }).
  if (upcoming) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const events = await prisma.portalEvent.findMany({
      where: {
        tenantId: user.tenantId,
        date: { gte: today },
      },
      orderBy: { date: "asc" },
      take: limit,
    });
    res.json({ events, birthdays: [] });
    return;
  }

  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const now = new Date();
  const y = Number.isFinite(year) && year ? year : now.getFullYear();
  const m = Number.isFinite(month) && month ? month : now.getMonth() + 1;

  const { gte: start, lt: endExclusive } = portalMonthRangeUtc(y, m);

  const events = await prisma.portalEvent.findMany({
    where: {
      tenantId: user.tenantId,
      date: { gte: start, lt: endExclusive },
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
  { slug: "newsletter", title: "Newsletter", order: 1 },
  { slug: "colaborador-do-mes", title: "WPSer do mês", order: 2 },
  { slug: "premios", title: "Pontos de Inspiração", order: 3 },
  { slug: "manuais", title: "Manuais e documentos", order: 4 },
  { slug: "politica-despesa", title: "Política de despesa", order: 5 },
  { slug: "politica-lgpd", title: "Política LGPD", order: 6 },
  { slug: "documentos-rh", title: "Documentos de RH", order: 7 },
  { slug: "institucional", title: "Institucional", order: 8 },
  { slug: "templates", title: "Templates oficiais", order: 9 },
  { slug: "biblioteca", title: "Biblioteca", order: 10 },
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

const portalMediaDir = join(getUploadsRoot(), "portal");
if (!existsSync(portalMediaDir)) {
  mkdir(portalMediaDir, { recursive: true }).catch((err) => console.error("[PORTAL] mkdir media", errorSummary(err)));
}

/** Remove arquivo de imagem do portal no disco (somente paths deste tenant). */
async function tryUnlinkPortalTenantFile(tenantId: string, contentUrl: string | null | undefined) {
  const c = String(contentUrl || "").trim();
  const prefix = `/uploads/portal/${tenantId}/`;
  if (!c.startsWith(prefix)) return;
  const name = c.slice(prefix.length);
  if (!name || name.includes("/") || name.includes("..")) return;
  const abs = join(getUploadsRoot(), "portal", tenantId, name);
  try {
    await unlink(abs);
  } catch {
    /* arquivo já ausente ou permissão */
  }
}

function portalTenantUploadsDirPrefix(tenantId: string): string {
  return normalize(join(getUploadsRoot(), "portal", tenantId)) + sep;
}

function isPathUnderPortalTenant(tenantId: string, absPath: string): boolean {
  const root = portalTenantUploadsDirPrefix(tenantId);
  const n = normalize(absPath) + sep;
  return n.startsWith(root);
}

/**
 * Download autenticado de ficheiro do portal (PDF/imagem) em disco.
 * Query `variant=metadata` usa `metadata.pdfUrl` (ex.: notícias); caso contrário usa `content`.
 */
portalRouter.get("/items/:id/file", async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const variantRaw = String(req.query.variant || "content").toLowerCase();
    const variant = variantRaw === "metadata" ? "metadata" : "content";

    const item = await prisma.portalItem.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { content: true, metadata: true },
    });
    if (!item) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    let raw =
      variant === "metadata" ? extractPortalPdfUrl(item.metadata) : String(item.content || "").trim();
    if (!raw) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return;
    }
    if (raw.startsWith("data:")) {
      res.status(400).json({ error: "Arquivo inline não é servido por esta rota" });
      return;
    }

    let publicPath = "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        publicPath = new URL(raw).pathname;
      } catch {
        res.status(400).json({ error: "URL inválida" });
        return;
      }
    } else {
      publicPath = raw.startsWith("/") ? raw : `/${raw}`;
    }

    const expectedPrefix = `/uploads/portal/${user.tenantId}/`;
    if (!publicPath.startsWith(expectedPrefix)) {
      res.status(403).json({ error: "Arquivo fora do armazenamento do portal" });
      return;
    }

    const abs = resolveUploadsPublicPath(publicPath);
    if (!abs || !isPathUnderPortalTenant(user.tenantId, abs)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "Arquivo não encontrado no servidor" });
      return;
    }

    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Erro ao enviar arquivo" });
      }
    });
  } catch (e) {
    console.error("GET /api/portal/items/:id/file", errorSummary(e));
    if (!res.headersSent) res.status(500).json({ error: "Erro ao ler arquivo" });
  }
});

function extractPortalPdfUrl(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const o = metadata as Record<string, unknown>;
  const raw = o.pdfUrl ?? o.pdf_url ?? o.pdf;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractPortalCoverUrl(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const o = metadata as Record<string, unknown>;
  const raw = o.coverUrl ?? o.cover_url;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Limite por ficheiro em JSON/base64 (notícias, WPSer, inspiração). Multipart usa PORTAL_MEDIA_LIMIT_BYTES. */
const PORTAL_MEDIA_BASE64_MAX_BYTES = 40 * 1024 * 1024;
const PORTAL_MEDIA_LIMIT_BYTES = process.env.NODE_ENV === "production" ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
const allowedPortalMediaMime = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
]);
const allowedPortalMediaExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".docx", ".xlsx"]);

function fileExtLower(name: string): string {
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  return dot >= 0 ? s.slice(dot).toLowerCase() : "";
}

const portalMediaUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const user = (req as any).user as { tenantId: string } | undefined;
        const tenantId = user?.tenantId;
        if (!tenantId) return cb(new Error("Usuário não autenticado"), "");
        const tenantDir = join(portalMediaDir, tenantId);
        if (!existsSync(tenantDir)) {
          await mkdir(tenantDir, { recursive: true });
        }
        cb(null, tenantDir);
      } catch (e) {
        cb(e as Error, "");
      }
    },
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || "arquivo")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-180);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: PORTAL_MEDIA_LIMIT_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = fileExtLower(file.originalname);
    if (!allowedPortalMediaExt.has(ext)) return cb(null, false);
    if (file.mimetype && !allowedPortalMediaMime.has(file.mimetype)) return cb(null, false);
    cb(null, true);
  },
});

function maybeMulterSingle(fieldName: string) {
  const mw = portalMediaUpload.single(fieldName);
  return (req: any, res: any, next: any) => {
    const ct = String(req.headers["content-type"] || "");
    if (!ct.toLowerCase().startsWith("multipart/form-data")) return next();
    return mw(req, res, (err: any) => next(err));
  };
}

// POST /api/portal/media — upload de mídia do portal (admin)
portalRouter.post("/media", ensurePortalAdmin, maybeMulterSingle("file"), async (req, res) => {
  const user = req.user;

  // multipart/form-data (recomendado) — suporta ficheiros grandes sem base64
  const uploaded = (req as any).file as Express.Multer.File | undefined;
  if (uploaded) {
    const ext = fileExtLower(uploaded.originalname);
    if (!allowedPortalMediaExt.has(ext)) {
      // multer fileFilter pode retornar false e não setar `file`
      res.status(400).json({ error: "Envie imagem (PNG, JPG, WebP ou GIF) ou arquivo (PDF, DOCX, XLSX)." });
      return;
    }
    const fileUrl = `/uploads/portal/${user.tenantId}/${uploaded.filename}`;
    res.status(201).json({ fileUrl, storage: "filesystem" as const });
    return;
  }

  // Compat (legado): JSON com base64 — mantemos para não quebrar clientes antigos
  const { fileName, fileData, fileType } = req.body as {
    fileName?: string;
    fileData?: string;
    fileType?: string;
  };
  if (!fileName || !fileData) {
    res.status(400).json({ error: "Arquivo não recebido." });
    return;
  }
  const ext = fileExtLower(fileName);
  if (!allowedPortalMediaExt.has(ext)) {
    res.status(400).json({ error: "Envie imagem (PNG, JPG, WebP ou GIF) ou arquivo (PDF, DOCX, XLSX)." });
    return;
  }
  const mimeFromData =
    typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
  const effective = String(fileType || mimeFromData || "");
  if (effective && !allowedPortalMediaMime.has(effective)) {
    res.status(400).json({ error: "Tipo de arquivo não permitido." });
    return;
  }
  const base64 = fileData.replace(/^data:.*,/, "");
  const buffer = Buffer.from(base64, "base64");
  // Para base64, mantém limite menor (QA/dev) e evita stress de memória.
  if (buffer.length > PORTAL_MEDIA_BASE64_MAX_BYTES) {
    res.status(400).json({ error: "Arquivo muito grande." });
    return;
  }
  const mimeResolved =
    effective && allowedPortalMediaMime.has(effective)
      ? effective
      : mimeFromData && allowedPortalMediaMime.has(mimeFromData)
        ? mimeFromData
        : ext === ".pdf"
          ? "application/pdf"
          : ext === ".docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : ext === ".xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : ext === ".png"
            ? "image/png"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".webp"
                ? "image/webp"
                : "image/jpeg";

  const tenantDir = join(portalMediaDir, user.tenantId);
  if (!existsSync(tenantDir)) {
    await mkdir(tenantDir, { recursive: true });
  }
  const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${safe}`;
  const filePath = join(tenantDir, unique);
  await writeFile(filePath, buffer);
  const fileUrl = `/uploads/portal/${user.tenantId}/${unique}`;
  res.status(201).json({ fileUrl, storage: "filesystem" as const });
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
  const d = parsePortalEventDateInput(String(date));
  if (!d) {
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
    const d = parsePortalEventDateInput(String(date));
    if (!d) {
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
  const oldContent = existing.content;
  const oldPdf = extractPortalPdfUrl(existing.metadata);
  const oldCover = extractPortalCoverUrl(existing.metadata);
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

  if (content !== undefined && oldContent && oldContent !== updated.content) {
    await tryUnlinkPortalTenantFile(user.tenantId, oldContent);
  }
  if (metadata !== undefined) {
    const nextPdf = extractPortalPdfUrl(updated.metadata);
    if (oldPdf && oldPdf !== nextPdf) {
      await tryUnlinkPortalTenantFile(user.tenantId, oldPdf);
    }
    const nextCover = extractPortalCoverUrl(updated.metadata);
    if (oldCover && oldCover !== nextCover) {
      await tryUnlinkPortalTenantFile(user.tenantId, oldCover);
    }
  }

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

  await tryUnlinkPortalTenantFile(user.tenantId, existing.content);
  await tryUnlinkPortalTenantFile(user.tenantId, extractPortalPdfUrl(existing.metadata));
  await tryUnlinkPortalTenantFile(user.tenantId, extractPortalCoverUrl(existing.metadata));
  await prisma.portalItem.delete({ where: { id } });
  res.status(204).end();
});

