import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { errorSummary } from "../lib/devLog.js";

export const projectGroupsRouter = Router();
projectGroupsRouter.use(authMiddleware);
projectGroupsRouter.use(requireFeature("projeto"));

function normalizeGroupName(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function canManageGroups(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "GESTOR_PROJETOS";
}

// GET /api/project-groups
projectGroupsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const list = await prisma.projectGroup.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  res.json(list);
});

// POST /api/project-groups
projectGroupsRouter.post("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  if (!canManageGroups(user.role)) {
    res.status(403).json({ error: "Sem permissão para criar grupos de projetos." });
    return;
  }
  const name = normalizeGroupName((req.body as any)?.name);
  if (!name) {
    res.status(400).json({ error: "Nome do grupo é obrigatório." });
    return;
  }

  try {
    const created = await prisma.projectGroup.create({
      data: { tenantId: user.tenantId, name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json(created);
  } catch (e: any) {
    // Unique violation
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      const existing = await prisma.projectGroup.findFirst({
        where: { tenantId: user.tenantId, name },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      if (existing) {
        res.status(200).json(existing);
        return;
      }
    }
    console.error("[project-groups][POST]", errorSummary(e));
    res.status(500).json({ error: "Não foi possível criar o grupo." });
  }
});

