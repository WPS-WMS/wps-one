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

function isGestorProjetos(role: string | undefined) {
  return String(role || "") === "GESTOR_PROJETOS";
}

function toCentsFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function toPositiveQuantity(value: unknown): number | null {
  if (value == null) return null;
  const raw = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(raw)) return null;
  const q = Math.round(raw * 1000) / 1000; // até 3 casas para consistência com DB
  if (q <= 0) return null;
  // proteção simples contra valores absurdos
  if (q > 1_000_000) return null;
  return q;
}

function calcTotalCentsFromQuantity(params: { quantity: number; unitValueCents: number }): number {
  const qty = Math.round(params.quantity * 1000) / 1000;
  return Math.round(qty * params.unitValueCents);
}

const MAX_DESC_LEN = 200;
// Proteção contra payloads/valores absurdos (mantém flexível para uso real).
const MAX_AMOUNT_CENTS = 100_000_000_00; // R$ 100.000.000,00

// Rate limit simples (em memória) para evitar abuso em produção.
// Observação: em ambientes com múltiplas instâncias, o limite é por instância — ainda assim ajuda.
const CREATE_WINDOW_MS = 60_000;
const CREATE_LIMIT = process.env.NODE_ENV === "production" ? 30 : 60; // req/min por usuário
const createBuckets = new Map<string, { windowStart: number; count: number }>();

function checkCreateRateLimit(key: string) {
  const now = Date.now();
  const current = createBuckets.get(key);
  if (!current || now - current.windowStart >= CREATE_WINDOW_MS) {
    createBuckets.set(key, { windowStart: now, count: 1 });
    return { ok: true as const };
  }
  if (current.count >= CREATE_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((CREATE_WINDOW_MS - (now - current.windowStart)) / 1000));
    return { ok: false as const, retryAfterSec };
  }
  current.count += 1;
  return { ok: true as const };
}

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
    select: { id: true, name: true, calcMode: true, unit: true },
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

  const [type, limit] = await Promise.all([
    prisma.reimbursementType.findFirst({
      where: { id: typeId, tenantId: user.tenantId },
      select: { id: true, calcMode: true },
    }),
    prisma.reimbursementProjectLimit.findFirst({
      where: { tenantId: user.tenantId, projectId, typeId },
      select: { maxValueCents: true, maxUnitValueCents: true },
    }),
  ]);

  // Mantém resposta simples e compatível: devolve o limite relevante conforme o tipo.
  if (type?.calcMode === "POR_UNIDADE") {
    res.json({ maxUnitValueCents: limit?.maxUnitValueCents ?? null, maxValueCents: null });
    return;
  }
  res.json({ maxValueCents: limit?.maxValueCents ?? null, maxUnitValueCents: null });
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
    const rateKey = `${user.tenantId}:${user.id}`;
    const rate = checkCreateRateLimit(rateKey);
    if (!rate.ok) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      res.status(429).json({ error: "Muitas solicitações. Tente novamente em instantes." });
      return;
    }

    // Garante diretório de uploads disponível (Render/Windows pode estar sem a pasta na 1ª chamada)
    await mkdir(uploadsDir, { recursive: true });

    const { projectId, typeId, amountCents, description, attachments, expenseDate, quantity, unitValueCents } = (req.body ?? {}) as {
      projectId?: unknown;
      typeId?: unknown;
      amountCents?: unknown;
      description?: unknown;
      attachments?: unknown;
      expenseDate?: unknown;
      quantity?: unknown;
      unitValueCents?: unknown;
    };

    const pid = String(projectId ?? "").trim();
    const tid = String(typeId ?? "").trim();
    const desc = String(description ?? "").trim();
    if (!pid || !tid || !desc) {
      res.status(400).json({ error: "Projeto, tipo e descrição são obrigatórios." });
      return;
    }
    if (desc.length > MAX_DESC_LEN) {
      res.status(400).json({ error: `Descrição deve ter no máximo ${MAX_DESC_LEN} caracteres.` });
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
        select: { id: true, name: true, calcMode: true, unit: true },
      }),
      prisma.reimbursementProjectLimit.findFirst({
        where: { tenantId: user.tenantId, projectId: pid, typeId: tid },
        select: { maxValueCents: true, maxUnitValueCents: true },
      }),
    ]);
    if (!type) {
      res.status(400).json({ error: "Tipo de reembolso inválido." });
      return;
    }

    let finalAmountCents: number | null = null;
    let finalQuantity: number | null = null;
    let finalUnitValueCents: number | null = null;

    if (type.calcMode === "POR_UNIDADE") {
      const q = toPositiveQuantity(quantity);
      const uv = toCentsFromUnknown(unitValueCents);
      if (q == null || uv == null || uv <= 0) {
        res.status(400).json({ error: "Para este tipo, informe quantidade e valor unitário." });
        return;
      }
      if (uv > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor unitário inválido para solicitação de reembolso." });
        return;
      }
      if (limit?.maxUnitValueCents != null && uv > limit.maxUnitValueCents) {
        res.status(400).json({ error: "Valor unitário excede o limite configurado para este tipo de reembolso no projeto." });
        return;
      }
      finalQuantity = q;
      finalUnitValueCents = uv;
      finalAmountCents = calcTotalCentsFromQuantity({ quantity: q, unitValueCents: uv });
    } else {
      const cents = toCentsFromUnknown(amountCents);
      if (cents == null || cents <= 0) {
        res.status(400).json({ error: "Informe o valor do reembolso." });
        return;
      }
      if (cents > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor inválido para solicitação de reembolso." });
        return;
      }
      if (limit?.maxValueCents != null && cents > limit.maxValueCents) {
        res.status(400).json({ error: "Valor excede o limite configurado para este tipo de reembolso no projeto." });
        return;
      }
      finalAmountCents = cents;
      finalQuantity = null;
      finalUnitValueCents = null;
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

    const expenseDateRaw = String(expenseDate ?? "").trim();
    let expenseDateValue: Date | null = null;
    if (expenseDateRaw) {
      // Aceita YYYY-MM-DD (date-only) e ISO; persiste como DATE no banco.
      const iso = expenseDateRaw.length === 10 ? `${expenseDateRaw}T00:00:00.000Z` : expenseDateRaw;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Data da despesa inválida." });
        return;
      }
      expenseDateValue = d;
    }

    const created = await prisma.$transaction(async (tx) => {
      const reimbursement = await tx.reimbursement.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          projectId: pid,
          typeId: tid,
          amountCents: finalAmountCents as number,
          quantity: finalQuantity == null ? undefined : finalQuantity,
          unitValueCents: finalUnitValueCents == null ? undefined : finalUnitValueCents,
          description: desc,
          expenseDate: expenseDateValue ?? undefined,
          status: "IN_PROGRESS",
        },
      });

      const savedAttachmentIds: string[] = [];
      const savedFilePaths: string[] = [];
      let totalBytes = 0;
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
          totalBytes += buffer.length;
          const maxTotal = (process.env.NODE_ENV === "production" ? 45 : 20) * 1024 * 1024;
          if (totalBytes > maxTotal) {
            throw new Error(
              `Tamanho total de anexos excede o limite (${process.env.NODE_ENV === "production" ? "45MB" : "20MB"}).`,
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

// ===== Edição da própria solicitação (apenas IN_PROGRESS) =====
reimbursementsRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const id = String(req.params.id || "");

  try {
    await mkdir(uploadsDir, { recursive: true });

    const current = await prisma.reimbursement.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        userId: true,
        status: true,
        projectId: true,
        typeId: true,
        amountCents: true,
        quantity: true,
        unitValueCents: true,
      },
    });
    if (!current) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }
    if (current.userId !== user.id) {
      res.status(403).json({ error: "Sem permissão para alterar esta solicitação." });
      return;
    }
    if (current.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "Apenas solicitações em andamento podem ser editadas." });
      return;
    }

    const body = (req.body ?? {}) as {
      projectId?: unknown;
      typeId?: unknown;
      amountCents?: unknown;
      quantity?: unknown;
      unitValueCents?: unknown;
      description?: unknown;
      expenseDate?: unknown;
      attachments?: unknown;
      removeAttachmentIds?: unknown;
    };

    const data: any = {};

    if (body.projectId !== undefined) {
      const pid = String(body.projectId ?? "").trim();
      if (!pid) {
        res.status(400).json({ error: "Projeto inválido." });
        return;
      }
      const eligible = await getEligibleProjectIds({ tenantId: user.tenantId, userId: user.id });
      if (!eligible.includes(pid)) {
        res.status(403).json({ error: "Você não pode solicitar reembolso para este projeto." });
        return;
      }
      data.projectId = pid;
    }

    if (body.typeId !== undefined) {
      const tid = String(body.typeId ?? "").trim();
      if (!tid) {
        res.status(400).json({ error: "Tipo inválido." });
        return;
      }
      const type = await prisma.reimbursementType.findFirst({
        where: { id: tid, tenantId: user.tenantId, isActive: true },
        select: { id: true },
      });
      if (!type) {
        res.status(400).json({ error: "Tipo de reembolso inválido." });
        return;
      }
      data.typeId = tid;
    }

    if (body.amountCents !== undefined) {
      const cents = toCentsFromUnknown(body.amountCents);
      if (cents == null || cents <= 0) {
        res.status(400).json({ error: "Valor inválido." });
        return;
      }
      if (cents > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor inválido para solicitação de reembolso." });
        return;
      }
      data.amountCents = cents;
    }

    if (body.quantity !== undefined) {
      const q = toPositiveQuantity(body.quantity);
      if (q == null) {
        res.status(400).json({ error: "Quantidade inválida." });
        return;
      }
      data.quantity = q;
    }

    if (body.unitValueCents !== undefined) {
      const uv = toCentsFromUnknown(body.unitValueCents);
      if (uv == null || uv <= 0) {
        res.status(400).json({ error: "Valor unitário inválido." });
        return;
      }
      if (uv > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor unitário inválido para solicitação de reembolso." });
        return;
      }
      data.unitValueCents = uv;
    }

    if (body.description !== undefined) {
      const desc = String(body.description ?? "").trim();
      if (!desc) {
        res.status(400).json({ error: "Descrição é obrigatória." });
        return;
      }
      if (desc.length > MAX_DESC_LEN) {
        res.status(400).json({ error: `Descrição deve ter no máximo ${MAX_DESC_LEN} caracteres.` });
        return;
      }
      data.description = desc;
    }

    if (body.expenseDate !== undefined) {
      const expenseDateRaw = String(body.expenseDate ?? "").trim();
      if (expenseDateRaw) {
        const iso = expenseDateRaw.length === 10 ? `${expenseDateRaw}T00:00:00.000Z` : expenseDateRaw;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Data da despesa inválida." });
          return;
        }
        data.expenseDate = d;
      } else {
        data.expenseDate = null;
      }
    }

    // Validar limite considerando valores finais (após aplicar mudanças)
    const finalProjectId = (data.projectId as string | undefined) ?? current.projectId;
    const finalTypeId = (data.typeId as string | undefined) ?? current.typeId;
    const finalType = await prisma.reimbursementType.findFirst({
      where: { id: finalTypeId, tenantId: user.tenantId, isActive: true },
      select: { id: true, calcMode: true },
    });
    if (!finalType) {
      res.status(400).json({ error: "Tipo de reembolso inválido." });
      return;
    }

    if (finalType.calcMode === "POR_UNIDADE") {
      const finalQuantity = (data.quantity as number | undefined) ?? (current as any).quantity ?? null;
      const finalUnitValue = (data.unitValueCents as number | undefined) ?? (current as any).unitValueCents ?? null;
      if (finalQuantity == null || finalUnitValue == null) {
        res.status(400).json({ error: "Para este tipo, informe quantidade e valor unitário." });
        return;
      }
      const limit = await prisma.reimbursementProjectLimit.findFirst({
        where: { tenantId: user.tenantId, projectId: finalProjectId, typeId: finalTypeId },
        select: { maxValueCents: true, maxUnitValueCents: true },
      });
      if (limit?.maxUnitValueCents != null && finalUnitValue > limit.maxUnitValueCents) {
        res.status(400).json({ error: "Valor unitário excede o limite configurado para este tipo de reembolso no projeto." });
        return;
      }
      data.amountCents = calcTotalCentsFromQuantity({
        quantity: Number(String(finalQuantity)),
        unitValueCents: Number(finalUnitValue),
      });
    } else {
      // tipo FIXO: limpa campos unitários se vierem (ou se o tipo mudou)
      data.quantity = null;
      data.unitValueCents = null;
      const finalAmount = (data.amountCents as number | undefined) ?? current.amountCents;
      if (finalAmount == null || finalAmount <= 0) {
        res.status(400).json({ error: "Informe o valor do reembolso." });
        return;
      }
      const limit = await prisma.reimbursementProjectLimit.findFirst({
        where: { tenantId: user.tenantId, projectId: finalProjectId, typeId: finalTypeId },
        select: { maxValueCents: true },
      });
      if (limit?.maxValueCents != null && finalAmount > limit.maxValueCents) {
        res.status(400).json({ error: "Valor excede o limite configurado para este tipo de reembolso no projeto." });
        return;
      }
    }

    const removeIds = Array.isArray(body.removeAttachmentIds)
      ? (body.removeAttachmentIds as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    const incoming = Array.isArray(body.attachments) ? (body.attachments as IncomingAttachment[]) : [];

    // Anexos físicos a remover (caminhos resolvidos antes da transação)
    let filesToDelete: string[] = [];
    if (removeIds.length > 0) {
      const found = await prisma.reimbursementAttachment.findMany({
        where: { id: { in: removeIds }, reimbursementId: id },
        select: { fileUrl: true },
      });
      filesToDelete = found
        .map((a) => resolveUploadsPublicPath(a.fileUrl))
        .filter((p): p is string => Boolean(p));
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.reimbursement.update({ where: { id }, data });
      }

      if (removeIds.length > 0) {
        await tx.reimbursementAttachment.deleteMany({
          where: { id: { in: removeIds }, reimbursementId: id },
        });
      }

      if (incoming.length > 0) {
        const remaining = await tx.reimbursementAttachment.count({ where: { reimbursementId: id } });
        if (remaining + incoming.length > 10) {
          throw new Error("Total de anexos excede o limite (máximo 10).");
        }

        const savedFilePaths: string[] = [];
        let totalBytes = 0;
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
            totalBytes += buffer.length;
            const maxTotal = (process.env.NODE_ENV === "production" ? 45 : 20) * 1024 * 1024;
            if (totalBytes > maxTotal) {
              throw new Error(
                `Tamanho total de anexos excede o limite (${process.env.NODE_ENV === "production" ? "45MB" : "20MB"}).`,
              );
            }

            const safe = sanitizeFileName(fileName);
            const timestamp = Date.now();
            const unique = `${id}-${timestamp}-${safe}`;
            const filePath = join(uploadsDir, unique);
            await writeFile(filePath, buffer);
            savedFilePaths.push(filePath);
            const fileUrl = `/uploads/reimbursements/${unique}`;

            await tx.reimbursementAttachment.create({
              data: {
                reimbursementId: id,
                filename: fileName,
                fileUrl,
                fileType: fileType || "application/octet-stream",
                fileSize: Number(a?.fileSize) || buffer.length,
              },
            });
          }
        } catch (e) {
          await Promise.all(savedFilePaths.map((p) => unlink(p).catch(() => null)));
          throw e;
        }
      }
    });

    // Apaga arquivos físicos dos anexos removidos (best-effort após commit)
    await Promise.all(filesToDelete.map((p) => unlink(p).catch(() => null)));

    const full = await prisma.reimbursement.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        type: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
      },
    });
    res.json(full);
  } catch (err) {
    console.error("[REEMBOLSOS] update error", err);
    const msg = String((err as any)?.message || "");
    const isUserError =
      /^Anexo inválido\./i.test(msg) ||
      /^Tipo de anexo não permitido/i.test(msg) ||
      /^Anexo muito grande/i.test(msg) ||
      /^Total de anexos excede/i.test(msg) ||
      /^Tamanho total de anexos/i.test(msg);
    if (isUserError) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: "Erro ao atualizar solicitação." });
  }
});

// ===== Exclusão da própria solicitação (apenas IN_PROGRESS) =====
reimbursementsRouter.delete("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const id = String(req.params.id || "");

  try {
    const current = await prisma.reimbursement.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        userId: true,
        status: true,
        attachments: { select: { id: true, fileUrl: true } },
      },
    });
    if (!current) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }
    if (current.userId !== user.id) {
      res.status(403).json({ error: "Sem permissão para excluir esta solicitação." });
      return;
    }
    if (current.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "Apenas solicitações em andamento podem ser excluídas." });
      return;
    }

    const filesToRemove = current.attachments
      .map((a) => resolveUploadsPublicPath(a.fileUrl))
      .filter((p): p is string => Boolean(p));

    await prisma.$transaction(async (tx) => {
      await tx.reimbursementAttachment.deleteMany({ where: { reimbursementId: id } });
      await tx.reimbursement.delete({ where: { id } });
    });

    await Promise.all(
      filesToRemove.map((p) => (existsSync(p) ? unlink(p).catch(() => null) : Promise.resolve())),
    );

    res.status(204).end();
  } catch (err) {
    console.error("[REEMBOLSOS] delete error", err);
    res.status(500).json({ error: "Erro ao excluir solicitação." });
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
    select: { id: true, filename: true, fileType: true, fileUrl: true, reimbursement: { select: { userId: true } } },
  });
  if (!attachment) {
    res.status(404).json({ error: "Anexo não encontrado" });
    return;
  }
  const canAccess =
    isSuperAdmin(user.role) || isGestorProjetos(user.role) || attachment.reimbursement.userId === user.id;
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
  res.setHeader("Content-Type", attachment.fileType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
  res.download(abs, attachment.filename, (err) => {
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
    select: { id: true, name: true, isActive: true, calcMode: true, unit: true, createdAt: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  res.json(list);
});

reimbursementsRouter.post("/admin/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  try {
    const body = (req.body ?? {}) as { name?: unknown; calcMode?: unknown; unit?: unknown };
    const name = String(body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nome é obrigatório." });
    const calcModeRaw = String(body?.calcMode ?? "FIXO").trim().toUpperCase();
    const calcMode = calcModeRaw === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO";
    const unit = String(body?.unit ?? "").trim();
    if (calcMode === "POR_UNIDADE" && !unit) {
      return res.status(400).json({ error: "Unidade é obrigatória para tipo por unidade." });
    }
    const created = await prisma.reimbursementType.create({
      data: { tenantId: user.tenantId, name, isActive: true, calcMode, unit: unit || null },
      select: { id: true, name: true, isActive: true, calcMode: true, unit: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("[REEMBOLSOS] admin create type error", err);
    res.status(500).json({ error: "Erro ao criar tipo de reembolso." });
  }
});

reimbursementsRouter.patch("/admin/types/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });
  const id = String(req.params.id || "");
  try {
    const current = await prisma.reimbursementType.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, name: true, isActive: true, calcMode: true, unit: true },
    });
    if (!current) {
      res.status(404).json({ error: "Tipo de reembolso não encontrado." });
      return;
    }

    const body = (req.body ?? {}) as { name?: unknown; isActive?: unknown; calcMode?: unknown; unit?: unknown };
    const name = body.name;
    const isActive = body.isActive;
    const calcMode = body.calcMode;
    const unit = body.unit;

    const data: any = {};
    if (name != null) {
      const n = String(name).trim();
      if (!n) {
        res.status(400).json({ error: "Nome do tipo não pode ser vazio." });
        return;
      }
      data.name = n;
    }
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (calcMode != null) {
      const raw = String(calcMode).trim().toUpperCase();
      data.calcMode = raw === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO";
    }
    if (unit !== undefined) {
      data.unit = String(unit ?? "").trim() || null;
    }

    // Estado final após o PATCH (campos omitidos no body mantêm o valor atual).
    const finalCalcMode = (data.calcMode as string | undefined) ?? String(current.calcMode || "FIXO");
    const finalUnit =
      unit !== undefined ? (String(unit ?? "").trim() || null) : (current.unit as string | null);

    if (finalCalcMode === "POR_UNIDADE" && !String(finalUnit || "").trim()) {
      res.status(400).json({ error: "Unidade é obrigatória para tipo por unidade (ex.: km, litro)." });
      return;
    }
    if (finalCalcMode === "FIXO") {
      data.unit = null;
    }

    if (Object.keys(data).length === 0) {
      const unchanged = await prisma.reimbursementType.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, name: true, isActive: true, calcMode: true, unit: true, createdAt: true, updatedAt: true },
      });
      res.json(unchanged);
      return;
    }

    const updated = await prisma.reimbursementType.update({
      where: { id },
      data,
      select: { id: true, name: true, isActive: true, calcMode: true, unit: true, createdAt: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err: any) {
    const code = String(err?.code || "");
    const msg = String(err?.message || "");
    console.error("[REEMBOLSOS] admin update type error", err);
    if (code === "P2002") {
      res.status(400).json({ error: "Já existe um tipo com este nome para o seu tenant." });
      return;
    }
    if (code === "P2025") {
      res.status(404).json({ error: "Tipo de reembolso não encontrado." });
      return;
    }
    // Colunas/schema desatualizados no banco (ex.: migration não aplicada no ambiente do Render).
    if (code === "P2022" || /column .* does not exist/i.test(msg) || /Unknown column/i.test(msg)) {
      res.status(500).json({
        error: "Banco desatualizado para reembolsos. Aplique as migrations do backend neste ambiente (Prisma migrate deploy).",
        details: { code: code || undefined },
      });
      return;
    }
    res.status(500).json({
      error: "Erro ao atualizar tipo de reembolso.",
      // Sempre devolve código/mensagem curta (rota admin) para diagnosticar QA/produção sem abrir logs.
      details: {
        code: code || undefined,
        message: msg ? msg.slice(0, 800) : String(err?.name || err || "").slice(0, 200),
      },
    });
  }
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
    select: { id: true, projectId: true, typeId: true, maxValueCents: true, maxUnitValueCents: true, updatedAt: true },
  });
  res.json(list);
});

// ===== Relatório (Relatórios > Reembolsos) =====
reimbursementsRouter.get("/report", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const role = String(user.role ?? "").toUpperCase();
  const canSeeAll = role === "SUPER_ADMIN" || role === "GESTOR_PROJETOS";

  const start = String(req.query.start ?? "").trim();
  const end = String(req.query.end ?? "").trim();
  const typeId = String(req.query.typeId ?? "").trim();
  const userIdRaw = String(req.query.userId ?? "").trim();

  const where: any = { tenantId: user.tenantId };

  // Escopo por perfil
  if (!canSeeAll) {
    where.userId = user.id;
  } else if (userIdRaw) {
    where.userId = userIdRaw;
  }

  // Filtro por tipo
  if (typeId) where.typeId = typeId;

  // Filtro por data (createdAt)
  const createdAt: any = {};
  if (start) {
    const iso = start.length === 10 ? `${start}T00:00:00.000Z` : start;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (end) {
    const iso = end.length === 10 ? `${end}T23:59:59.999Z` : end;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  const list = await prisma.reimbursement.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      type: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  res.json(list);
});

reimbursementsRouter.put("/admin/limits", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!isSuperAdmin(user.role)) return res.status(403).json({ error: "Sem permissão." });

  try {
    const items = Array.isArray((req.body ?? {})?.items) ? (req.body as any).items : null;
    if (!items) return res.status(400).json({ error: "Informe items." });

    const normalized = items
      .map((x: any) => {
        const projectId = String(x?.projectId ?? "").trim();
        const typeId = String(x?.typeId ?? "").trim();
        const rawValue = x?.maxValueCents;
        const rawUnit = x?.maxUnitValueCents;
        // null/undefined => remover limite (sem limite)
        const maxValueCents = rawValue == null ? null : toCentsFromUnknown(rawValue);
        const maxUnitValueCents = rawUnit == null ? null : toCentsFromUnknown(rawUnit);
        return { projectId, typeId, maxValueCents, maxUnitValueCents };
      })
      .filter(
        (x: any) =>
          x.projectId &&
          x.typeId &&
          (x.maxValueCents === null || (typeof x.maxValueCents === "number" && x.maxValueCents >= 0)) &&
          (x.maxUnitValueCents === null || (typeof x.maxUnitValueCents === "number" && x.maxUnitValueCents >= 0)),
      );

    await prisma.$transaction(async (tx) => {
      for (const it of normalized) {
        const shouldDelete = it.maxValueCents === null && it.maxUnitValueCents === null;
        if (shouldDelete) {
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
              maxUnitValueCents: it.maxUnitValueCents,
            },
            update: { maxValueCents: it.maxValueCents, maxUnitValueCents: it.maxUnitValueCents },
          });
        }
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[REEMBOLSOS] admin save limits error", err);
    res.status(500).json({ error: "Erro ao salvar limites de reembolso." });
  }
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

