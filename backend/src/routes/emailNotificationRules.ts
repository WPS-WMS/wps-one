import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import {
  EMAIL_PROJECT_TYPES,
  EMAIL_TRIGGERS,
  normalizeProjectTypeForEmail,
  type EmailProjectType,
} from "../lib/emailNotificationRules.js";

export const emailNotificationRulesRouter = Router();
emailNotificationRulesRouter.use(authMiddleware);

/**
 * GET /api/email-notification-rules/admin
 * Lista todas as combinações (tipo × gatilho) com isActive (default true se não houver linha).
 */
emailNotificationRulesRouter.get("/admin", requireFeature("configuracoes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (String(user.role).toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Apenas Super Admin." });
    return;
  }

  const rows = await prisma.tenantEmailNotificationRule.findMany({
    where: { tenantId: user.tenantId },
    select: { projectType: true, trigger: true, isActive: true },
  });
  const map = new Map<string, boolean>();
  for (const r of rows) {
    map.set(`${r.projectType}::${r.trigger}`, r.isActive);
  }

  const rules: Array<{ projectType: EmailProjectType; trigger: string; isActive: boolean }> = [];
  for (const pt of EMAIL_PROJECT_TYPES) {
    for (const tr of EMAIL_TRIGGERS) {
      const k = `${pt}::${tr}`;
      rules.push({
        projectType: pt,
        trigger: tr,
        isActive: map.has(k) ? Boolean(map.get(k)) : true,
      });
    }
  }
  res.json(rules);
});

/**
 * PUT /api/email-notification-rules/admin
 * Substitui todas as regras do tenant (matriz completa tipo × gatilho).
 */
emailNotificationRulesRouter.put("/admin", requireFeature("configuracoes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (String(user.role).toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Apenas Super Admin." });
    return;
  }

  const body = req.body as { rules?: Array<{ projectType?: string; trigger?: string; isActive?: boolean }> };
  if (!Array.isArray(body.rules)) {
    res.status(400).json({ error: "rules é obrigatório (array)." });
    return;
  }

  const normalized: Array<{ projectType: EmailProjectType; trigger: string; isActive: boolean }> = [];
  for (const r of body.rules) {
    const pt = normalizeProjectTypeForEmail(r.projectType);
    const tr = String(r.trigger ?? "").trim();
    if (!EMAIL_TRIGGERS.includes(tr as (typeof EMAIL_TRIGGERS)[number])) {
      res.status(400).json({ error: `Gatilho inválido: ${tr}` });
      return;
    }
    normalized.push({ projectType: pt, trigger: tr, isActive: Boolean(r.isActive) });
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
      })),
    }),
  ]);

  res.json({ ok: true });
});
