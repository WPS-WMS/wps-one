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

