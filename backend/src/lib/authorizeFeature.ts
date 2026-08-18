import { Request, Response, NextFunction } from "express";
import { isFinanceiroFeatureId, isFinanceiroModuleEnabled } from "./financeiroModuleGate.js";
import { isAnyFeatureAllowed, isFeatureAllowed, type FeatureId, type RoleId } from "./permissions.js";

function rejectFinanceiroModuleDisabled(res: Response): void {
  res.status(404).json({ error: "Módulo financeiro indisponível neste ambiente." });
}

export function requireFeature(featureId: FeatureId) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isFinanceiroFeatureId(featureId) && !isFinanceiroModuleEnabled()) {
      rejectFinanceiroModuleDisabled(res);
      return;
    }
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
    const financeiroIds = featureIds.filter((id) => isFinanceiroFeatureId(id));
    if (financeiroIds.length === featureIds.length && !isFinanceiroModuleEnabled()) {
      rejectFinanceiroModuleDisabled(res);
      return;
    }
    const user = (req as Request & { user?: { tenantId: string; role: RoleId } }).user;
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const allowed = await isAnyFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role,
      featureIds,
    });
    if (!allowed) {
      res.status(403).json({ error: "Sem permissão para acessar esta funcionalidade." });
      return;
    }
    next();
  };
}

