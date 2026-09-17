import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { normalizeConfigName } from "../lib/financeConfigHelpers.js";
import {
  ensureTenantUserProfiles,
  findTenantUserProfile,
  isValidLayoutShell,
  listTenantUserProfiles,
  slugifyUserProfileCode,
  SYSTEM_USER_PROFILES,
} from "../lib/tenantUserProfiles.js";

export const userProfilesRouter = Router();
userProfilesRouter.use(authMiddleware);

const FEATURE = "configuracoes.perfisUsuario" as const;

userProfilesRouter.get(
  "/",
  requireAnyFeature([
    FEATURE,
    "configuracoes.usuarios",
    "configuracoes.gestaoPerfis",
  ]),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const activeOnly =
      String(req.query.activeOnly ?? "").trim() === "1" ||
      String(req.query.activeOnly ?? "").toLowerCase() === "true";
    const assignableOnly =
      String(req.query.assignableOnly ?? "").trim() === "1" ||
      String(req.query.assignableOnly ?? "").toLowerCase() === "true";
    const configurableOnly =
      String(req.query.configurableOnly ?? "").trim() === "1" ||
      String(req.query.configurableOnly ?? "").toLowerCase() === "true";
    const rows = await listTenantUserProfiles(user.tenantId, {
      activeOnly,
      assignableOnly,
      configurableOnly,
    });
    res.json(rows);
  },
);

userProfilesRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureTenantUserProfiles(user.tenantId);

  const name = normalizeConfigName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Nome do perfil é obrigatório." });
    return;
  }

  const layoutShell = isValidLayoutShell(req.body?.layoutShell)
    ? req.body.layoutShell
    : "consultor";
  const requiresClientLink = layoutShell === "cliente" || Boolean(req.body?.requiresClientLink);
  const requiresTimeEntry =
    req.body?.requiresTimeEntry === undefined
      ? layoutShell !== "cliente"
      : Boolean(req.body.requiresTimeEntry);
  const excludeFromHourBank =
    req.body?.excludeFromHourBank === undefined
      ? layoutShell === "cliente"
      : Boolean(req.body.excludeFromHourBank);

  let code = slugifyUserProfileCode(String(req.body?.code ?? name));
  if (SYSTEM_USER_PROFILES.some((p) => p.code === code) || code === "PLATFORM_ADMIN") {
    code = `${code}_CUSTOM`;
  }
  // Super administrador é único por empresa (provisionado); nunca criar como perfil novo.
  if (code === "SUPER_ADMIN") {
    res.status(400).json({
      error: "O perfil Super administrador é único por empresa e não pode ser criado.",
    });
    return;
  }

  const existingCode = await prisma.tenantUserProfile.findFirst({
    where: { tenantId: user.tenantId, code },
    select: { id: true },
  });
  if (existingCode) {
    code = `${code}_${Date.now().toString(36).toUpperCase()}`.slice(0, 48);
  }

  const dupName = await prisma.tenantUserProfile.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dupName) {
    res.status(409).json({ error: "Já existe um perfil com esse nome." });
    return;
  }

  const maxSort = await prisma.tenantUserProfile.aggregate({
    where: { tenantId: user.tenantId },
    _max: { sortOrder: true },
  });

  const created = await prisma.tenantUserProfile.create({
    data: {
      tenantId: user.tenantId,
      code,
      name,
      isActive: req.body?.isActive === false ? false : true,
      isSystem: false,
      layoutShell,
      requiresClientLink,
      requiresTimeEntry: requiresClientLink ? false : requiresTimeEntry,
      excludeFromHourBank: requiresClientLink ? true : excludeFromHourBank,
      sortOrder: (maxSort._max.sortOrder ?? 100) + 10,
    },
  });

  res.status(201).json({
    id: created.id,
    code: created.code,
    name: created.name,
    isActive: created.isActive,
    isSystem: created.isSystem,
    layoutShell: created.layoutShell,
    requiresClientLink: created.requiresClientLink,
    requiresTimeEntry: created.requiresTimeEntry,
    excludeFromHourBank: created.excludeFromHourBank,
    sortOrder: created.sortOrder,
    assignable: true,
    configurable: true,
  });
});

userProfilesRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.tenantUserProfile.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Perfil não encontrado." });
    return;
  }

  const data: {
    name?: string;
    isActive?: boolean;
    layoutShell?: string;
    requiresClientLink?: boolean;
    requiresTimeEntry?: boolean;
    excludeFromHourBank?: boolean;
  } = {};

  if (req.body?.name != null) {
    const name = normalizeConfigName(req.body.name);
    if (!name) {
      res.status(400).json({ error: "Nome do perfil é obrigatório." });
      return;
    }
    const dup = await prisma.tenantUserProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      res.status(409).json({ error: "Já existe um perfil com esse nome." });
      return;
    }
    data.name = name;
  }

  if (typeof req.body?.isActive === "boolean") {
    if (existing.isSystem && existing.code === "SUPER_ADMIN" && req.body.isActive === false) {
      res.status(400).json({ error: "O perfil Super administrador não pode ser inativado." });
      return;
    }
    data.isActive = req.body.isActive;
  }

  if (!existing.isSystem) {
    if (req.body?.layoutShell != null) {
      if (!isValidLayoutShell(req.body.layoutShell)) {
        res.status(400).json({ error: "Layout inválido." });
        return;
      }
      data.layoutShell = req.body.layoutShell;
    }
    if (typeof req.body?.requiresClientLink === "boolean") {
      data.requiresClientLink = req.body.requiresClientLink;
    }
    if (typeof req.body?.requiresTimeEntry === "boolean") {
      data.requiresTimeEntry = req.body.requiresTimeEntry;
    }
    if (typeof req.body?.excludeFromHourBank === "boolean") {
      data.excludeFromHourBank = req.body.excludeFromHourBank;
    }
  }

  if (data.layoutShell === "cliente" || data.requiresClientLink) {
    data.requiresClientLink = true;
    data.requiresTimeEntry = false;
    data.excludeFromHourBank = true;
  }

  const updated = await prisma.tenantUserProfile.update({
    where: { id },
    data,
  });

  const meta = SYSTEM_USER_PROFILES.find((p) => p.code === updated.code);
  res.json({
    id: updated.id,
    code: updated.code,
    name: updated.name,
    isActive: updated.isActive,
    isSystem: updated.isSystem,
    layoutShell: updated.layoutShell,
    requiresClientLink: updated.requiresClientLink,
    requiresTimeEntry: updated.requiresTimeEntry,
    excludeFromHourBank: updated.excludeFromHourBank,
    sortOrder: updated.sortOrder,
    assignable: meta ? meta.assignable : true,
    configurable: meta ? meta.configurable : true,
  });
});

userProfilesRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await prisma.tenantUserProfile.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    res.status(404).json({ error: "Perfil não encontrado." });
    return;
  }
  if (existing.isSystem) {
    res.status(400).json({ error: "Perfis do sistema não podem ser excluídos. Inative se necessário." });
    return;
  }

  const inUse = await prisma.user.count({
    where: { tenantId: user.tenantId, role: existing.code },
  });
  if (inUse > 0) {
    res.status(409).json({
      error: `Não é possível excluir: ${inUse} usuário(s) ainda usam este perfil.`,
    });
    return;
  }

  await prisma.tenantFeaturePermission.deleteMany({
    where: { tenantId: user.tenantId, role: existing.code },
  });
  await prisma.tenantUserProfile.delete({ where: { id } });
  res.status(204).send();
});

/** Utilitário interno para validação (não exposto). */
export async function assertProfileCode(tenantId: string, code: string) {
  return findTenantUserProfile(tenantId, code);
}
