import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { filterTicketsForConsultant } from "../lib/ticketVisibility.js";

export const ticketsRouter = Router();
ticketsRouter.use(authMiddleware);

ticketsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const { projectId, assignedTo, status, parentTicketId, createdBy } = req.query;
  const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
  const consultantWithProject =
    user.role === "CONSULTOR" && projectId;
  const tickets = await prisma.ticket.findMany({
    where: {
      ...tenantFilter,
      ...(projectId && { projectId: String(projectId) }),
      ...(assignedTo && { assignedToId: String(assignedTo) }),
      ...(status && { status: String(status) }),
      ...(parentTicketId && { parentTicketId: String(parentTicketId) }),
      // Consultor com projectId: busca todos do projeto e filtra em memória (regra tópico/tarefa)
      // Consultor sem projectId: só vê tickets onde é membro direto
      ...(user.role === "CONSULTOR" && !consultantWithProject && {
        OR: [
          { assignedToId: user.id },
          { createdById: user.id },
          { responsibles: { some: { userId: user.id } } },
        ],
      }),
      // Cliente: vê tickets dos projetos do seu cliente; createdBy=me para "chamados que abri"
      ...(user.role === "CLIENTE" && {
        project: { client: { users: { some: { userId: user.id } } } },
        ...(createdBy === "me" && { createdById: user.id }),
      }),
    },
    include: {
      project: { include: { client: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const list = consultantWithProject
    ? filterTicketsForConsultant(tickets, user.id)
    : tickets;
  res.json(list);
});

ticketsRouter.post("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const {
    projectId,
    title,
    description,
    type,
    criticidade,
    responsibleIds,
    status,
    parentTicketId,
    estimativaHoras,
    dataFimPrevista,
    dataInicio,
  } = req.body;
  if (!projectId || !title) {
    res.status(400).json({ error: "Projeto e título são obrigatórios" });
    return;
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
  });
  if (!project) {
    res.status(400).json({ error: "Projeto não encontrado" });
    return;
  }
  const ids = Array.isArray(responsibleIds) ? responsibleIds.filter(Boolean) : [];
  if (ids.length > 0) {
    const usersInTenant = await prisma.user.findMany({
      where: { id: { in: ids }, tenantId: user.tenantId },
      select: { id: true },
    });
    const validIds = new Set(usersInTenant.map((u) => u.id));
    const invalid = ids.filter((id: string) => !validIds.has(id));
    if (invalid.length > 0) {
      res.status(400).json({ error: "Um ou mais responsáveis não são válidos para este tenant." });
      return;
    }
  }
  // Sequência única de código para TODAS as tarefas (incluindo tópicos),
  // crescente por ordem de criação dentro do tenant.
  let nextCode: string;
  const lastTicket = await prisma.ticket.findFirst({
    where: {
      project: { client: { tenantId: user.tenantId } },
    },
    orderBy: { createdAt: "desc" },
  });
  nextCode = lastTicket ? String(parseInt(lastTicket.code, 10) + 1) : "1";
  if (parentTicketId) {
    const parentTicket = await prisma.ticket.findFirst({
      where: {
        id: parentTicketId,
        projectId,
        project: { client: { tenantId: user.tenantId } },
      },
    });
    if (!parentTicket) {
      res.status(400).json({ error: "Tópico pai não encontrado ou inválido" });
      return;
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      code: nextCode,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      type: type || "SUBPROJETO",
      criticidade: criticidade || null,
      status: status || "ABERTO",
      projectId,
      parentTicketId: parentTicketId || null,
      createdById: user.id,
      assignedToId: ids.length > 0 ? ids[0] : null,
      estimativaHoras:
        estimativaHoras != null && estimativaHoras !== ""
          ? Number(estimativaHoras)
          : null,
      dataFimPrevista: dataFimPrevista ? new Date(dataFimPrevista) : null,
      dataInicio: dataInicio ? new Date(dataInicio) : null,
    },
    include: {
      project: { include: { client: true } },
      assignedTo: { select: { id: true, name: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  
  // Se for o primeiro tópico (SUBPROJETO) do projeto, atualizar status do projeto para EM_ANDAMENTO
  if (ticket.type === "SUBPROJETO" && project.statusInicial === "PLANEJADO") {
    const topicsCount = await prisma.ticket.count({
      where: { projectId, type: "SUBPROJETO" },
    });
    if (topicsCount === 1) {
      await prisma.project.update({
        where: { id: projectId },
        data: { statusInicial: "EM_ANDAMENTO" },
      });
    }
  }

  // Registrar criação no histórico
  await prisma.ticketHistory.create({
    data: {
      ticketId: ticket.id,
      userId: user.id,
      action: "CREATE",
      field: null,
      oldValue: null,
      newValue: null,
      details: `Tarefa criada: "${ticket.title}"`,
    },
  });
  
  if (ids.length > 0) {
    await prisma.ticketResponsible.createMany({
      data: ids.map((userId: string) => ({ ticketId: ticket.id, userId })),
    });
    
    const usersInTenant = await prisma.user.findMany({
      where: { id: { in: ids }, tenantId: user.tenantId },
      select: { name: true },
    });
    const names = usersInTenant.map(u => u.name).join(", ");
    
    // Registrar atribuição de responsáveis
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "RESPONSIBLES_CHANGE",
        field: "responsibles",
        oldValue: null,
        newValue: names,
        details: `Responsáveis definidos: ${names}`,
      },
    });
    
    const withResponsibles = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        project: { include: { client: true } },
        assignedTo: { select: { id: true, name: true } },
        responsibles: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return res.json(withResponsibles);
  }
  res.json(ticket);
});

ticketsRouter.get("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      project: { client: { tenantId: user.tenantId } },
    },
    include: {
      project: { include: { client: { include: { users: { select: { userId: true } } } } } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Tópico/tarefa não encontrado" });
    return;
  }
  const canSeeAll = user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canSeeAll && user.role === "CONSULTOR") {
    const uid = user.id;
    const canSee =
      (ticket.assignedToId && ticket.assignedTo?.id === uid) ||
      (ticket.createdById && ticket.createdBy?.id === uid) ||
      (Array.isArray(ticket.responsibles) && ticket.responsibles.some((r) => r.user.id === uid));
    if (!canSee) {
      res.status(403).json({ error: "Sem permissão para visualizar este item" });
      return;
    }
  }
  if (!canSeeAll && user.role === "CLIENTE") {
    const clientUsers = ticket.project?.client?.users ?? [];
    const hasAccess = clientUsers.some((u) => u.userId === user.id);
    if (!hasAccess) {
      res.status(403).json({ error: "Sem permissão para visualizar este item" });
      return;
    }
  }
  res.json(ticket);
});

ticketsRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const { status, title, description, type, criticidade, assignedToId, responsibleIds, parentTicketId, dataFimPrevista, dataInicio, estimativaHoras, progresso } = req.body;
  
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      project: { client: { tenantId: user.tenantId } },
    },
    include: { project: { select: { createdById: true } } },
  });
  
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  
  const isAdmin = user.role === "ADMIN";
  const isGestor = user.role === "GESTOR_PROJETOS";
  if (!isAdmin && !isGestor) {
    const canEdit =
      ticket.project.createdById === user.id ||
      ticket.assignedToId === user.id ||
      ticket.createdById === user.id;
    const isResponsible = ticket.id
      ? await prisma.ticketResponsible.findFirst({ where: { ticketId: ticket.id, userId: user.id } }).then(Boolean)
      : false;
    if (!canEdit && !isResponsible) {
      res.status(403).json({ error: "Sem permissão para atualizar este chamado" });
      return;
    }
  }
  
  // Função auxiliar para criar registro de histórico
  const createHistoryEntry = async (action: string, field: string | null, oldValue: string | null, newValue: string | null, details?: string) => {
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action,
        field,
        oldValue,
        newValue,
        details: details || null,
      },
    });
  };

  const historyEntries: Array<{ action: string; field: string | null; oldValue: string | null; newValue: string | null; details?: string }> = [];

  const updateData: any = {};
  if (status !== undefined && status !== ticket.status) {
    updateData.status = String(status);
    historyEntries.push({
      action: "STATUS_CHANGE",
      field: "status",
      oldValue: ticket.status || null,
      newValue: String(status),
      details: `Status alterado de "${ticket.status}" para "${status}"`,
    });
  }
  if (title !== undefined && title.trim() !== ticket.title) {
    updateData.title = String(title).trim();
    historyEntries.push({
      action: "UPDATE",
      field: "title",
      oldValue: ticket.title || null,
      newValue: String(title).trim(),
      details: `Título alterado`,
    });
  }
  if (description !== undefined) {
    const newDesc = description ? String(description).trim() : null;
    const oldDesc = ticket.description || null;
    if (newDesc !== oldDesc) {
      updateData.description = newDesc;
      historyEntries.push({
        action: "UPDATE",
        field: "description",
        oldValue: oldDesc,
        newValue: newDesc,
        details: newDesc ? "Descrição atualizada" : "Descrição removida",
      });
    }
  }
  if (type !== undefined && type !== ticket.type) {
    updateData.type = String(type);
    historyEntries.push({
      action: "UPDATE",
      field: "type",
      oldValue: ticket.type || null,
      newValue: String(type),
      details: `Tipo alterado de "${ticket.type}" para "${type}"`,
    });
  }
  if (criticidade !== undefined) {
    const newCrit = criticidade ? String(criticidade) : null;
    const oldCrit = ticket.criticidade || null;
    if (newCrit !== oldCrit) {
      updateData.criticidade = newCrit;
      historyEntries.push({
        action: "PRIORITY_CHANGE",
        field: "criticidade",
        oldValue: oldCrit,
        newValue: newCrit,
        details: newCrit ? `Prioridade alterada para "${newCrit}"` : "Prioridade removida",
      });
    }
  }
  if (parentTicketId !== undefined && parentTicketId !== ticket.parentTicketId) {
    updateData.parentTicketId = parentTicketId || null;
    historyEntries.push({
      action: "UPDATE",
      field: "parentTicketId",
      oldValue: ticket.parentTicketId || null,
      newValue: parentTicketId || null,
      details: parentTicketId ? "Tópico alterado" : "Tópico removido",
    });
  }
  // Comparar datas pelo dia em UTC para evitar "atualização fantasma" por fuso horário
  const toDateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (dataFimPrevista !== undefined) {
    const newDate = dataFimPrevista ? new Date(dataFimPrevista) : null;
    const oldDate = ticket.dataFimPrevista;
    const oldOnly = toDateOnly(oldDate);
    const newOnly = toDateOnly(newDate);
    if (oldOnly !== newOnly) {
      updateData.dataFimPrevista = newDate;
      historyEntries.push({
        action: "UPDATE",
        field: "dataFimPrevista",
        oldValue: oldDate ? oldDate.toISOString() : null,
        newValue: newDate ? newDate.toISOString() : null,
        details: newDate ? `Data de entrega definida para ${newDate.toLocaleDateString("pt-BR")}` : "Data de entrega removida",
      });
    }
  }
  if (dataInicio !== undefined) {
    const newDate = dataInicio ? new Date(dataInicio) : null;
    const oldDate = ticket.dataInicio;
    const oldOnly = toDateOnly(oldDate);
    const newOnly = toDateOnly(newDate);
    if (oldOnly !== newOnly) {
      updateData.dataInicio = newDate;
      historyEntries.push({
        action: "UPDATE",
        field: "dataInicio",
        oldValue: oldDate ? oldDate.toISOString() : null,
        newValue: newDate ? newDate.toISOString() : null,
        details: newDate ? `Data de início definida para ${newDate.toLocaleDateString("pt-BR")}` : "Data de início removida",
      });
    }
  }
  if (estimativaHoras !== undefined) {
    const newEst = estimativaHoras ? parseFloat(String(estimativaHoras)) : null;
    const oldEst = ticket.estimativaHoras;
    if (newEst !== oldEst) {
      updateData.estimativaHoras = newEst;
      historyEntries.push({
        action: "UPDATE",
        field: "estimativaHoras",
        oldValue: oldEst !== null && oldEst !== undefined ? String(oldEst) : null,
        newValue: newEst !== null ? String(newEst) : null,
        details: newEst ? `Horas estimadas alteradas para ${newEst}h` : "Horas estimadas removidas",
      });
    }
  }
  if (progresso !== undefined) {
    const progressoNum = parseInt(String(progresso));
    const newProgresso = isNaN(progressoNum) ? null : Math.max(0, Math.min(100, progressoNum));
    const oldProgresso = ticket.progresso;
    if (newProgresso !== oldProgresso) {
      updateData.progresso = newProgresso;
      historyEntries.push({
        action: "UPDATE",
        field: "progresso",
        oldValue: oldProgresso !== null && oldProgresso !== undefined ? String(oldProgresso) : null,
        newValue: newProgresso !== null ? String(newProgresso) : null,
        details: `Progresso alterado para ${newProgresso}%`,
      });
    }
  }
  
  if (assignedToId !== undefined && assignedToId !== ticket.assignedToId) {
    if (assignedToId) {
      const assignedUser = await prisma.user.findFirst({
        where: { id: assignedToId, tenantId: user.tenantId },
      });
      if (!assignedUser) {
        res.status(400).json({ error: "Usuário atribuído não encontrado" });
        return;
      }
      updateData.assignedToId = assignedToId;
      historyEntries.push({
        action: "ASSIGNED",
        field: "assignedToId",
        oldValue: ticket.assignedToId || null,
        newValue: assignedToId,
        details: `Tarefa atribuída para ${assignedUser.name}`,
      });
    } else {
      updateData.assignedToId = null;
      historyEntries.push({
        action: "UNASSIGNED",
        field: "assignedToId",
        oldValue: ticket.assignedToId || null,
        newValue: null,
        details: "Atribuição removida",
      });
    }
  }
  
  // Atualizar responsáveis se fornecido
  if (responsibleIds !== undefined) {
    const ids = Array.isArray(responsibleIds) ? responsibleIds.filter(Boolean) : [];
    const currentResponsibles = await prisma.ticketResponsible.findMany({
      where: { ticketId },
      include: { user: { select: { id: true, name: true } } },
    });
    const currentIds = new Set(currentResponsibles.map((r) => r.userId));
    const newIds = new Set(ids);
    
    // Verificar se houve mudança
    const hasChanged = currentIds.size !== newIds.size || 
      !Array.from(currentIds).every(id => newIds.has(id)) ||
      !Array.from(newIds).every(id => currentIds.has(id));
    
    if (hasChanged) {
      if (ids.length > 0) {
        const usersInTenant = await prisma.user.findMany({
          where: { id: { in: ids }, tenantId: user.tenantId },
          select: { id: true, name: true },
        });
        const validIds = new Set(usersInTenant.map((u) => u.id));
        const invalid = ids.filter((id: string) => !validIds.has(id));
        if (invalid.length > 0) {
          res.status(400).json({ error: "Um ou mais responsáveis não são válidos para este tenant." });
          return;
        }
      }
      
      // Remove todos os responsáveis existentes e adiciona os novos
      await prisma.ticketResponsible.deleteMany({
        where: { ticketId },
      });
      
      if (ids.length > 0) {
        await prisma.ticketResponsible.createMany({
          data: ids.map((userId: string) => ({
            ticketId,
            userId,
          })),
        });
        
        const usersInTenant = await prisma.user.findMany({
          where: { id: { in: ids }, tenantId: user.tenantId },
          select: { name: true },
        });
        const names = usersInTenant.map(u => u.name).join(", ");
        historyEntries.push({
          action: "RESPONSIBLES_CHANGE",
          field: "responsibles",
          oldValue: currentResponsibles.map(r => r.user.name).join(", ") || null,
          newValue: names,
          details: `Responsáveis alterados para: ${names}`,
        });
      } else {
        historyEntries.push({
          action: "RESPONSIBLES_CHANGE",
          field: "responsibles",
          oldValue: currentResponsibles.map(r => r.user.name).join(", ") || null,
          newValue: null,
          details: "Todos os responsáveis foram removidos",
        });
      }
    }
  }
  
  // Criar registros de histórico antes de atualizar
  if (historyEntries.length > 0) {
    await Promise.all(
      historyEntries.map((entry) =>
        prisma.ticketHistory.create({
          data: {
            ticketId,
            userId: user.id,
            action: entry.action,
            field: entry.field,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
            details: entry.details || null,
          },
        })
      )
    );
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
    include: {
      project: { include: { client: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  
  res.json(updated);
});

ticketsRouter.delete("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      project: { client: { tenantId: user.tenantId } },
    },
    include: { project: { select: { createdById: true } } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  const isAdmin = user.role === "ADMIN";
  const isGestor = user.role === "GESTOR_PROJETOS";
  if (!isAdmin && !isGestor) {
    const canDelete =
      ticket.project.createdById === user.id ||
      ticket.assignedToId === user.id ||
      ticket.createdById === user.id;
    const isResponsible = await prisma.ticketResponsible
      .findFirst({ where: { ticketId, userId: user.id } })
      .then(Boolean);
    if (!canDelete && !isResponsible) {
      res.status(403).json({ error: "Sem permissão para excluir este chamado" });
      return;
    }
  }
  await prisma.ticket.delete({ where: { id: ticketId } });
  res.status(204).send();
});
