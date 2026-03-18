import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { filterTicketsForConsultant } from "../lib/ticketVisibility.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const projectsRouter = Router();
projectsRouter.use(authMiddleware);
projectsRouter.use(requireFeature("projeto"));

projectsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const canSeeAll = user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };
  const showArquivados = req.query.arquivado === "true";
  const projects = await prisma.project.findMany({
    where: {
      ...tenantFilter,
      arquivado: showArquivados ? true : false,
      // Admin e gestor: veem todos os projetos
      // Consultor: só projetos criados por ele ou com alguma tarefa atribuída/criada por ele
      // Cliente: só projetos do cliente ao qual está vinculado
      ...(!canSeeAll && {
        OR: [
          { createdById: user.id },
          { client: { users: { some: { userId: user.id } } } },
          ...(user.role === "CONSULTOR"
            ? [
                {
                  tickets: {
                    some: {
                      OR: [
                        { assignedToId: user.id },
                        { createdById: user.id },
                        { responsibles: { some: { userId: user.id } } },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      }),
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          type: true,
          criticidade: true,
          status: true,
          parentTicketId: true,
          dataInicio: true,
          dataFimPrevista: true,
          estimativaHoras: true,
          progresso: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          responsibles: { include: { user: { select: { id: true, name: true } } } },
          _count: { select: { timeEntries: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  
  // Adiciona total de horas apontadas para cada ticket
  const projectsWithHours = await Promise.all(
    projects.map(async (project) => {
      let ticketsToProcess = project.tickets;
      if (user.role === "CONSULTOR") {
        ticketsToProcess = filterTicketsForConsultant(project.tickets, user.id);
      }
      const ticketsWithHours = await Promise.all(
        ticketsToProcess.map(async (ticket) => {
          const hoursAgg = await prisma.timeEntry.aggregate({
            where: { ticketId: ticket.id },
            _sum: { totalHoras: true },
          });
          return {
            ...ticket,
            totalHorasApontadas: hoursAgg._sum.totalHoras ?? 0,
          };
        })
      );
      return {
        ...project,
        tickets: ticketsWithHours,
      };
    })
  );
  
  res.json(projectsWithHours);
});

projectsRouter.get("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = req.params.id;
  const canSeeAll = user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };

  const baseProject = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...tenantFilter,
      ...(!canSeeAll && {
        OR: [
          { createdById: user.id },
          { client: { users: { some: { userId: user.id } } } },
          ...(user.role === "CONSULTOR"
            ? [
                {
                  tickets: {
                    some: {
                      OR: [
                        { assignedToId: user.id },
                        { createdById: user.id },
                        { responsibles: { some: { userId: user.id } } },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      }),
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          type: true,
          criticidade: true,
          status: true,
          parentTicketId: true,
          dataInicio: true,
          dataFimPrevista: true,
          estimativaHoras: true,
          progresso: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          responsibles: { include: { user: { select: { id: true, name: true } } } },
          _count: { select: { timeEntries: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!baseProject) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }

  // Adiciona total de horas apontadas por ticket, com o mesmo formato da lista
  let ticketsToProcess = baseProject.tickets;
  if (user.role === "CONSULTOR") {
    ticketsToProcess = filterTicketsForConsultant(baseProject.tickets, user.id);
  }

  const ticketsWithHours = await Promise.all(
    ticketsToProcess.map(async (ticket) => {
      const hoursAgg = await prisma.timeEntry.aggregate({
        where: { ticketId: ticket.id },
        _sum: { totalHoras: true },
      });
      return {
        ...ticket,
        totalHorasApontadas: hoursAgg._sum.totalHoras ?? 0,
      };
    }),
  );

  const project = {
    ...baseProject,
    tickets: ticketsWithHours,
  };

  res.json(project);
});

projectsRouter.post("/", requireFeature("projeto.novo"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem criar projetos." });
    return;
  }
  const {
    name,
    clientId,
    responsibleIds,
    dataInicio,
    description,
    dataFimPrevista,
    prioridade,
    totalHorasPlanejadas,
    obrigatoriosHoras,
    obrigatoriosDataEntrega,
    tipoProjeto,
    // Fixed Price
    valorContrato,
    escopoInicial,
    limiteHorasEscopo,
    changeRequestsAtivo,
    // AMS
    horasMensaisAMS,
    bancoHorasInicial,
    slaAMS,
    // Anexo
    anexoNomeArquivo,
    anexoUrl,
    anexoTipo,
    anexoTamanho,
  } = req.body;

  if (!name || !clientId || !dataInicio) {
    res.status(400).json({
      error: "Nome do projeto, cliente e data de início são obrigatórios",
    });
    return;
  }

  const ids = Array.isArray(responsibleIds) ? responsibleIds : [];
  if (ids.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um responsável" });
    return;
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
  });
  if (!client) {
    res.status(400).json({ error: "Cliente não encontrado" });
    return;
  }

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

  const dataInicioDate = new Date(dataInicio);
  const dataFimPrevistaDate = dataFimPrevista ? new Date(dataFimPrevista) : null;

  const project = await prisma.project.create({
    data: {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      clientId,
      createdById: user.id,
      dataInicio: dataInicioDate,
      dataFimPrevista: dataFimPrevistaDate,
      prioridade: prioridade || null,
      totalHorasPlanejadas:
        totalHorasPlanejadas != null ? Number(totalHorasPlanejadas) : null,
      // statusInicial: usa default do modelo ("PLANEJADO")
      obrigatoriosHoras: obrigatoriosHoras === true,
      obrigatoriosDataEntrega: obrigatoriosDataEntrega === true,
      tipoProjeto: tipoProjeto && ["INTERNO", "FIXED_PRICE", "AMS", "TIME_MATERIAL"].includes(tipoProjeto) ? tipoProjeto : "INTERNO",
      // Fixed Price
      valorContrato: valorContrato != null ? Number(valorContrato) : null,
      escopoInicial: escopoInicial ? String(escopoInicial).trim() : null,
      limiteHorasEscopo: limiteHorasEscopo != null ? Number(limiteHorasEscopo) : null,
      changeRequestsAtivo: changeRequestsAtivo === true,
      // AMS
      horasMensaisAMS: tipoProjeto === "AMS" && horasMensaisAMS != null ? Number(horasMensaisAMS) : null,
      bancoHorasInicial: tipoProjeto === "AMS" && bancoHorasInicial != null ? Number(bancoHorasInicial) : null,
      slaAMS: tipoProjeto === "AMS" && slaAMS != null ? Number(slaAMS) : null,
      // Anexo
      anexoNomeArquivo: anexoNomeArquivo ? String(anexoNomeArquivo).trim() : null,
      anexoUrl: anexoUrl ? String(anexoUrl).trim() : null,
      anexoTipo: anexoTipo ? String(anexoTipo).trim() : null,
      anexoTamanho: anexoTamanho != null ? Number(anexoTamanho) : null,
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  await prisma.projectResponsible.createMany({
    data: ids.map((userId: string) => ({ projectId: project.id, userId })),
  });

  const withResponsibles = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          responsibles: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  res.status(201).json(withResponsibles);
});

projectsRouter.patch("/:id", requireFeature("projeto.editar"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem editar projetos." });
    return;
  }

  const projectId = req.params.id;
  const existing = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    include: { responsibles: { include: { user: { select: { id: true } } } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }

  const {
    name,
    clientId,
    responsibleIds,
    dataInicio,
    description,
    dataFimPrevista,
    prioridade,
    totalHorasPlanejadas,
    obrigatoriosHoras,
    obrigatoriosDataEntrega,
    tipoProjeto,
    // Fixed Price
    valorContrato,
    escopoInicial,
    limiteHorasEscopo,
    changeRequestsAtivo,
    // AMS
    horasMensaisAMS,
    bancoHorasInicial,
    slaAMS,
    // Anexo
    anexoNomeArquivo,
    anexoUrl,
    anexoTipo,
    anexoTamanho,
  } = req.body;

  if (!name || !clientId || !dataInicio) {
    res.status(400).json({
      error: "Nome do projeto, cliente e data de início são obrigatórios",
    });
    return;
  }

  const ids = Array.isArray(responsibleIds) ? responsibleIds : [];
  if (ids.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um responsável" });
    return;
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
  });
  if (!client) {
    res.status(400).json({ error: "Cliente não encontrado" });
    return;
  }

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

  const allowedTipos = ["INTERNO", "FIXED_PRICE", "AMS", "TIME_MATERIAL"] as const;
  const nextTipo =
    tipoProjeto && allowedTipos.includes(tipoProjeto)
      ? tipoProjeto
      : (existing as any).tipoProjeto ?? "INTERNO";

  const dataInicioDate = new Date(dataInicio);
  const dataFimPrevistaDate = dataFimPrevista ? new Date(dataFimPrevista) : null;

  // Define configs por tipo, limpando campos não aplicáveis
  const fixedPriceData =
    nextTipo === "FIXED_PRICE"
      ? {
          valorContrato: valorContrato != null ? Number(valorContrato) : null,
          escopoInicial: escopoInicial ? String(escopoInicial).trim() : null,
          limiteHorasEscopo: limiteHorasEscopo != null ? Number(limiteHorasEscopo) : null,
          changeRequestsAtivo: changeRequestsAtivo === true,
        }
      : {
          valorContrato: null,
          escopoInicial: null,
          limiteHorasEscopo: null,
          changeRequestsAtivo: false,
        };

  const amsData =
    nextTipo === "AMS"
      ? {
          tipoContratoAMS: null,
          horasMensaisAMS: horasMensaisAMS != null ? Number(horasMensaisAMS) : null,
          bancoHorasInicial: bancoHorasInicial != null ? Number(bancoHorasInicial) : null,
          slaAMS: slaAMS != null ? Number(slaAMS) : null,
        }
      : {
          tipoContratoAMS: null,
          horasMensaisAMS: null,
          bancoHorasInicial: null,
          slaAMS: null,
        };

  // Regras de anexo:
  // - se vier null explícito, limpa
  // - se vier undefined, mantém
  const anexoPatch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "anexoNomeArquivo")) anexoPatch.anexoNomeArquivo = anexoNomeArquivo;
  if (Object.prototype.hasOwnProperty.call(req.body, "anexoUrl")) anexoPatch.anexoUrl = anexoUrl;
  if (Object.prototype.hasOwnProperty.call(req.body, "anexoTipo")) anexoPatch.anexoTipo = anexoTipo;
  if (Object.prototype.hasOwnProperty.call(req.body, "anexoTamanho")) anexoPatch.anexoTamanho = anexoTamanho;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        clientId,
        dataInicio: dataInicioDate,
        dataFimPrevista: dataFimPrevistaDate,
        prioridade: prioridade || null,
        totalHorasPlanejadas: totalHorasPlanejadas != null ? Number(totalHorasPlanejadas) : null,
        // statusInicial não é mais editado manualmente via form; mantemos o valor atual
        obrigatoriosHoras: obrigatoriosHoras === true,
        obrigatoriosDataEntrega: obrigatoriosDataEntrega === true,
        tipoProjeto: nextTipo as any,
        ...fixedPriceData,
        ...amsData,
        ...anexoPatch,
        // Limpa configs de T&M (não usamos configurações)
        periodoAprovacaoTM: null,
        aprovacaoAutomaticaTM: false,
        estimativaInicialTM: null,
      } as any,
    });

    await tx.projectResponsible.deleteMany({ where: { projectId } });
    await tx.projectResponsible.createMany({
      data: ids.map((userId: string) => ({ projectId, userId })),
    });
  });

  const updated = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          responsibles: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  res.json(updated);
});

projectsRouter.patch("/:id/archive", requireFeature("projeto.editar"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem arquivar projetos." });
    return;
  }

  const projectId = req.params.id;
  const { arquivado } = req.body;

  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
  });

  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      arquivado: arquivado === true,
      arquivadoEm: arquivado === true ? new Date() : null,
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          responsibles: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  res.json(updated);
});

projectsRouter.delete("/:id", requireFeature("projeto.excluir"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem excluir projetos." });
    return;
  }
  const projectId = req.params.id;
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
  });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  await prisma.project.delete({ where: { id: projectId } });
  res.status(204).send();
});
