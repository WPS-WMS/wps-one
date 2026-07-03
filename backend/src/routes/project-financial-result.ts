import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature } from "../lib/authorizeFeature.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import { computeProjectFinancialResult } from "../lib/projectFinancialResultHelpers.js";

export const projectFinancialResultRouter = Router();
projectFinancialResultRouter.use(authMiddleware);

const FEATURES = ["financeiro.projetos.resultado", "financeiro.projetos.receitas"] as const;

type AuthUser = { id: string; tenantId: string; role: string };

projectFinancialResultRouter.get("/", requireAnyFeature([...FEATURES]), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.query.projectId ?? "").trim();
  if (!projectId) {
    res.status(400).json({ error: "projectId é obrigatório." });
    return;
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    select: { id: true },
  });
  if (!project || !(await userCanAccessProject(prisma, user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  const result = await computeProjectFinancialResult(user.tenantId, projectId);
  if (!result) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  res.json(result);
});
