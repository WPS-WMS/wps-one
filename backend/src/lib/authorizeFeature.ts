import { Request, Response, NextFunction } from "express";
import { isFeatureAllowed, type FeatureId, type RoleId } from "./permissions.js";

export function requireFeature(featureId: FeatureId) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: { tenantId: string; role: RoleId } }).user;
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const allowed = await isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureId,
    });
    if (!allowed) {
      res.status(403).json({ error: "Sem permissão para acessar esta funcionalidade." });
      return;
    }
    next();
  };
}

/** Permite a rota se o usuário tiver pelo menos uma das features (SUPER_ADMIN continua coberto em isFeatureAllowed). */
export function requireAnyFeature(featureIds: FeatureId[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: { tenantId: string; role: RoleId } }).user;
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    for (const featureId of featureIds) {
      const allowed = await isFeatureAllowed({
        tenantId: user.tenantId,
        role: user.role,
        featureId,
      });
      if (allowed) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Sem permissão para acessar esta funcionalidade." });
  };
}

