import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import {
  EMAIL_PROJECT_TYPES,
  EMAIL_TRIGGERS,
  clearTenantEmailRulesCache,
  normalizeProjectTypeForEmail,
  parseRecipientRoles,
  serializeRecipientRoles,
  type EmailProjectType,
  type EmailRecipientRole,
} from "../lib/emailNotificationRules.js";
import { getMailDeliveryStatus, sendMail } from "../lib/mailer.js";

export const emailNotificationRulesRouter = Router();
emailNotificationRulesRouter.use(authMiddleware);

/**
 * GET /api/email-notification-rules/admin
 * Lista todas as combinações (tipo × gatilho) com recipientRoles.
 */
emailNotificationRulesRouter.get("/admin/status", requireFeature("configuracoes.emails"), async (_req, res) => {
  res.json(getMailDeliveryStatus());
});

emailNotificationRulesRouter.post("/admin/test", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { email?: string | null; name?: string | null } }).user;
  const to = String(user.email ?? "").trim().toLowerCase();
  if (!to.includes("@")) {
    res.status(400).json({ error: "Seu usuário não tem e-mail válido para o teste." });
    return;
  }
  const status = getMailDeliveryStatus();
  if (!status.ready) {
    res.status(503).json({
      error: "Provedor de e-mail indisponível neste servidor.",
      status,
    });
    return;
  }
  try {
    const result = await sendMail({
      to,
      subject: "WPSone — teste de envio de e-mail",
      html: `<p>Olá${user.name ? ` ${user.name}` : ""},</p><p>Este é um e-mail de teste das <b>Configurações → E-mails</b>.</p><p>Se você recebeu, o envio está funcionando neste ambiente.</p>`,
    });
    if (result && "skipped" in result && result.skipped) {
      res.status(503).json({
        error: "Envio ignorado: provedor de e-mail indisponível.",
        status: getMailDeliveryStatus(),
      });
      return;
    }
    res.json({ ok: true, to, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enviar e-mail de teste.";
    res.status(500).json({ error: message, status });
  }
});

emailNotificationRulesRouter.get("/admin", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;

  const rows = await prisma.tenantEmailNotificationRule.findMany({
    where: { tenantId: user.tenantId },
    select: { projectType: true, trigger: true, isActive: true, recipientRoles: true },
  });
  const map = new Map<string, { isActive: boolean; recipientRoles: string }>();
  for (const r of rows) {
    map.set(`${r.projectType}::${r.trigger}`, { isActive: r.isActive, recipientRoles: r.recipientRoles });
  }

  const rules: Array<{ projectType: EmailProjectType; trigger: string; recipientRoles: EmailRecipientRole[] }> = [];
  for (const pt of EMAIL_PROJECT_TYPES) {
    for (const tr of EMAIL_TRIGGERS) {
      const k = `${pt}::${tr}`;
      const row = map.get(k);
      rules.push({
        projectType: pt,
        trigger: tr,
        recipientRoles: row ? parseRecipientRoles(row.recipientRoles) : [],
      });
    }
  }
  res.json(rules);
});

/**
 * PUT /api/email-notification-rules/admin
 * Substitui todas as regras do tenant (matriz completa tipo × gatilho).
 */
emailNotificationRulesRouter.put("/admin", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;

  const body = req.body as {
    rules?: Array<{ projectType?: string; trigger?: string; recipientRoles?: unknown; isActive?: boolean }>;
  };
  if (!Array.isArray(body.rules)) {
    res.status(400).json({ error: "rules é obrigatório (array)." });
    return;
  }

  const normalized: Array<{
    projectType: EmailProjectType;
    trigger: string;
    recipientRoles: EmailRecipientRole[];
    isActive: boolean;
  }> = [];
  for (const r of body.rules) {
    const pt = normalizeProjectTypeForEmail(r.projectType);
    const tr = String(r.trigger ?? "").trim();
    if (!EMAIL_TRIGGERS.includes(tr as (typeof EMAIL_TRIGGERS)[number])) {
      res.status(400).json({ error: `Gatilho inválido: ${tr}` });
      return;
    }
    const roles = r.recipientRoles !== undefined ? parseRecipientRoles(r.recipientRoles) : [];
    normalized.push({
      projectType: pt,
      trigger: tr,
      recipientRoles: roles,
      isActive: roles.length > 0,
    });
  }

  const expected = EMAIL_PROJECT_TYPES.length * EMAIL_TRIGGERS.length;
  if (normalized.length !== expected) {
    res.status(400).json({ error: `Envie exatamente ${expected} regras (matriz completa).` });
    return;
  }

  const keySet = new Set<string>();
  for (const r of normalized) {
    const k = `${r.projectType}::${r.trigger}`;
    if (keySet.has(k)) {
      res.status(400).json({ error: "Regras duplicadas na matriz." });
      return;
    }
    keySet.add(k);
  }

  await prisma.$transaction([
    prisma.tenantEmailNotificationRule.deleteMany({ where: { tenantId: user.tenantId } }),
    prisma.tenantEmailNotificationRule.createMany({
      data: normalized.map((r) => ({
        tenantId: user.tenantId,
        projectType: r.projectType,
        trigger: r.trigger,
        isActive: r.isActive,
        recipientRoles: serializeRecipientRoles(r.recipientRoles),
      })),
    }),
  ]);

  clearTenantEmailRulesCache(user.tenantId);

  res.json({ ok: true });
});
