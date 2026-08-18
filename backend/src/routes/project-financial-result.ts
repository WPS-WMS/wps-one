import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature } from "../lib/authorizeFeature.js";
import { getProjectVisibilityWhere, userCanAccessProject } from "../lib/projectVisibility.js";
import {
  computeProjectFinancialDashboard,
  type DashboardView,
} from "../lib/projectFinancialDashboardHelpers.js";
import {
  computeProjectFinancialResult,
  listProjectsFinancialOverview,
} from "../lib/projectFinancialResultHelpers.js";

export const projectFinancialResultRouter = Router();
projectFinancialResultRouter.use(authMiddleware);

const FEATURES = ["financeiro.projetos.receitas"] as const;
const LIST_FEATURES = ["financeiro.projetos.receitas"] as const;

type AuthUser = { id: string; tenantId: string; role: string };

projectFinancialResultRouter.get("/projects", requireAnyFeature([...LIST_FEATURES]), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const visibility = await getProjectVisibilityWhere(user);
  const projects = await listProjectsFinancialOverview(user.tenantId, visibility);
  res.json({ projects });
});

function parseDashboardView(raw: unknown): DashboardView {
  const value = String(raw ?? "completo").trim().toLowerCase();
  return value === "mensal" ? "mensal" : "completo";
}

function parseYearMonth(rawYear: unknown, rawMonth: unknown): { year: number; month: number } {
  const now = new Date();
  const year = Number.parseInt(String(rawYear ?? now.getUTCFullYear()), 10);
  const month = Number.parseInt(String(rawMonth ?? now.getUTCMonth() + 1), 10);
  return {
    year: Number.isFinite(year) ? year : now.getUTCFullYear(),
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1,
  };
}

projectFinancialResultRouter.get("/dashboard", requireAnyFeature([...FEATURES]), async (req, res) => {
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

  const view = parseDashboardView(req.query.view);
  const { year, month } = parseYearMonth(req.query.year, req.query.month);
  const result = await computeProjectFinancialDashboard(user.tenantId, projectId, view, year, month);
  if (!result) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  res.json(result);
});

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
