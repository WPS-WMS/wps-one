import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";

export const permissionRequestsRouter = Router();
permissionRequestsRouter.use(authMiddleware);

// Listar pedidos de permissão (ADMIN: todos; usuário: apenas os seus)
permissionRequestsRouter.get("/", async (req, res) => {
  const user = req.user;
  const statusFilter = req.query.status as string | undefined;
  const scope = req.query.scope as string | undefined;

  const where: { userId?: string; status?: string } = {};

  // Escopo "own": sempre retorna apenas solicitações do próprio usuário
  if (scope === "own") {
    where.userId = user.id;
  } else {
    // Admin e Gestor de Projetos veem todas; demais veem apenas as próprias
    if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
      where.userId = user.id;
    }
  }

  if (statusFilter && ["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const list = await prisma.timeEntryPermissionRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      ticket: { select: { id: true, code: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(list);
});

// Criar pedido de permissão (qualquer usuário autenticado)
permissionRequestsRouter.post("/", async (req, res) => {
  const user = req.user;
  const {
    justification,
    date,
    horaInicio,
    horaFim,
    intervaloInicio,
    intervaloFim,
    totalHoras,
    description,
    projectId,
    ticketId,
    activityId,
  } = req.body;

  if (!justification || typeof justification !== "string" || justification.trim().length === 0) {
    res.status(400).json({ error: "Justificativa é obrigatória" });
    return;
  }
  if (!date || !horaInicio || !horaFim || totalHoras == null || !projectId) {
    res.status(400).json({ error: "Data, horário, total de horas e projeto são obrigatórios" });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: String(projectId) },
    select: { id: true },
  });
  if (!project) {
    res.status(400).json({ error: "Projeto não encontrado" });
    return;
  }

  const totalHorasNum = typeof totalHoras === "number" ? totalHoras : parseFloat(totalHoras);
  if (isNaN(totalHorasNum) || totalHorasNum <= 0) {
    res.status(400).json({ error: "Total de horas inválido" });
    return;
  }

  const created = await prisma.timeEntryPermissionRequest.create({
    data: {
      userId: user.id,
      status: "PENDING",
      justification: String(justification).trim(),
      date: new Date(date),
      horaInicio: String(horaInicio),
      horaFim: String(horaFim),
      intervaloInicio: intervaloInicio ? String(intervaloInicio) : null,
      intervaloFim: intervaloFim ? String(intervaloFim) : null,
      totalHoras: totalHorasNum,
      description: description ? String(description).trim() : null,
      projectId: String(projectId),
      ticketId: ticketId ? String(ticketId) : null,
      activityId: activityId ? String(activityId) : null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      ticket: { select: { id: true, code: true, title: true } },
    },
  });
  res.status(201).json(created);
});

// Aprovar ou rejeitar (ADMIN ou GESTOR_PROJETOS)
permissionRequestsRouter.patch("/:id", async (req, res) => {
  const authUser = req.user;
  if (authUser.role !== "ADMIN" && authUser.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Não autorizado" });
    return;
  }

  const id = req.params.id;
  const { status, rejectionReason } = req.body as {
    status?: string;
    rejectionReason?: string;
  };
  if (!status || !["APPROVED", "REJECTED"].includes(status)) {
    res.status(400).json({ error: "Status deve ser APPROVED ou REJECTED" });
    return;
  }

  const request = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    include: { user: true, project: true },
  });
  if (!request) {
    res.status(404).json({ error: "Solicitação não encontrada" });
    return;
  }
  if (request.status !== "PENDING") {
    res.status(400).json({ error: "Esta solicitação já foi processada" });
    return;
  }

  const now = new Date();

  if (status === "APPROVED") {
    await prisma.$transaction([
      prisma.timeEntry.create({
        data: {
          userId: request.userId,
          date: request.date,
          horaInicio: request.horaInicio,
          horaFim: request.horaFim,
          intervaloInicio: request.intervaloInicio,
          intervaloFim: request.intervaloFim,
          totalHoras: request.totalHoras,
          description: request.description,
          projectId: request.projectId,
          ticketId: request.ticketId,
          activityId: request.activityId,
        },
      }),
      prisma.timeEntryPermissionRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: now,
          reviewedById: authUser.id,
          rejectionReason: null,
        },
      }),
    ]);
  } else {
    const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "Motivo da reprovação é obrigatório" });
      return;
    }

    await prisma.timeEntryPermissionRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: now,
        reviewedById: authUser.id,
        rejectionReason: reason,
      },
    });
  }

  const updated = await prisma.timeEntryPermissionRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      ticket: { select: { id: true, code: true, title: true } },
    },
  });
  res.json(updated);
});
