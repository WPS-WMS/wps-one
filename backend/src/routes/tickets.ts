import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { filterTicketsForConsultant } from "../lib/ticketVisibility.js";
import {
  SLA_STAFF_ROLES,
  getSlaHorasPorPrioridade,
  isFinalizedAmsTicketWithinSla,
  slaHorasAplicavel,
} from "../lib/amsSlaCompliance.js";

export const ticketsRouter = Router();
ticketsRouter.use(authMiddleware);

/** Listagem enxuta: menos colunas e relações (detalhe continua em GET /:id). */
const TICKET_LIST_LIGHT_SELECT = {
  id: true,
  code: true,
  title: true,
  type: true,
  criticidade: true,
  status: true,
  finalizacaoMotivo: true,
  finalizacaoObservacao: true,
  projectId: true,
  parentTicketId: true,
  createdById: true,
  assignedToId: true,
  dataInicio: true,
  dataFimPrevista: true,
  estimativaHoras: true,
  progresso: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
    },
  },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  responsibles: { select: { user: { select: { id: true, name: true } } } },
} as const;

/** Mesmo payload útil ao Kanban, sem join em `project` (redundante quando já filtramos por projectId). */
const TICKET_LIST_LIGHT_IN_PROJECT = {
  id: true,
  code: true,
  title: true,
  type: true,
  criticidade: true,
  status: true,
  finalizacaoMotivo: true,
  finalizacaoObservacao: true,
  projectId: true,
  parentTicketId: true,
  createdById: true,
  assignedToId: true,
  dataInicio: true,
  dataFimPrevista: true,
  estimativaHoras: true,
  progresso: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  responsibles: { select: { user: { select: { id: true, name: true } } } },
} as const;

const TICKET_LIST_FULL_INCLUDE = {
  project: { include: { client: true } },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  responsibles: { include: { user: { select: { id: true, name: true } } } },
} as const;

function normalizeAmsPriority(value: string | null | undefined): "BAIXA" | "MEDIA" | "ALTA" | "CRITICA" | null {
  if (!value) return null;
  const raw = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (raw === "BAIXA" || raw === "MEDIA" || raw === "ALTA" || raw === "CRITICA") return raw;
  if (raw === "URGENTE" || raw === "CRITICO") return "CRITICA";
  return null;
}

// O status do projeto é controlado manualmente (não sincronizar automaticamente por tarefas/tópicos).

ticketsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const { projectId, assignedTo, status, parentTicketId, createdBy, type: typeQuery } = req.query;
  const light =
    String(req.query.light || "") === "true" || String(req.query.light || "") === "1";
  const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
  const consultantWithProject =
    user.role === "CONSULTOR" && projectId;

  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;
  let take: number | undefined;
  let skip: number | undefined;
  // Paginação só no DB quando não há filtro extra do consultor por projeto (senão o slice seria incorreto)
  if (!consultantWithProject && rawLimit !== undefined && String(rawLimit) !== "") {
    const n = parseInt(String(rawLimit), 10);
    if (!Number.isNaN(n) && n > 0) {
      take = Math.min(500, n);
      const off = parseInt(String(rawOffset ?? "0"), 10);
      skip = Number.isNaN(off) || off < 0 ? 0 : off;
    }
  }

  const where = {
    ...tenantFilter,
    ...(projectId && { projectId: String(projectId) }),
    ...(assignedTo && { assignedToId: String(assignedTo) }),
    ...(status && { status: String(status) }),
    ...(parentTicketId && { parentTicketId: String(parentTicketId) }),
    ...(typeQuery && String(typeQuery).trim() !== "" && { type: String(typeQuery) }),
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
  };

  const orderBy = { createdAt: "desc" as const };
  const pagination = take !== undefined ? { take, ...(skip !== undefined && skip > 0 ? { skip } : {}) } : {};

  const lightSelect =
    light && projectId
      ? TICKET_LIST_LIGHT_IN_PROJECT
      : light
        ? TICKET_LIST_LIGHT_SELECT
        : null;

  const tickets = light
    ? await prisma.ticket.findMany({
        where,
        select: lightSelect!,
        orderBy,
        ...pagination,
      })
    : await prisma.ticket.findMany({
        where,
        include: TICKET_LIST_FULL_INCLUDE,
        orderBy,
        ...pagination,
      });

  const list = consultantWithProject
    ? filterTicketsForConsultant(tickets, user.id)
    : tickets;
  res.json(list);
});

/**
 * Percentual de chamados AMS finalizados dentro do SLA (resposta + solução conforme configuração atual do projeto).
 * - Cliente: todos os chamados AMS dos projetos da empresa.
 * - Demais perfis: chamados onde o usuário é responsável (mesma regra da home).
 */
ticketsRouter.get("/sla-compliance-summary", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;

  const clientBranch =
    user.role === "CLIENTE"
      ? { users: { some: { userId: user.id } } }
      : ({} as Record<string, unknown>);

  const staffBranch =
    user.role !== "CLIENTE"
      ? {
          OR: [{ assignedToId: user.id }, { responsibles: { some: { userId: user.id } } }],
        }
      : ({} as Record<string, unknown>);

  const tickets = await prisma.ticket.findMany({
    where: {
      status: "ENCERRADO",
      type: { notIn: ["SUBPROJETO", "SUBTAREFA"] },
      project: {
        tipoProjeto: "AMS",
        client: { tenantId: user.tenantId, ...clientBranch },
      },
      ...staffBranch,
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      criticidade: true,
      project: {
        select: {
          slaRespostaBaixa: true,
          slaSolucaoBaixa: true,
          slaRespostaMedia: true,
          slaSolucaoMedia: true,
          slaRespostaAlta: true,
          slaSolucaoAlta: true,
          slaRespostaCritica: true,
          slaSolucaoCritica: true,
        },
      },
    },
  });

  const applicable = tickets.filter((t) => {
    const { resposta, solucao } = getSlaHorasPorPrioridade(t.project, t.criticidade);
    return slaHorasAplicavel(resposta, solucao);
  });

  if (applicable.length === 0) {
    res.json({
      percent: null as number | null,
      dentroPrazo: 0,
      total: 0,
      aplicavel: false,
    });
    return;
  }

  const ids = applicable.map((t) => t.id);

  const commentRows = await prisma.ticketComment.findMany({
    where: {
      ticketId: { in: ids },
      visibility: "PUBLIC",
      user: { role: { in: [...SLA_STAFF_ROLES] } },
    },
    select: { ticketId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstStaffPublicByTicket = new Map<string, Date>();
  for (const row of commentRows) {
    if (!firstStaffPublicByTicket.has(row.ticketId)) {
      firstStaffPublicByTicket.set(row.ticketId, row.createdAt);
    }
  }

  const historyRows = await prisma.ticketHistory.findMany({
    where: {
      ticketId: { in: ids },
      action: "STATUS_CHANGE",
      newValue: "ENCERRADO",
    },
    select: { ticketId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastClosedByTicket = new Map<string, Date>();
  for (const row of historyRows) {
    if (!lastClosedByTicket.has(row.ticketId)) {
      lastClosedByTicket.set(row.ticketId, row.createdAt);
    }
  }

  let dentroPrazo = 0;
  for (const t of applicable) {
    const { resposta, solucao } = getSlaHorasPorPrioridade(t.project, t.criticidade);
    const first = firstStaffPublicByTicket.get(t.id) ?? null;
    const closed = lastClosedByTicket.get(t.id) ?? t.updatedAt;
    if (
      isFinalizedAmsTicketWithinSla({
        createdAt: t.createdAt,
        firstStaffPublicCommentAt: first,
        closedAt: closed,
        respostaHoras: resposta,
        solucaoHoras: solucao,
      })
    ) {
      dentroPrazo += 1;
    }
  }

  const total = applicable.length;
  const percent = Math.round((dentroPrazo / total) * 100);
  res.json({
    percent,
    dentroPrazo,
    total,
    aplicavel: true,
  });
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

  const effectiveType = type != null && String(type).trim() !== "" ? String(type).trim() : "SUBPROJETO";
  const isSubprojetoTopic = effectiveType === "SUBPROJETO";
  // AMS: chamados/tarefas (não tópico) exigem prioridade válida para aplicar SLA desde a criação
  if (project.tipoProjeto === "AMS" && !isSubprojetoTopic) {
    const critRaw = criticidade != null ? String(criticidade).trim() : "";
    if (!critRaw) {
      res.status(400).json({ error: "Prioridade é obrigatória para chamados em projetos AMS." });
      return;
    }
    if (!normalizeAmsPriority(critRaw)) {
      res.status(400).json({ error: "Prioridade inválida. Use Baixa, Média, Alta ou Urgente." });
      return;
    }
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

  const normalizedAmsPriority = normalizeAmsPriority(criticidade);
  const slaRespostaHoras =
    project.tipoProjeto === "AMS" && normalizedAmsPriority === "BAIXA"
      ? project.slaRespostaBaixa
      : project.tipoProjeto === "AMS" && normalizedAmsPriority === "MEDIA"
        ? project.slaRespostaMedia
        : project.tipoProjeto === "AMS" && normalizedAmsPriority === "ALTA"
          ? project.slaRespostaAlta
          : project.tipoProjeto === "AMS" && normalizedAmsPriority === "CRITICA"
            ? project.slaRespostaCritica
            : null;
  const slaSolucaoHoras =
    project.tipoProjeto === "AMS" && normalizedAmsPriority === "BAIXA"
      ? project.slaSolucaoBaixa
      : project.tipoProjeto === "AMS" && normalizedAmsPriority === "MEDIA"
        ? project.slaSolucaoMedia
        : project.tipoProjeto === "AMS" && normalizedAmsPriority === "ALTA"
          ? project.slaSolucaoAlta
          : project.tipoProjeto === "AMS" && normalizedAmsPriority === "CRITICA"
            ? project.slaSolucaoCritica
            : null;
  // SLA AMS: prazos são calculados por fases (1º comentário público da equipe + finalização), não por dataFimPrevista única.
  const dataFimPrevistaResolved = dataFimPrevista ? new Date(dataFimPrevista) : null;

  const ticket = await prisma.ticket.create({
    data: {
      code: nextCode,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      type: effectiveType,
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
      dataFimPrevista: dataFimPrevistaResolved,
      dataInicio: dataInicio ? new Date(dataInicio) : null,
      slaRespostaHoras: slaRespostaHoras != null ? Number(slaRespostaHoras) : null,
      slaSolucaoHoras: slaSolucaoHoras != null ? Number(slaSolucaoHoras) : null,
    },
    include: {
      project: { include: { client: true } },
      assignedTo: { select: { id: true, name: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  
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
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
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
  const {
    status,
    title,
    description,
    type,
    criticidade,
    assignedToId,
    responsibleIds,
    parentTicketId,
    dataFimPrevista,
    dataInicio,
    estimativaHoras,
    progresso,
    finalizacaoMotivo,
    finalizacaoObservacao,
  } = req.body;
  
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      project: { client: { tenantId: user.tenantId } },
    },
    include: {
      project: {
        select: {
          createdById: true,
          tipoProjeto: true,
          slaRespostaBaixa: true,
          slaSolucaoBaixa: true,
          slaRespostaMedia: true,
          slaSolucaoMedia: true,
          slaRespostaAlta: true,
          slaSolucaoAlta: true,
          slaRespostaCritica: true,
          slaSolucaoCritica: true,
        },
      },
    },
  });
  
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  
  const isAdmin = user.role === "SUPER_ADMIN";
  const isGestor = user.role === "GESTOR_PROJETOS";
  if (!isAdmin && !isGestor) {
    const canEdit =
      ticket.project.createdById === user.id ||
      ticket.assignedToId === user.id ||
      ticket.createdById === user.id;
    const isResponsible = ticket.id
      ? await prisma.ticketResponsible.findFirst({ where: { ticketId: ticket.id, userId: user.id } }).then(Boolean)
      : false;
    // Se o usuário for membro do TÓPICO (SUBPROJETO pai), ele pode editar qualquer tarefa dentro desse tópico,
    // mesmo não sendo membro direto da tarefa (regra: acesso do tópico é mais importante).
    const isTopicMember = ticket.parentTicketId
      ? await prisma.ticketResponsible
          .findFirst({ where: { ticketId: ticket.parentTicketId, userId: user.id } })
          .then(Boolean)
      : false;

    if (!canEdit && !isResponsible && !isTopicMember) {
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
    const willClose = String(status) === "ENCERRADO" && ticket.status !== "ENCERRADO";
    const requiresCloseReason =
      willClose && (ticket.project.tipoProjeto === "AMS" || ticket.project.tipoProjeto === "TIME_MATERIAL");
    if (requiresCloseReason) {
      const motivo = typeof finalizacaoMotivo === "string" ? finalizacaoMotivo.trim() : "";
      const obs = typeof finalizacaoObservacao === "string" ? finalizacaoObservacao.trim() : "";
      if (!motivo) {
        res.status(400).json({ error: "Informe o motivo da finalização." });
        return;
      }
      updateData.finalizacaoMotivo = motivo;
      updateData.finalizacaoObservacao = obs || null;
      const detailsParts = [`Motivo: ${motivo}`];
      if (obs) detailsParts.push(`Observação: ${obs}`);
      historyEntries.push({
        action: "STATUS_CHANGE",
        field: "status",
        oldValue: ticket.status || null,
        newValue: String(status),
        details: detailsParts.join(" | "),
      });
      // Evita duplicar a entrada padrão abaixo
      // (já registramos acima com motivo/observação)
      // eslint-disable-next-line no-empty
    } else {
      // Se sair de "ENCERRADO", limpa o motivo/observação para não manter dado antigo.
      if (ticket.status === "ENCERRADO") {
        updateData.finalizacaoMotivo = null;
        updateData.finalizacaoObservacao = null;
      }
      historyEntries.push({
        action: "STATUS_CHANGE",
        field: "status",
        oldValue: ticket.status || null,
        newValue: String(status),
        details: `Status alterado de "${ticket.status}" para "${status}"`,
      });
    }
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
      // AMS: SLA segue prioridade atual do projeto (sem gravar dataFimPrevista automática).
      if (ticket.project.tipoProjeto === "AMS" && ticket.status !== "ENCERRADO") {
        const norm = normalizeAmsPriority(newCrit);
        const r =
          norm === "BAIXA"
            ? ticket.project.slaRespostaBaixa
            : norm === "MEDIA"
              ? ticket.project.slaRespostaMedia
              : norm === "ALTA"
                ? ticket.project.slaRespostaAlta
                : norm === "CRITICA"
                  ? ticket.project.slaRespostaCritica
                  : null;
        const s =
          norm === "BAIXA"
            ? ticket.project.slaSolucaoBaixa
            : norm === "MEDIA"
              ? ticket.project.slaSolucaoMedia
              : norm === "ALTA"
                ? ticket.project.slaSolucaoAlta
                : norm === "CRITICA"
                  ? ticket.project.slaSolucaoCritica
                  : null;
        updateData.slaRespostaHoras = r != null ? Number(r) : null;
        updateData.slaSolucaoHoras = s != null ? Number(s) : null;
      }
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
  const isAdmin = user.role === "SUPER_ADMIN";
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
