import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { errorSummary } from "../lib/devLog.js";
 
export const clientReportsRouter = Router();
clientReportsRouter.use(authMiddleware);
 
function parseRange(params: { start?: unknown; end?: unknown }) {
  const now = new Date();
  const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fallbackEnd = new Date();

  const rawStart = typeof params.start === "string" ? params.start : undefined;
  const rawEnd = typeof params.end === "string" ? params.end : undefined;

  const startIso = rawStart
    ? rawStart.length === 10
      ? `${rawStart}T00:00:00.000Z`
      : rawStart
    : null;
  const endIso = rawEnd
    ? rawEnd.length === 10
      ? `${rawEnd}T23:59:59.999Z`
      : rawEnd
    : null;

  const startDate = startIso ? new Date(startIso) : fallbackStart;
  const endDate = endIso ? new Date(endIso) : fallbackEnd;

  return { startDate, endDate };
}

// GET /api/client-reports/projects
clientReportsRouter.get("/projects", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    if (user.role !== "CLIENTE") {
      res.status(403).json({ error: "Não autorizado" });
      return;
    }

    const clientIds = (
      await prisma.clientUser.findMany({
        where: { userId: user.id },
        select: { clientId: true },
      })
    ).map((x) => x.clientId);

    if (clientIds.length === 0) {
      res.json([]);
      return;
    }

    const projects = await prisma.project.findMany({
      where: { clientId: { in: clientIds }, arquivado: false, client: { tenantId: user.tenantId } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.json(projects);
  } catch (err) {
    console.error("GET /api/client-reports/projects error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar projetos" });
  }
});

// GET /api/client-reports/gestao-horas?start=&end=&projectId=
clientReportsRouter.get("/gestao-horas", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    if (user.role !== "CLIENTE") {
      res.status(403).json({ error: "Não autorizado" });
      return;
    }
 
    const { projectId } = req.query;
    const { startDate, endDate } = parseRange({ start: req.query.start, end: req.query.end });
 
    const clientIds = (
      await prisma.clientUser.findMany({
        where: { userId: user.id },
        select: { clientId: true },
      })
    ).map((x) => x.clientId);
 
    if (clientIds.length === 0) {
      res.json([]);
      return;
    }
 
    const allowedProjects = await prisma.project.findMany({
      where: { clientId: { in: clientIds }, arquivado: false },
      select: { id: true },
    });
    const allowedProjectIds = allowedProjects.map((p) => p.id);
    if (allowedProjectIds.length === 0) {
      res.json([]);
      return;
    }
 
    const where: Record<string, unknown> = {
      project: { client: { tenantId: user.tenantId } },
      projectId: { in: allowedProjectIds },
      date: { gte: startDate, lte: endDate },
    };
    if (projectId) {
      const pid = String(projectId);
      if (!allowedProjectIds.includes(pid)) {
        res.json([]);
        return;
      }
      where.projectId = pid;
    }
 
    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        project: { include: { client: true } },
        ticket: true,
        activity: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ date: "desc" }, { horaInicio: "asc" }],
    });
 
    res.json(entries);
  } catch (err) {
    console.error("GET /api/client-reports/gestao-horas error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao gerar relatório de horas" });
  }
});

