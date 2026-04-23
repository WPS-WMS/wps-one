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
 * Retorna apenas atividades ativas vinculadas ao projeto informado.
 * Observação: atividades NÃO vinculadas a projeto não devem aparecer ao abrir chamado.
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
      projects: { some: { projectId } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return res.json(activities);
});

/** Admin (SUPER_ADMIN) - gerenciar atividades */
activitiesRouter.get("/admin", requireFeature("configuracoes.atividades"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
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

activitiesRouter.patch("/admin/:id", requireFeature("configuracoes.atividades"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
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

activitiesRouter.post("/admin", requireFeature("configuracoes.atividades"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const body = (req.body ?? {}) as { name?: string; isActive?: boolean; projectIds?: string[] };
  const name = String(body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Nome da atividade é obrigatório" });

  const exists = await prisma.activity.findFirst({
    where: { tenantId: user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) return res.status(409).json({ error: "Já existe uma atividade com esse nome." });

  const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map((x) => String(x)).filter(Boolean) : [];
  const created = await prisma.activity.create({
    data: {
      name,
      tenantId: user.tenantId,
      isActive: body.isActive === false ? false : true,
      projects: projectIds.length
        ? { createMany: { data: projectIds.map((projectId) => ({ projectId })), skipDuplicates: true } }
        : undefined,
    },
    select: { id: true, name: true, isActive: true, projects: { select: { projectId: true } } },
  });
  return res.json({
    id: created.id,
    name: created.name,
    isActive: created.isActive,
    projectIds: created.projects.map((p) => p.projectId),
  });
});

activitiesRouter.delete("/admin/:id", requireFeature("configuracoes.atividades"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);

  const activity = await prisma.activity.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, name: true },
  });
  if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

  const usedCount = await prisma.timeEntry.count({ where: { activityId: id } });
  if (usedCount > 0) {
    return res.status(409).json({
      error:
        "Esta atividade não pode ser excluída porque já foi utilizada em apontamentos. Inative-a para que não apareça nas listas.",
    });
  }

  await prisma.activity.delete({ where: { id } });
  return res.json({ ok: true });
});
