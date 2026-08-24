import { Request, Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { hasGlobalViewAccess, isFeatureAllowed } from "../lib/permissions.js";
import { mkdir, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, normalize, sep } from "path";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { errorSummary } from "../lib/devLog.js";
import { isProductionDeploy } from "../lib/deployEnv.js";
import { notifyProjectResponsibleOfReembolso } from "../lib/reimbursementEmailNotifications.js";
import { contentDispositionAttachment } from "../lib/contentDisposition.js";

export const reimbursementsRouter = Router();
reimbursementsRouter.use(authMiddleware);
reimbursementsRouter.use((req, res, next) => {
  const p = String(req.path || "").split("?")[0] || "";
  if (p === "/health") {
    return next();
  }
  if (p === "/report" || p.startsWith("/report/")) {
    return requireAnyFeature([
      "relatorios.reembolsos",
      "relatorios.reembolsosVerTodos",
      "configuracoes.reembolso",
      "financeiro.aprovarReembolso",
    ])(req, res, next);
  }
  if (p.startsWith("/admin/requests")) {
    return requireAnyFeature(["financeiro.aprovarReembolso", "configuracoes.reembolso"])(
      req,
      res,
      next,
    );
  }
  if (p.startsWith("/admin")) {
    return requireFeature("configuracoes.reembolso")(req, res, next);
  }
  if (p === "/types" || p === "/eligible-projects" || p.startsWith("/attachments/")) {
    return requireAnyFeature([
      "reembolsos",
      "relatorios.reembolsos",
      "relatorios.reembolsosVerTodos",
      "configuracoes.reembolso",
      "financeiro.aprovarReembolso",
    ])(req, res, next);
  }
  return requireFeature("reembolsos")(req, res, next);
});

const uploadsDir = join(getUploadsRoot(), "reimbursements");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch((e) => console.error("[REEMBOLSOS] mkdir uploads", errorSummary(e)));
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

async function canReimbursementsConfigAdmin(user: { tenantId: string; role: string }): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  return isFeatureAllowed({
    tenantId: user.tenantId,
    role: user.role,
    featureId: "configuracoes.reembolso",
  });
}

/** Aprovar/rejeitar solicitações na tela Financeiro > Aprovar reembolsos. */
async function canApproveReimbursements(user: { tenantId: string; role: string }): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  const [approveOk, cfgOk] = await Promise.all([
    isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureId: "financeiro.aprovarReembolso",
    }),
    isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureId: "configuracoes.reembolso",
    }),
  ]);
  return approveOk || cfgOk;
}

async function canAccessAnyReimbursementAttachment(user: { id: string; tenantId: string; role: string }): Promise<boolean> {
  if (isSuperAdmin(user.role) || isGestorProjetos(user.role)) return true;
  const [reportOk, reportAllOk, cfgOk, approveOk] = await Promise.all([
    isFeatureAllowed({ tenantId: user.tenantId, role: user.role, featureId: "relatorios.reembolsos" }),
    isFeatureAllowed({ tenantId: user.tenantId, role: user.role, featureId: "relatorios.reembolsosVerTodos" }),
    isFeatureAllowed({ tenantId: user.tenantId, role: user.role, featureId: "configuracoes.reembolso" }),
    isFeatureAllowed({ tenantId: user.tenantId, role: user.role, featureId: "financeiro.aprovarReembolso" }),
  ]);
  return reportOk || reportAllOk || cfgOk || approveOk;
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

/** Limite zerado: não permite solicitação até o admin ajustar ou marcar “sem limite”. */
const REIMBURSEMENT_ZERO_LIMIT_MSG =
  "Este tipo está com limite zerado (R$ 0,00) neste projeto. Peça a um Super Admin para definir um valor em Configurações → Reembolsos → Limites por projeto, ou marque “Sem limite” se não houver teto.";

/** Não existe registro de limite para o par projeto + tipo. */
const REIMBURSEMENT_NO_LIMIT_ROW_MSG =
  "Este tipo ainda não está disponível para solicitação neste projeto. Entre em contato com o administrado.";

const MAX_DESC_LEN = 200;
const REIMBURSEMENT_PAYMENT_TO_VALUES = new Set(["EMPRESA", "CONSULTOR"]);
// Proteção contra payloads/valores absurdos (mantém flexível para uso real).
const MAX_AMOUNT_CENTS = 100_000_000_00; // R$ 100.000.000,00

function parsePaymentTo(value: unknown, opts?: { required?: boolean }): { ok: true; value: string } | { ok: false; error: string } {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) {
    if (opts?.required) {
      return { ok: false, error: 'Selecione "Pagamento para" (Empresa ou Consultor).' };
    }
    return { ok: true, value: "" };
  }
  if (!REIMBURSEMENT_PAYMENT_TO_VALUES.has(raw)) {
    return { ok: false, error: 'Pagamento para inválido. Use Empresa ou Consultor.' };
  }
  return { ok: true, value: raw };
}

/** Fuso para regra “mês atual / não futuro” na data da despesa (env `REIMBURSEMENT_DATE_TZ`, ex.: America/Sao_Paulo). */
const REIMBURSEMENT_DATE_TZ = String(process.env.REIMBURSEMENT_DATE_TZ || "America/Sao_Paulo").trim() || "America/Sao_Paulo";

function ymdPartsInTimeZone(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { y: year, m: month, d: day };
}

function parseStrictYmd(ymd: string): { y: number; m: number; d: number } | null {
  const t = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const y = Number(t.slice(0, 4));
  const mo = Number(t.slice(5, 7));
  const d = Number(t.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function expenseYmdKey(y: number, m: number, d: number): number {
  return y * 10_000 + m * 100 + d;
}

function dateToYmdUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function normalizeExpenseInputToYmd(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const p = ymdPartsInTimeZone(d, REIMBURSEMENT_DATE_TZ);
  if (!Number.isFinite(p.y) || !Number.isFinite(p.m) || !Number.isFinite(p.d)) return null;
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Data da despesa: calendário do mês atual no fuso configurado e não posterior a “hoje” nesse fuso. */
function validateExpenseDatePolicy(raw: string, now: Date = new Date()): { ok: true; date: Date } | { ok: false; error: string } {
  const ymd = normalizeExpenseInputToYmd(raw);
  if (!ymd) {
    return { ok: false, error: "Data da despesa inválida." };
  }
  const parsed = parseStrictYmd(ymd);
  if (!parsed) {
    return { ok: false, error: "Data da despesa inválida." };
  }
  const today = ymdPartsInTimeZone(now, REIMBURSEMENT_DATE_TZ);
  if (!Number.isFinite(today.y) || !Number.isFinite(today.m) || !Number.isFinite(today.d)) {
    return { ok: false, error: "Data da despesa inválida." };
  }
  if (parsed.y !== today.y || parsed.m !== today.m) {
    return { ok: false, error: "A data da despesa precisa estar no mês atual." };
  }
  const ek = expenseYmdKey(parsed.y, parsed.m, parsed.d);
  const tk = expenseYmdKey(today.y, today.m, today.d);
  if (ek > tk) {
    return { ok: false, error: "A data da despesa não pode ser posterior à data de hoje." };
  }
  const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  return { ok: true, date };
}

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

// ===== Debug/Health (ajuda a validar migrations em QA; indisponível em prod) =====
reimbursementsRouter.get("/health", async (req, res) => {
  if (isProductionDeploy()) {
    res.status(404).end();
    return;
  }
  const user = (req as Request & { user: { tenantId: string; role?: string } }).user;
  if (user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
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
    console.error("[REEMBOLSOS] health error", errorSummary(err));
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
    select: { id: true, name: true, calcMode: true, unit: true, attachmentRequired: true },
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
      where: { id: typeId, tenantId: user.tenantId, isActive: true },
      select: { id: true, calcMode: true },
    }),
    prisma.reimbursementProjectLimit.findFirst({
      where: { tenantId: user.tenantId, projectId, typeId },
      select: { maxValueCents: true, maxUnitValueCents: true },
    }),
  ]);

  if (!type) {
    res.status(400).json({ error: "Tipo de reembolso inválido." });
    return;
  }

  if (!limit) {
    res.json({
      maxValueCents: null,
      maxUnitValueCents: null,
      solicitationBlocked: true,
      blockReason: REIMBURSEMENT_NO_LIMIT_ROW_MSG,
    });
    return;
  }

  if (type.calcMode === "POR_UNIDADE") {
    if (limit.maxUnitValueCents === 0) {
      res.json({
        maxUnitValueCents: 0,
        maxValueCents: null,
        solicitationBlocked: true,
        blockReason: REIMBURSEMENT_ZERO_LIMIT_MSG,
      });
      return;
    }
    res.json({
      maxUnitValueCents: limit.maxUnitValueCents,
      maxValueCents: null,
      solicitationBlocked: false,
      blockReason: null,
    });
    return;
  }

  if (limit.maxValueCents === 0) {
    res.json({
      maxValueCents: 0,
      maxUnitValueCents: null,
      solicitationBlocked: true,
      blockReason: REIMBURSEMENT_ZERO_LIMIT_MSG,
    });
    return;
  }

  res.json({
    maxValueCents: limit.maxValueCents,
    maxUnitValueCents: null,
    solicitationBlocked: false,
    blockReason: null,
  });
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
  try {
    const { normalizeLegacyPaidReimbursements } = await import(
      "../lib/syncReimbursementFinanceStatus.js"
    );
    await normalizeLegacyPaidReimbursements(user.tenantId);
  } catch (e) {
    console.error("[reimbursements] normalize legacy paid (my)", errorSummary(e));
  }
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

    const { projectId, typeId, amountCents, description, paymentTo, attachments, expenseDate, quantity, unitValueCents } =
      (req.body ?? {}) as {
      projectId?: unknown;
      typeId?: unknown;
      amountCents?: unknown;
      description?: unknown;
      paymentTo?: unknown;
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
    const paymentToParsed = parsePaymentTo(paymentTo, { required: true });
    if (paymentToParsed.ok === false) {
      res.status(400).json({ error: paymentToParsed.error });
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
        select: { id: true, name: true, calcMode: true, unit: true, attachmentRequired: true },
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

    if (!limit) {
      res.status(400).json({ error: REIMBURSEMENT_NO_LIMIT_ROW_MSG });
      return;
    }

    let finalAmountCents: number | null = null;
    let finalQuantity: number | null = null;
    let finalUnitValueCents: number | null = null;

    if (type.calcMode === "POR_UNIDADE") {
      if (limit.maxUnitValueCents === 0) {
        res.status(400).json({ error: REIMBURSEMENT_ZERO_LIMIT_MSG });
        return;
      }
      const q = toPositiveQuantity(quantity);
      if (q == null) {
        res.status(400).json({ error: "Para este tipo, informe a quantidade (ex.: km rodados)." });
        return;
      }
      // Taxa por unidade: se existir no projeto, usa sempre o valor configurado (não aceita outro no body).
      let uv: number | null = null;
      if (limit.maxUnitValueCents != null) {
        uv = limit.maxUnitValueCents;
      } else {
        uv = toCentsFromUnknown(unitValueCents);
        if (uv == null || uv <= 0) {
          res.status(400).json({
            error:
              "Para este tipo, configure o valor por unidade em “Limites por projeto” (recomendado) ou informe o valor unitário na solicitação.",
          });
          return;
        }
      }
      if (uv > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor unitário inválido para solicitação de reembolso." });
        return;
      }
      finalQuantity = q;
      finalUnitValueCents = uv;
      finalAmountCents = calcTotalCentsFromQuantity({ quantity: q, unitValueCents: uv });
    } else {
      if (limit.maxValueCents === 0) {
        res.status(400).json({ error: REIMBURSEMENT_ZERO_LIMIT_MSG });
        return;
      }
      const cents = toCentsFromUnknown(amountCents);
      if (cents == null || cents <= 0) {
        res.status(400).json({ error: "Informe o valor do reembolso." });
        return;
      }
      if (cents > MAX_AMOUNT_CENTS) {
        res.status(400).json({ error: "Valor inválido para solicitação de reembolso." });
        return;
      }
      if (limit.maxValueCents != null && cents > limit.maxValueCents) {
        res.status(400).json({ error: "Valor excede o limite configurado para este tipo de reembolso no projeto." });
        return;
      }
      finalAmountCents = cents;
      finalQuantity = null;
      finalUnitValueCents = null;
    }

    const incoming = Array.isArray(attachments) ? (attachments as IncomingAttachment[]) : [];
    if (type.attachmentRequired && incoming.length === 0) {
      res.status(400).json({ error: "Anexo é obrigatório para enviar a solicitação." });
      return;
    }
    if (incoming.length > 10) {
      res.status(400).json({ error: "Envie no máximo 10 anexos." });
      return;
    }

    const expenseDateRaw = String(expenseDate ?? "").trim();
    if (!expenseDateRaw) {
      res.status(400).json({ error: "Informe a data da despesa." });
      return;
    }
    const expenseCheck = validateExpenseDatePolicy(expenseDateRaw);
    if (expenseCheck.ok === false) {
      res.status(400).json({ error: expenseCheck.error });
      return;
    }
    const expenseDateValue = expenseCheck.date;

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
          paymentTo: paymentToParsed.value,
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

    if (full) {
      void notifyProjectResponsibleOfReembolso({
        tenantId: user.tenantId,
        projectId: full.projectId,
        solicitanteUserId: user.id,
        amountCents: full.amountCents,
        tipoNome: full.type?.name ?? "—",
        descricaoPreview: String(full.description ?? ""),
      }).catch(() => null);
    }

    res.status(201).json(full);
  } catch (err) {
    const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : String((err as any)?.code || "");
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

    console.error("[REEMBOLSOS] create error", errorSummary(err));
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

    /** Schema do Postgres atrás do Prisma (migrations não aplicadas em produção). */
    if (
      code === "P2022" ||
      /column .* does not exist/i.test(msg) ||
      /Unknown column/i.test(msg) ||
      /does not exist on the type/i.test(msg)
    ) {
      res.status(500).json({
        error:
          "Base de dados desatualizada para reembolsos. Execute `npx prisma migrate deploy` no backend deste ambiente (coluna ou tabela em falta).",
        details: { code: code || "P2022", message: msg ? msg.slice(0, 600) : undefined },
      });
      return;
    }
    if (code === "P2003") {
      res.status(400).json({
        error: "Projeto ou tipo de reembolso inválido. Atualize a página e confira se o tipo está ativo para este projeto.",
        details: { code },
      });
      return;
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
      res.status(400).json({
        error: "Dados inválidos para criar o reembolso. Verifique valores e anexos.",
        details: { message: msg ? msg.slice(0, 400) : undefined },
      });
      return;
    }

    // QA/produção: detalhes curtos ajudam suporte sem abrir só os logs.
    res.status(500).json({
      error: "Erro ao criar solicitação de reembolso.",
      details: { code: code || undefined, message: msg ? msg.slice(0, 800) : undefined },
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
        expenseDate: true,
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
      paymentTo?: unknown;
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
      if (body.quantity === null) {
        data.quantity = null;
      } else {
        const q = toPositiveQuantity(body.quantity);
        if (q == null) {
          res.status(400).json({ error: "Quantidade inválida." });
          return;
        }
        data.quantity = q;
      }
    }

    if (body.unitValueCents !== undefined) {
      if (body.unitValueCents === null) {
        data.unitValueCents = null;
      } else {
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

    if (body.paymentTo !== undefined) {
      const pt = parsePaymentTo(body.paymentTo, { required: true });
      if (pt.ok === false) {
        res.status(400).json({ error: pt.error });
        return;
      }
      data.paymentTo = pt.value;
    }

    if (body.expenseDate !== undefined) {
      const expenseDateRaw = String(body.expenseDate ?? "").trim();
      if (!expenseDateRaw) {
        res.status(400).json({ error: "Data da despesa é obrigatória." });
        return;
      }
      const expenseChk = validateExpenseDatePolicy(expenseDateRaw);
      if (expenseChk.ok === false) {
        res.status(400).json({ error: expenseChk.error });
        return;
      }
      data.expenseDate = expenseChk.date;
    }

    const resolvedExpenseDate =
      data.expenseDate !== undefined ? (data.expenseDate as Date) : (current.expenseDate as Date | null);
    if (!resolvedExpenseDate) {
      res.status(400).json({ error: "Informe a data da despesa." });
      return;
    }
    const resolvedYmd = dateToYmdUTC(resolvedExpenseDate);
    const expensePolicyChk = validateExpenseDatePolicy(resolvedYmd);
    if (expensePolicyChk.ok === false) {
      res.status(400).json({ error: expensePolicyChk.error });
      return;
    }

    // Validar limite considerando valores finais (após aplicar mudanças)
    const finalProjectId = (data.projectId as string | undefined) ?? current.projectId;
    const finalTypeId = (data.typeId as string | undefined) ?? current.typeId;
    const finalType = await prisma.reimbursementType.findFirst({
      where: { id: finalTypeId, tenantId: user.tenantId, isActive: true },
      select: { id: true, calcMode: true, attachmentRequired: true },
    });
    if (!finalType) {
      res.status(400).json({ error: "Tipo de reembolso inválido." });
      return;
    }

    const limitForPatch = await prisma.reimbursementProjectLimit.findFirst({
      where: { tenantId: user.tenantId, projectId: finalProjectId, typeId: finalTypeId },
      select: { maxValueCents: true, maxUnitValueCents: true },
    });
    if (!limitForPatch) {
      res.status(400).json({ error: REIMBURSEMENT_NO_LIMIT_ROW_MSG });
      return;
    }

    if (finalType.calcMode === "POR_UNIDADE") {
      if (limitForPatch.maxUnitValueCents === 0) {
        res.status(400).json({ error: REIMBURSEMENT_ZERO_LIMIT_MSG });
        return;
      }
      const finalQuantityRaw = (data.quantity as number | undefined) ?? (current as any).quantity ?? null;
      const finalQuantity = finalQuantityRaw == null ? null : Number(String(finalQuantityRaw));
      if (finalQuantity == null || !Number.isFinite(finalQuantity) || finalQuantity <= 0) {
        res.status(400).json({ error: "Para este tipo, informe uma quantidade válida (ex.: km rodados)." });
        return;
      }
      let finalUnitValue: number | null = null;
      if (limitForPatch.maxUnitValueCents != null) {
        finalUnitValue = limitForPatch.maxUnitValueCents;
      } else {
        const fromBody = data.unitValueCents as number | undefined;
        const fromCurrent = (current as any).unitValueCents as number | undefined;
        const cand = fromBody ?? fromCurrent ?? null;
        finalUnitValue = cand == null ? null : Number(cand);
        if (finalUnitValue == null || !Number.isFinite(finalUnitValue) || finalUnitValue <= 0) {
          res.status(400).json({
            error:
              "Para este tipo, configure o valor por unidade em “Limites por projeto” ou informe o valor unitário na solicitação.",
          });
          return;
        }
      }
      data.unitValueCents = finalUnitValue;
      data.quantity = finalQuantity;
      data.amountCents = calcTotalCentsFromQuantity({
        quantity: finalQuantity,
        unitValueCents: finalUnitValue,
      });
    } else {
      // tipo FIXO: limpa campos unitários se vierem (ou se o tipo mudou)
      if (limitForPatch.maxValueCents === 0) {
        res.status(400).json({ error: REIMBURSEMENT_ZERO_LIMIT_MSG });
        return;
      }
      data.quantity = null;
      data.unitValueCents = null;
      const finalAmount = (data.amountCents as number | undefined) ?? current.amountCents;
      if (finalAmount == null || finalAmount <= 0) {
        res.status(400).json({ error: "Informe o valor do reembolso." });
        return;
      }
      if (limitForPatch.maxValueCents != null && finalAmount > limitForPatch.maxValueCents) {
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

    if (finalType.attachmentRequired) {
      const attachmentCount = await prisma.reimbursementAttachment.count({ where: { reimbursementId: id } });
      if (attachmentCount === 0) {
        res.status(400).json({ error: "Anexo é obrigatório para este tipo de reembolso." });
        return;
      }
    }

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
    console.error("[REEMBOLSOS] update error", errorSummary(err));
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
    console.error("[REEMBOLSOS] delete error", errorSummary(err));
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
    attachment.reimbursement.userId === user.id || (await canAccessAnyReimbursementAttachment(user));
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
  res.setHeader("Content-Disposition", contentDispositionAttachment(attachment.filename));
  res.download(abs, attachment.filename, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: "Erro ao enviar arquivo" });
  });
});

// ===== Admin — listagem/aprovação (financeiro.aprovarReembolso) =====
reimbursementsRouter.get("/admin/requests", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!(await canApproveReimbursements(user))) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  const status = String(req.query.status || "").trim().toUpperCase();
  const paymentTo = String(req.query.paymentTo || "").trim().toUpperCase();
  const userId = String(req.query.userId || "").trim();
  const projectId = String(req.query.projectId || "").trim();
  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (status && ["IN_PROGRESS", "APPROVED", "REJECTED", "PAID", "CANCELLED"].includes(status)) {
    where.status = status;
  }
  if (paymentTo && ["EMPRESA", "CONSULTOR"].includes(paymentTo)) {
    where.paymentTo = paymentTo;
  }
  if (userId) where.userId = userId;
  if (projectId) where.projectId = projectId;
  try {
    const { normalizeLegacyPaidReimbursements } = await import(
      "../lib/syncReimbursementFinanceStatus.js"
    );
    await normalizeLegacyPaidReimbursements(user.tenantId);
  } catch (e) {
    console.error("[reimbursements] normalize legacy paid", errorSummary(e));
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
  if (!(await canApproveReimbursements(user))) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  const id = String(req.params.id || "");
  const { status, rejectionReason } = (req.body ?? {}) as { status?: unknown; rejectionReason?: unknown };
  const nextRaw = String(status || "").trim().toUpperCase();
  // Compat: "PAID" no botão antigo de aprovação passa a significar APPROVED.
  const next = nextRaw === "PAID" ? "APPROVED" : nextRaw;
  if (!["IN_PROGRESS", "APPROVED", "REJECTED"].includes(next)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }
  const current = await prisma.reimbursement.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, status: true },
  });
  if (!current) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }

  // Reverter (APPROVED/CANCELLED → IN_PROGRESS): cancela CP/CR abertos; bloqueia se já liquidados.
  if (next === "IN_PROGRESS") {
    if (!["APPROVED", "CANCELLED"].includes(current.status)) {
      res.status(400).json({
        error: "Só é possível reverter reembolsos aprovados ou cancelados.",
      });
      return;
    }

    const [payable, receivable] = await Promise.all([
      prisma.payable.findFirst({
        where: { reimbursementId: id, tenantId: user.tenantId },
        select: { id: true, status: true },
      }),
      prisma.receivable.findFirst({
        where: { tenantId: user.tenantId, sourceType: "REIMBURSEMENT", sourceId: id },
        select: { id: true, status: true },
      }),
    ]);

    if (payable?.status === "PAGO" || receivable?.status === "RECEBIDO") {
      res.status(400).json({
        error:
          "Não é possível reverter: a conta a pagar ou a receber já foi liquidada. Estorne a liquidação no financeiro antes.",
      });
      return;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (payable && payable.status !== "CANCELADO") {
          await tx.payable.update({
            where: { id: payable.id },
            data: { status: "CANCELADO", updatedById: user.id },
          });
          await tx.payableInstallment.updateMany({
            where: { payableId: payable.id, status: { not: "PAGO" } },
            data: { status: "CANCELADO" },
          });
          await tx.payableHistory.create({
            data: {
              payableId: payable.id,
              userId: user.id,
              action: "CANCEL",
              details: "Conta cancelada ao reverter aprovação do reembolso.",
            },
          });
        }
        if (receivable && receivable.status !== "CANCELADO") {
          await tx.receivable.update({
            where: { id: receivable.id },
            data: { status: "CANCELADO", updatedById: user.id },
          });
          await tx.receivableInstallment.updateMany({
            where: { receivableId: receivable.id, status: { not: "RECEBIDO" } },
            data: { status: "CANCELADO" },
          });
          await tx.receivableHistory.create({
            data: {
              receivableId: receivable.id,
              userId: user.id,
              action: "CANCEL",
              details: "Conta cancelada ao reverter aprovação do reembolso.",
            },
          });
        }
        await tx.reimbursement.update({
          where: { id },
          data: {
            status: "IN_PROGRESS",
            paidAt: null,
            rejectionReason: null,
            reviewedAt: new Date(),
            reviewedById: user.id,
          },
        });
      });
    } catch (e) {
      console.error("[reimbursements] revert to IN_PROGRESS", errorSummary(e));
      res.status(500).json({ error: "Não foi possível reverter a solicitação." });
      return;
    }

    const reverted = await prisma.reimbursement.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        type: { select: { id: true, name: true } },
        project: {
          select: {
            id: true,
            name: true,
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
        attachments: {
          select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true },
        },
      },
    });
    res.json(reverted);
    return;
  }

  const now = new Date();
  const data: Record<string, unknown> = {
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
  } else if (next === "APPROVED") {
    if (current.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "Só é possível aprovar solicitações em aguardo." });
      return;
    }
    data.paidAt = null;
    data.rejectionReason = null;
  }

  const updated = await prisma.reimbursement.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, email: true } },
      type: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
          client: { select: { id: true, name: true } },
        },
      },
      attachments: { select: { id: true, filename: true, fileType: true, fileSize: true, createdAt: true } },
    },
  }).catch((e) => {
    console.error("[reimbursements] update status", errorSummary(e));
    return null;
  });
  if (!updated) {
    res.status(500).json({
      error:
        next === "APPROVED"
          ? "Não foi possível aprovar. Verifique se o banco permite o status Aprovado (migration pendente) e tente novamente."
          : "Não foi possível atualizar o status da solicitação.",
    });
    return;
  }

  if (next === "APPROVED") {
    try {
      const { createFinanceDocsFromApprovedReimbursement } = await import(
        "../lib/createPayableFromReimbursement.js"
      );
      await createFinanceDocsFromApprovedReimbursement(
        {
          id: updated.id,
          tenantId: user.tenantId,
          userId: updated.userId,
          projectId: updated.projectId,
          amountCents: updated.amountCents,
          description: updated.description,
          paymentTo: updated.paymentTo,
          expenseDate: updated.expenseDate,
          user: updated.user,
          project: updated.project,
        },
        user.id,
      );
    } catch (e) {
      console.error("[reimbursements] create finance docs from reimbursement", errorSummary(e));
    }
  }

  res.json(updated);
});

reimbursementsRouter.get("/admin/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });
  const list = await prisma.reimbursementType.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      isActive: true,
      calcMode: true,
      unit: true,
      attachmentRequired: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });
  res.json(list);
});

reimbursementsRouter.post("/admin/types", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });
  try {
    const body = (req.body ?? {}) as {
      name?: unknown;
      calcMode?: unknown;
      unit?: unknown;
      attachmentRequired?: unknown;
    };
    const name = String(body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nome é obrigatório." });
    const calcModeRaw = String(body?.calcMode ?? "FIXO").trim().toUpperCase();
    const calcMode = calcModeRaw === "POR_UNIDADE" ? "POR_UNIDADE" : "FIXO";
    const unit = String(body?.unit ?? "").trim();
    const attachmentRequired = body?.attachmentRequired === true;
    const created = await prisma.reimbursementType.create({
      data: { tenantId: user.tenantId, name, isActive: true, calcMode, unit: unit || null, attachmentRequired },
      select: {
        id: true,
        name: true,
        isActive: true,
        calcMode: true,
        unit: true,
        attachmentRequired: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const projects = await prisma.project.findMany({
      where: { client: { tenantId: user.tenantId }, arquivado: false },
      select: { id: true },
    });
    if (projects.length > 0) {
      const isUnit = calcMode === "POR_UNIDADE";
      await prisma.reimbursementProjectLimit.createMany({
        data: projects.map((p) => ({
          tenantId: user.tenantId,
          projectId: p.id,
          typeId: created.id,
          maxValueCents: isUnit ? null : 0,
          maxUnitValueCents: isUnit ? 0 : null,
        })),
        skipDuplicates: true,
      });
    }

    res.status(201).json(created);
  } catch (err) {
    console.error("[REEMBOLSOS] admin create type error", errorSummary(err));
    res.status(500).json({ error: "Erro ao criar tipo de reembolso." });
  }
});

reimbursementsRouter.patch("/admin/types/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });
  const id = String(req.params.id || "");
  try {
    const current = await prisma.reimbursementType.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, name: true, isActive: true, calcMode: true, unit: true, attachmentRequired: true },
    });
    if (!current) {
      res.status(404).json({ error: "Tipo de reembolso não encontrado." });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: unknown;
      isActive?: unknown;
      calcMode?: unknown;
      unit?: unknown;
      attachmentRequired?: unknown;
    };
    const name = body.name;
    const isActive = body.isActive;
    const calcMode = body.calcMode;
    const unit = body.unit;
    const attachmentRequired = body.attachmentRequired;

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
    if (typeof attachmentRequired === "boolean") {
      data.attachmentRequired = attachmentRequired;
    }

    // Estado final após o PATCH (campos omitidos no body mantêm o valor atual).
    if (((data.calcMode as string | undefined) ?? String(current.calcMode || "FIXO")) === "FIXO") {
      data.unit = null;
    }

    if (Object.keys(data).length === 0) {
      const unchanged = await prisma.reimbursementType.findFirst({
        where: { id, tenantId: user.tenantId },
        select: {
          id: true,
          name: true,
          isActive: true,
          calcMode: true,
          unit: true,
          attachmentRequired: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      res.json(unchanged);
      return;
    }

    const updated = await prisma.reimbursementType.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        isActive: true,
        calcMode: true,
        unit: true,
        attachmentRequired: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(updated);
  } catch (err: any) {
    const code = String(err?.code || "");
    const msg = String(err?.message || "");
    console.error("[REEMBOLSOS] admin update type error", errorSummary(err));
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
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });
  const projects = await prisma.project.findMany({
    where: { client: { tenantId: user.tenantId }, arquivado: false },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(projects);
});

reimbursementsRouter.get("/admin/limits", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });
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
  // Somente Super Admin e Gestor de projetos veem solicitações de todos; Consultor / Admin portal só as próprias.
  const canSeeAll =
    role === "GESTOR_PROJETOS" ||
    role === "FINANCEIRO" ||
    (await hasGlobalViewAccess({
      tenantId: user.tenantId,
      role: user.role,
      featureId: "relatorios.reembolsosVerTodos",
    }));

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

  const projectId = String(req.query.projectId ?? "").trim();
  if (projectId) where.projectId = projectId;

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
  if (!(await canReimbursementsConfigAdmin(user))) return res.status(403).json({ error: "Sem permissão." });

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
        const unlimited = it.maxValueCents === null && it.maxUnitValueCents === null;
        if (unlimited) {
          await tx.reimbursementProjectLimit.upsert({
            where: {
              tenantId_projectId_typeId: { tenantId: user.tenantId, projectId: it.projectId, typeId: it.typeId },
            },
            create: {
              tenantId: user.tenantId,
              projectId: it.projectId,
              typeId: it.typeId,
              maxValueCents: null,
              maxUnitValueCents: null,
            },
            update: { maxValueCents: null, maxUnitValueCents: null },
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
    console.error("[REEMBOLSOS] admin save limits error", errorSummary(err));
    const code = String((err as any)?.code || "");
    const msg = String((err as any)?.message || "").slice(0, 500);
    res.status(500).json({
      error: "Erro ao salvar limites de reembolso.",
      details: code || msg ? { code: code || undefined, message: msg || undefined } : undefined,
    });
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
  const canDelete = attachment.reimbursement.userId === user.id || (await canReimbursementsConfigAdmin(user));
  if (!canDelete) return res.status(403).json({ error: "Sem permissão" });

  const filePath = resolveUploadsPublicPath(attachment.fileUrl);
  if (filePath && existsSync(filePath)) await unlink(filePath).catch(() => null);
  await prisma.reimbursementAttachment.delete({ where: { id } });
  res.status(204).end();
});

