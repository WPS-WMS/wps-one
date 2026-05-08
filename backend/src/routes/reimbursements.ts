import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { mkdir, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, normalize, sep } from "path";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";

export const reimbursementsRouter = Router();
reimbursementsRouter.use(authMiddleware);
reimbursementsRouter.use(requireFeature("reembolsos"));

const uploadsDir = join(getUploadsRoot(), "reimbursements");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch(console.error);
}

function safeDbInfo(rawUrl: string | undefined | null) {
  const s = String(rawUrl || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return {
      host: u.host,
      db: u.pathname.replace(/^\//, "") || null,
      schema: u.searchParams.get("schema") || null,
    };
  } catch {
    return null;
  }
}

function isSuperAdmin(role: string | undefined) {
  return String(role || "") === "SUPER_ADMIN";
}

function toCentsFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

const MAX_DESC_LEN = 200;
// Proteção contra payloads/valores absurdos (mantém flexível para uso real).
const MAX_AMOUNT_CENTS = 100_000_000_00; // R$ 100.000.000,00

async function getEligibleProjectIds(params: { tenantId: string; userId: string }): Promise<string[]> {
  const { tenantId, userId } = params;

  const [responsibleRows, ticketRows, topicRows] = await Promise.all([
    prisma.projectResponsible.findMany({
      where: { userId },
      select: { projectId: true },
    }),
    prisma.ticket.findMany({
      where: {
        project: { client: { tenantId } },
        OR: [
          { assignedToId: userId },
          { createdById: userId },
          { responsibles: { some: { userId } } },
        ],
      },
      select: { projectId: true },
    }),
    prisma.ticketResponsible.findMany({
      where: {
        userId,
        ticket: { project: { client: { tenantId } } },
      },
      select: { ticket: { select: { projectId: true } } },
    }),
  ]);

  const ids = new Set<string>();
  for (const r of responsibleRows) ids.add(r.projectId);
  for (const t of ticketRows) ids.add(t.projectId);
  for (const tr of topicRows) ids.add(tr.ticket.projectId);
  return Array.from(ids);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getExtLower(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function assertAllowedAttachment(fileName: string, fileType: string) {
  const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".pdf"]);
  const ext = getExtLower(fileName);
  if (!allowedExtensions.has(ext)) {
    throw new Error("Tipo de anexo não permitido. Envie JPG, PNG ou PDF.");
  }
  const allowedMime = new Set(["image/jpeg", "image/png", "application/pdf"]);
  if (fileType && !allowedMime.has(fileType)) {
    throw new Error("Tipo de anexo não permitido. Envie JPG, PNG ou PDF.");
  }
}

// ===== Debug/Health (ajuda a validar migrations em QA) =====
reimbursementsRouter.get("/health", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  try {
    const rows = await prisma.$queryRaw<any[]>`
      select
        current_database() as db,
        current_schema() as schema,
        to_regclass('public."reimbursement_types"')::text as reimbursement_types,
        to_regclass('public."reimbursements"')::text as reimbursements,
        to_regclass('public."reimbursement_attachments"')::text as reimbursement_attachments,
        to_regclass('public."reimbursement_project_limits"')::text as reimbursement_project_limits
    `;
    const info = {
      env: {
        DATABASE_URL: safeDbInfo(process.env.DATABASE_URL),
        DIRECT_URL: safeDbInfo(process.env.DIRECT_URL),
      },
      db: rows?.[0] ?? null,
      tenantId: user.tenantId,
    };
    res.json(info);
  } catch (err) {
    console.error("[REEMBOLSOS] health error", err);
    const dbInfo = safeDbInfo(process.env.DATABASE_URL);
    res.status(500).json({
      error: "Falha ao validar health do Reembolso.",
      details: {
        code: String((err as any)?.code || "") || undefined,
        message: String((err as any)?.message || "") || undefined,
        connected: dbInfo?.host ? `${dbInfo.host}/${dbInfo.db || "?"}` : undefined,
      },
    });
  }
});

// ===== Tipos (para selects) =====
reimbursementsRouter.get("/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const list = await prisma.reimbursementType.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(list);
});

// ===== Limite por projeto + tipo (para validação client-side) =====
reimbursementsRouter.get("/limit", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const projectId = String(req.query.projectId || "").trim();
  const typeId = String(req.query.typeId || "").trim();
  if (!projectId || !typeId) {
    res.status(400).json({ error: "projectId e typeId são obrigatórios." });
    return;
  }

  const eligible = await getEligibleProjectIds({ tenantId: user.tenantId, userId: user.id });
  if (!eligible.includes(projectId)) {
    res.status(403).json({ error: "Você não pode solicitar reembolso para este projeto." });
    return;
  }

  const limit = await prisma.reimbursementProjectLimit.findFirst({
    where: { tenantId: user.tenantId, projectId, typeId },
    select: { maxValueCents: true },
  });
  res.json({ maxValueCents: limit?.maxValueCents ?? null });
});

// ===== Projetos elegíveis (para usuário solicitar) =====
reimbursementsRouter.get("/eligible-projects", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const ids = await getEligibleProjectIds({ tenantId: user.tenantId, userId: user.id });
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const projects = await prisma.project.findMany({
    where: {
      id: { in: ids },
      client: { tenantId: user.tenantId },
      arquivado: false,
    },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(projects);
});

// ===== Solicitações do usuário =====
reimbursementsRouter.get("/my", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const list = await prisma.reimbursement.findMany({
    where: { tenantId: user.tenantId, userId: user.id },
    include: {
      type: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(list);
});

type IncomingAttachment = {
  fileName?: unknown;
  fileData?: unknown;
  fileType?: unknown;
  fileSize?: unknown;
};

reimbursementsRouter.post("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;

  try {
    // Garante diretório de uploads disponível (Render/Windows pode estar sem a pasta na 1ª chamada)
    await mkdir(uploadsDir, { recursive: true });

    const { projectId, typeId, amountCents, description, attachments } = (req.body ?? {}) as {
      projectId?: unknown;
      typeId?: unknown;
      amountCents?: unknown;
      description?: unknown;
      attachments?: unknown;
    };

    const pid = String(projectId ?? "").trim();
    const tid = String(typeId ?? "").trim();
    const desc = String(description ?? "").trim();
    const cents = toCentsFromUnknown(amountCents);

    if (!pid || !tid || !desc || cents == null || cents <= 0) {
      res.status(400).json({ error: "Projeto, tipo, valor e descrição são obrigatórios." });
      return;
    }
    if (desc.length > MAX_DESC_LEN) {
      res.status(400).json({ error: `Descrição deve ter no máximo ${MAX_DESC_LEN} caracteres.` });
      return;
    }
    if (cents > MAX_AMOUNT_CENTS) {
      res.status(400).json({ error: "Valor inválido para solicitação de reembolso." });
      return;
    }

    // projeto elegível
    const eligible = await getEligibleProjectIds({ tenantId: user.tenantId, userId: user.id });
    if (!eligible.includes(pid)) {
      res.status(403).json({ error: "Você não pode solicitar reembolso para este projeto." });
      return;
    }

    const [type, limit] = await Promise.all([
      prisma.reimbursementType.findFirst({
        where: { id: tid, tenantId: user.tenantId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.reimbursementProjectLimit.findFirst({
        where: { tenantId: user.tenantId, projectId: pid, typeId: tid },
        select: { maxValueCents: true },
      }),
    ]);
    if (!type) {
      res.status(400).json({ error: "Tipo de reembolso inválido." });
      return;
    }
    if (limit && cents > limit.maxValueCents) {
      res.status(400).json({ error: "Valor excede o limite configurado para este tipo de reembolso no projeto." });
      return;
    }

    const incoming = Array.isArray(attachments) ? (attachments as IncomingAttachment[]) : [];
    if (incoming.length === 0) {
      res.status(400).json({ error: "Anexo é obrigatório para enviar a solicitação." });
      return;
    }
    if (incoming.length > 10) {
      res.status(400).json({ error: "Envie no máximo 10 anexos." });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const reimbursement = await tx.reimbursement.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          projectId: pid,
          typeId: tid,
          amountCents: cents,
          description: desc,
          status: "IN_PROGRESS",
        },
      });

      const savedAttachmentIds: string[] = [];
      const savedFilePaths: string[] = [];
      try {
        for (const a of incoming) {
          const fileName = String(a?.fileName ?? "").trim();
          const fileData = String(a?.fileData ?? "");
          const mimeFromDataUrl =
            typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
          const fileType = String(a?.fileType ?? mimeFromDataUrl ?? "").trim();
          if (!fileName || !fileData) {
            throw new Error("Anexo inválido.");
          }

          assertAllowedAttachment(fileName, fileType);

          const base64Data = fileData.replace(/^data:.*,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const maxSize = (process.env.NODE_ENV === "production" ? 30 : 10) * 1024 * 1024;
          if (buffer.length > maxSize) {
            throw new Error(
              `Anexo muito grande. Tamanho máximo: ${process.env.NODE_ENV === "production" ? "30MB" : "10MB"}`,
            );
          }

          const safe = sanitizeFileName(fileName);
          const timestamp = Date.now();
          const unique = `${reimbursement.id}-${timestamp}-${safe}`;
          const filePath = join(uploadsDir, unique);
          await writeFile(filePath, buffer);
          savedFilePaths.push(filePath);
          const fileUrl = `/uploads/reimbursements/${unique}`;

          const record = await tx.reimbursementAttachment.create({
            data: {
              reimbursementId: reimbursement.id,
              filename: fileName,
              fileUrl,
              fileType: fileType || "application/octet-stream",
              fileSize: Number(a?.fileSize) || buffer.length,
            },
            select: { id: true },
          });
          savedAttachmentIds.push(record.id);
        }
      } catch (e) {
        // best-effort cleanup: remove registros + arquivos
        if (savedAttachmentIds.length > 0) {
          await tx.reimbursementAttachment.deleteMany({ where: { id: { in: savedAttachmentIds } } });
        }
        // remove arquivos gravados (não depende do rollback do DB)
        await Promise.all(savedFilePaths.map((p) => unlink(p).catch(() => null)));
        throw e;
      }

      return reimbursement;
    });

    const full = await prisma.reimbursement.findFirst({
      where: { id: created.id, tenantId: user.tenantId },
      include: {
        type: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
      },
    });

    res.status(201).json(full);
  } catch (err) {
    const code = String((err as any)?.code || "");
    const msg = String((err as any)?.message || "");
    const isUserError =
      /^Projeto, tipo, valor e descrição são obrigatórios\./i.test(msg) ||
      /^Você não pode solicitar reembolso para este projeto\./i.test(msg) ||
      /^Tipo de reembolso inválido\./i.test(msg) ||
      /^Valor excede o limite/i.test(msg) ||
      /^Envie no máximo \d+ anexos\./i.test(msg) ||
      /^Anexo inválido\./i.test(msg) ||
      /^Tipo de anexo não permitido/i.test(msg) ||
      /^Anexo muito grande/i.test(msg);
    const isFsError =
      (err as any)?.code === "ENOENT" ||
      (err as any)?.code === "EACCES" ||
      /permission denied/i.test(msg) ||
      /no such file/i.test(msg);
    // Caso comum em QA: migrations do Reembolso ainda não aplicadas no banco
    const looksLikeMissingTable =
      code === "P2021" ||
      /relation .*reimbursement/i.test(msg) ||
      /does not exist/i.test(msg) ||
      /reimbursement_types/i.test(msg) ||
      /reimbursements/i.test(msg);

    console.error("[REEMBOLSOS] create error", err);
    if (isUserError) {
      res.status(400).json({ error: msg || "Dados inválidos para solicitação de reembolso." });
      return;
    }
    if (isFsError) {
      res.status(500).json({
        error: "Falha ao salvar anexo no servidor (armazenamento indisponível).",
        details: { code: String((err as any)?.code || "") || undefined, message: msg || undefined },
      });
      return;
    }
    if (looksLikeMissingTable) {
      // Confirma em runtime se as tabelas realmente existem.
      // Isso evita falso-positivo quando a mensagem contém "reimbursements" por outro motivo.
      try {
        const rows = await prisma.$queryRaw<any[]>`
          select
            to_regclass('public."reimbursement_types"')::text as reimbursement_types,
            to_regclass('public."reimbursements"')::text as reimbursements,
            to_regclass('public."reimbursement_attachments"')::text as reimbursement_attachments,
            to_regclass('public."reimbursement_project_limits"')::text as reimbursement_project_limits
        `;
        const r0 = rows?.[0] ?? null;
        const missing: string[] = [];
        if (!r0?.reimbursement_types) missing.push("reimbursement_types");
        if (!r0?.reimbursements) missing.push("reimbursements");
        if (!r0?.reimbursement_attachments) missing.push("reimbursement_attachments");
        if (!r0?.reimbursement_project_limits) missing.push("reimbursement_project_limits");
        const anyMissing = missing.length > 0;
        if (anyMissing) {
          const dbInfo = safeDbInfo(process.env.DATABASE_URL);
          res.status(500).json({
            error:
              "Reembolso ainda não está disponível neste ambiente (tabelas/migrations não aplicadas no banco). " +
              `Aplique as migrations do backend e tente novamente.` +
              (dbInfo?.host ? ` (backend conectado em: ${dbInfo.host}/${dbInfo.db || "?"})` : "") +
              (missing.length ? ` (faltando: ${missing.join(", ")})` : ""),
          });
          return;
        }
      } catch (e) {
        // Se o health falhar, mantém a mensagem original de migrations.
        const dbInfo = safeDbInfo(process.env.DATABASE_URL);
        res.status(500).json({
          error:
            "Reembolso ainda não está disponível neste ambiente (tabelas/migrations não aplicadas no banco). " +
            `Aplique as migrations do backend e tente novamente.` +
            (dbInfo?.host ? ` (backend conectado em: ${dbInfo.host}/${dbInfo.db || "?"})` : ""),
        });
        return;
      }
    }

    // QA: sempre devolve detalhes sanitizados (não inclui credenciais), para diagnóstico.
    res.status(500).json({
      error: "Erro ao criar solicitação de reembolso.",
      details: { code: code || undefined, message: msg || undefined },
    });
  }
});

// Download autenticado de anexo
reimbursementsRouter.get("/attachments/:id/file", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const id = String(req.params.id || "");

  const attachment = await prisma.reimbursementAttachment.findFirst({
    where: {
      id,
      reimbursement: { tenantId: user.tenantId },
    },
    select: { id: true, fileUrl: true, reimbursement: { select: { userId: true } } },
  });
  if (!attachment) {
    res.status(404).json({ error: "Anexo não encontrado" });
    return;
  }
  const canAccess = isSuperAdmin(user.role) || attachment.reimbursement.userId === user.id;
  if (!canAccess) {
    res.status(403).json({ error: "Sem permissão para acessar este anexo" });
    return;
  }

  const abs = resolveUploadsPublicPath(attachment.fileUrl);
  const root = normalize(join(getUploadsRoot(), "reimbursements")) + sep;
  if (!abs || !(normalize(abs) + sep).startsWith(root)) {
    res.status(403).json({ error: "Caminho de arquivo inválido" });
    return;
  }
  if (!existsSync(abs)) {
    res.status(404).json({ error: "Arquivo não encontrado no servidor" });
    return;
  }
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: "Erro ao enviar arquivo" });
  });
});

// ===== Admin (SUPER_ADMIN) =====
reimbursementsRouter.get("/admin/requests", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  const status = String(req.query.status || "").trim().toUpperCase();
  const where: any = { tenantId: user.tenantId };
  if (status && ["IN_PROGRESS", "REJECTED", "PAID"].includes(status)) {
    where.status = status;
  }
  const list = await prisma.reimbursement.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      type: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(list);
});

reimbursementsRouter.patch("/admin/requests/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string; id: string } }).user;
  if (!isSuperAdmin(user.role)) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  const id = String(req.params.id || "");
  const { status, rejectionReason } = (req.body ?? {}) as { status?: unknown; rejectionReason?: unknown };
  const next = String(status || "").trim().toUpperCase();
  if (!["IN_PROGRESS", "REJECTED", "PAID"].includes(next)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }
  const current = await prisma.reimbursement.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!current) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }

  const now = new Date();
  const data: any = {
    status: next,
    reviewedAt: now,
    reviewedById: user.id,
  };
  if (next === "REJECTED") {
    const reason = String(rejectionReason ?? "").trim();
    if (!reason) {
      res.status(400).json({ error: "Motivo da rejeição é obrigatório." });
      return;
    }
    data.rejectionReason = reason;
    data.paidAt = null;
  } else if (next === "PAID") {
    data.paidAt = now;
    data.rejectionReason = null;
  } else {
    data.paidAt = null;
    data.rejectionReason = null;
  }

  const updated = await prisma.reimbursement.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, email: true } },
      type: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
    },
  });
  res.json(updated);
});

reimbursementsRouter.get("/admin/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const list = await prisma.reimbursementType.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  res.json(list);
});

reimbursementsRouter.post("/admin/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const name = String((req.body ?? {})?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório." });
  const created = await prisma.reimbursementType.create({
    data: { tenantId: user.tenantId, name, isActive: true },
    select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
  res.status(201).json(created);
});

reimbursementsRouter.patch("/admin/types/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const id = String(req.params.id || "");
  const name = (req.body ?? {})?.name;
  const isActive = (req.body ?? {})?.isActive;
  const data: any = {};
  if (name != null) data.name = String(name).trim();
  if (typeof isActive === "boolean") data.isActive = isActive;
  const updated = await prisma.reimbursementType.update({
    where: { id },
    data,
    select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true },
  });
  res.json(updated);
});

reimbursementsRouter.get("/admin/projects", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const projects = await prisma.project.findMany({
    where: { client: { tenantId: user.tenantId }, arquivado: false },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(projects);
});

reimbursementsRouter.get("/admin/limits", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const projectId = String(req.query.projectId || "").trim();
  const where: any = { tenantId: user.tenantId };
  if (projectId) where.projectId = projectId;
  const list = await prisma.reimbursementProjectLimit.findMany({
    where,
    select: { id: true, projectId: true, typeId: true, maxValueCents: true, updatedAt: true },
  });
  res.json(list);
});

reimbursementsRouter.put("/admin/limits", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });

  const items = Array.isArray((req.body ?? {})?.items) ? (req.body as any).items : null;
  if (!items) return res.status(400).json({ error: "Informe items." });

  const normalized = items
    .map((x: any) => {
      const projectId = String(x?.projectId ?? "").trim();
      const typeId = String(x?.typeId ?? "").trim();
      const raw = x?.maxValueCents;
      // null/undefined => remover limite (sem limite)
      const maxValueCents = raw == null ? null : toCentsFromUnknown(raw);
      return { projectId, typeId, maxValueCents };
    })
    .filter((x: any) => x.projectId && x.typeId && (x.maxValueCents === null || (typeof x.maxValueCents === "number" && x.maxValueCents >= 0)));

  await prisma.$transaction(async (tx) => {
    for (const it of normalized) {
      if (it.maxValueCents === null) {
        await tx.reimbursementProjectLimit.deleteMany({
          where: { tenantId: user.tenantId, projectId: it.projectId, typeId: it.typeId },
        });
      } else {
        await tx.reimbursementProjectLimit.upsert({
          where: {
            tenantId_projectId_typeId: { tenantId: user.tenantId, projectId: it.projectId, typeId: it.typeId },
          },
          create: {
            tenantId: user.tenantId,
            projectId: it.projectId,
            typeId: it.typeId,
            maxValueCents: it.maxValueCents,
          },
          update: { maxValueCents: it.maxValueCents },
        });
      }
    }
  });

  res.json({ ok: true });
});

// Remover anexo (SUPER_ADMIN ou dono) — útil para correções
reimbursementsRouter.delete("/attachments/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const id = String(req.params.id || "");
  const attachment = await prisma.reimbursementAttachment.findFirst({
    where: { id, reimbursement: { tenantId: user.tenantId } },
    select: { id: true, fileUrl: true, reimbursement: { select: { userId: true } } },
  });
  if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });
  const canDelete = isSuperAdmin(user.role) || attachment.reimbursement.userId === user.id;
  if (!canDelete) return res.status(403).json({ error: "Sem permissão" });

  const filePath = resolveUploadsPublicPath(attachment.fileUrl);
  if (filePath && existsSync(filePath)) await unlink(filePath).catch(() => null);
  await prisma.reimbursementAttachment.delete({ where: { id } });
  res.status(204).end();
});

