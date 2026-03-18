import { Router, Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import {
  FEATURES,
  buildDefaultPermissions,
  getTenantPermissionsMatrix,
  type FeatureId,
  type PermissionState,
  type RoleId,
} from "../lib/permissions.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const accessControlRouter = Router();
accessControlRouter.use(authMiddleware);
accessControlRouter.use(requireFeature("configuracoes.gestaoPerfis"));

accessControlRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: RoleId } }).user;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Apenas administradores podem gerenciar permissões." });
    return;
  }
  const matrix = await getTenantPermissionsMatrix(user.tenantId);
  res.json(matrix);
});

type PutBody = Record<string, Record<string, PermissionState>>;

accessControlRouter.put("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: RoleId } }).user;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Apenas administradores podem gerenciar permissões." });
    return;
  }
  const body = (req.body ?? {}) as PutBody;
  const base = buildDefaultPermissions();

  const updates: Array<{ featureId: FeatureId; role: RoleId; state: PermissionState }> = [];
  for (const featureIdRaw of Object.keys(body)) {
    const featureId = featureIdRaw as FeatureId;
    if (!FEATURES.includes(featureId)) continue;
    const rolesObj = body[featureIdRaw] ?? {};
    for (const roleRaw of Object.keys(rolesObj)) {
      const role = roleRaw as RoleId;
      if (!["ADMIN", "GESTOR_PROJETOS", "CONSULTOR", "CLIENTE"].includes(role)) continue;
      const state = rolesObj[roleRaw] === "deny" ? "deny" : "allow";
      updates.push({ featureId, role, state });
    }
  }

  // Salvar apenas diferenças em relação ao default (reduz ruído e facilita evoluções)
  const toUpsert = updates.filter((u) => base[u.featureId][u.role] !== u.state);

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
  res.json({ ok: true, permissions: matrix });
});

