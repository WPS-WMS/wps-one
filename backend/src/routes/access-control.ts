import { Router, Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import {
  FEATURES,
  buildDefaultPermissions,
  getTenantPermissionsMatrix,
  type FeatureId,
  type PermissionState,
} from "../lib/permissions.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import {
  isConfigurableTenantRole,
  listTenantUserProfiles,
} from "../lib/tenantUserProfiles.js";

export const accessControlRouter = Router();
accessControlRouter.use(authMiddleware);
accessControlRouter.use(requireFeature("configuracoes.gestaoPerfis"));

accessControlRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const matrix = await getTenantPermissionsMatrix(user.tenantId);
  const profiles = await listTenantUserProfiles(user.tenantId, {
    activeOnly: true,
    configurableOnly: true,
  });
  res.json({ permissions: matrix, roles: profiles });
});

type PutBody = Record<string, Record<string, PermissionState>>;

accessControlRouter.put("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const body = (req.body ?? {}) as PutBody;
  const base = buildDefaultPermissions();
  const configurableCodes = new Set(
    (await listTenantUserProfiles(user.tenantId, { configurableOnly: true })).map((p) => p.code),
  );

  const updates: Array<{ featureId: FeatureId; role: string; state: PermissionState }> = [];
  for (const featureIdRaw of Object.keys(body)) {
    const featureId = featureIdRaw as FeatureId;
    if (!FEATURES.includes(featureId)) continue;
    const rolesObj = body[featureIdRaw] ?? {};
    for (const roleRaw of Object.keys(rolesObj)) {
      if (!(await isConfigurableTenantRole(user.tenantId, roleRaw))) continue;
      if (!configurableCodes.has(roleRaw)) continue;
      const state = rolesObj[roleRaw] === "deny" ? "deny" : "allow";
      updates.push({ featureId, role: roleRaw, state });
    }
  }

  // Salvar apenas diferenças em relação ao default (reduz ruído e facilita evoluções)
  const toUpsert = updates.filter((u) => {
    const def = base[u.featureId]?.[u.role];
    if (def === undefined) return u.state === "allow";
    return def !== u.state;
  });

  await prisma.$transaction(async (tx) => {
    await tx.tenantFeaturePermission.deleteMany({ where: { tenantId: user.tenantId } });
    if (toUpsert.length > 0) {
      await tx.tenantFeaturePermission.createMany({
        data: toUpsert.map((u) => ({
          tenantId: user.tenantId,
          featureId: u.featureId,
          role: u.role,
          state: u.state,
        })),
      });
    }
  });

  const matrix = await getTenantPermissionsMatrix(user.tenantId);
  const profiles = await listTenantUserProfiles(user.tenantId, {
    activeOnly: true,
    configurableOnly: true,
  });
  res.json({ ok: true, permissions: matrix, roles: profiles });
});
