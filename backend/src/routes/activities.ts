import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const activitiesRouter = Router();
activitiesRouter.use(authMiddleware);

activitiesRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const activities = await prisma.activity.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
  });
  res.json(activities);
});

/**
 * GET /api/activities/for-ticket-type?projectId=
 * Retorna apenas atividades ativas, respeitando vínculo opcional ao projeto:
 * - se uma atividade não tiver vínculo com projeto, vale para todos
 * - se tiver vínculo(s), vale apenas para os projetos vinculados
 */
activitiesRouter.get("/for-ticket-type", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const projectId = String(req.query.projectId ?? "").trim();
  if (!projectId) {
    return res.json([]);
  }
  const activities = await prisma.activity.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      OR: [
        { projects: { none: {} } },
        { projects: { some: { projectId } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return res.json(activities);
});

/** Admin (SUPER_ADMIN) - gerenciar atividades */
activitiesRouter.get("/admin", requireFeature("configuracoes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (String(user.role).toUpperCase() !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Sem permissão para acessar esta funcionalidade." });
  }
  const activities = await prisma.activity.findMany({
    where: { tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      isActive: true,
      projects: { select: { projectId: true } },
    },
    orderBy: { name: "asc" },
  });
  return res.json(
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      projectIds: a.projects.map((p) => p.projectId),
    })),
  );
});

activitiesRouter.patch("/admin/:id", requireFeature("configuracoes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; role: string } }).user;
  if (String(user.role).toUpperCase() !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Sem permissão para acessar esta funcionalidade." });
  }
  const id = String(req.params.id);
  const { isActive, projectIds } = (req.body ?? {}) as {
    isActive?: boolean;
    projectIds?: string[];
  };

  const activity = await prisma.activity.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

  const nextProjectIds = Array.isArray(projectIds)
    ? projectIds.map((x) => String(x)).filter(Boolean)
    : null;

  await prisma.$transaction(async (tx) => {
    if (typeof isActive === "boolean") {
      await tx.activity.update({
        where: { id },
        data: { isActive },
      });
    }
    if (nextProjectIds) {
      await tx.activityProject.deleteMany({ where: { activityId: id } });
      if (nextProjectIds.length > 0) {
        await tx.activityProject.createMany({
          data: nextProjectIds.map((projectId) => ({
            activityId: id,
            projectId,
          })),
          skipDuplicates: true,
        });
      }
    }
  });

  return res.json({ ok: true });
});
