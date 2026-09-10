import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { errorSummary } from "../lib/devLog.js";

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware);

type AuthUser = { id: string; tenantId: string; role: string };

function mapNotification(row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  commentId: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; name: string };
  ticket: { id: string; code: string; projectId: string } | null;
}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    ticketId: row.ticketId,
    commentId: row.commentId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    ticket: row.ticket
      ? {
          id: row.ticket.id,
          code: row.ticket.code,
          projectId: row.ticket.projectId,
        }
      : null,
  };
}

// GET /api/notifications?limit=30
notificationsRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const limitRaw = Number(req.query.limit ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 30;

    const rows = await prisma.userNotification.findMany({
      where: { tenantId: user.tenantId, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { id: true, name: true } },
        ticket: { select: { id: true, code: true, projectId: true } },
      },
    });

    res.json(rows.map(mapNotification));
  } catch (error) {
    console.error("Erro ao listar notificações:", errorSummary(error));
    res.status(500).json({ error: "Erro ao listar notificações" });
  }
});

// GET /api/notifications/unread-count
notificationsRouter.get("/unread-count", async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const count = await prisma.userNotification.count({
      where: { tenantId: user.tenantId, userId: user.id, readAt: null },
    });
    res.json({ count });
  } catch (error) {
    console.error("Erro ao contar notificações:", errorSummary(error));
    res.status(500).json({ error: "Erro ao contar notificações" });
  }
});

// POST /api/notifications/mark-all-read
notificationsRouter.post("/mark-all-read", async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const result = await prisma.userNotification.updateMany({
      where: { tenantId: user.tenantId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: result.count });
  } catch (error) {
    console.error("Erro ao marcar notificações:", errorSummary(error));
    res.status(500).json({ error: "Erro ao marcar notificações" });
  }
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const existing = await prisma.userNotification.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.id },
      include: {
        actor: { select: { id: true, name: true } },
        ticket: { select: { id: true, code: true, projectId: true } },
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Notificação não encontrada" });
      return;
    }
    const updated =
      existing.readAt != null
        ? existing
        : await prisma.userNotification.update({
            where: { id },
            data: { readAt: new Date() },
            include: {
              actor: { select: { id: true, name: true } },
              ticket: { select: { id: true, code: true, projectId: true } },
            },
          });
    res.json(mapNotification(updated));
  } catch (error) {
    console.error("Erro ao marcar notificação:", errorSummary(error));
    res.status(500).json({ error: "Erro ao marcar notificação" });
  }
});
