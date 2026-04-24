import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, isConsultantLikeRole } from "../lib/auth.js";
import { consultantTicketsForProject } from "../lib/ticketVisibility.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { join, normalize, sep } from "path";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { isFeatureAllowed, type RoleId } from "../lib/permissions.js";

function normalizeProjectLifecycleStatus(raw: unknown): "ATIVO" | "ENCERRADO" | "EM_ESPERA" | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  // Novo fluxo
  if (v === "ATIVO" || v === "ENCERRADO" || v === "EM_ESPERA") return v as any;
  // Compatibilidade com legado
  if (v === "EM_ANDAMENTO") return "ATIVO";
  if (v === "PLANEJADO") return "EM_ESPERA";
  if (v === "CONCLUIDO") return "ENCERRADO";
  return null;
}

export const projectsRouter = Router();
projectsRouter.use(authMiddleware);
projectsRouter.use(requireFeature("projeto"));

async function assertCanAccessProject(params: {
  user: { id: string; role: string; tenantId: string };
  projectId: string;
}) {
  const { user, projectId } = params;
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...tenantFilter,
      ...(!canSeeAll && {
        OR: [
          { createdById: user.id },
          { client: { users: { some: { userId: user.id } } } },
          ...(isConsultantLikeRole(user.role)
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
                { responsibles: { some: { userId: user.id } } },
              ]
            : []),
        ],
      }),
    },
    select: { id: true },
  });
  return Boolean(project);
}

function parseColumnId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeColumnLabel(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 60);
}

function normalizeColumnColor(raw: unknown): string {
  // Tailwind class (ex.: bg-cyan-500) - mantém simples e segura
  const c = String(raw ?? "").trim();
  if (!c) return "bg-slate-400";
  if (!/^bg-[a-z]+-\d{2,3}$/i.test(c)) return "bg-slate-400";
  return c;
}

function normalizeKanbanColorClass(raw: unknown): string {
  const c = String(raw ?? "").trim();
  if (!c) return "bg-slate-400";
  if (c.startsWith("bg-")) return c;
  if (/^bg-\[.+\]$/i.test(c)) return c;
  return "bg-slate-400";
}

projectsRouter.get("/:id/kanban-columns", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = String(req.params.id || "").trim();
  if (!projectId) {
    res.status(400).json({ error: "Projeto inválido" });
    return;
  }
  const canAccess = await assertCanAccessProject({ user, projectId });
  if (!canAccess) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  const cols = await prisma.kanbanColumn.findMany({
    where: { tenantId: user.tenantId, projectId, deletedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, color: true, order: true, createdAt: true, updatedAt: true },
  });
  res.json(cols);
});

projectsRouter.post("/:id/kanban-columns/import", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = String(req.params.id || "").trim();
  if (!projectId) {
    res.status(400).json({ error: "Projeto inválido" });
    return;
  }
  const canAccess = await assertCanAccessProject({ user, projectId });
  if (!canAccess) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  const rawCols = (req.body as any)?.columns;
  if (!Array.isArray(rawCols)) {
    res.status(400).json({ error: "columns deve ser um array" });
    return;
  }
  const safe = rawCols
    .map((c: any) => ({
      id: parseColumnId(c?.id),
      label: normalizeColumnLabel(c?.label),
      color: normalizeColumnColor(c?.color),
      order: Number.isFinite(Number(c?.order)) ? Number(c?.order) : 0,
    }))
    .filter((c) => c.id && c.id.startsWith("CUSTOM_") && c.label);

  if (safe.length === 0) {
    res.json({ imported: 0 });
    return;
  }

  // Segurança: como `KanbanColumn.id` é PK global, não permitimos "tomar posse" de um id existente
  // de outro tenant/projeto via upsert.
  const idsToUpsert = Array.from(new Set(safe.map((c) => c.id)));
  const existing = await prisma.kanbanColumn.findMany({
    where: { id: { in: idsToUpsert } },
    select: { id: true, tenantId: true, projectId: true },
  });
  const conflicts = existing
    .filter((c) => c.tenantId !== user.tenantId || c.projectId !== projectId)
    .map((c) => c.id);
  if (conflicts.length > 0) {
    res.status(409).json({
      error: "Um ou mais ids de coluna já existem em outro projeto/tenant.",
      ids: conflicts.slice(0, 50),
    });
    return;
  }

  const result = await prisma.$transaction(
    safe.map((c) =>
      prisma.kanbanColumn.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          tenantId: user.tenantId,
          projectId,
          label: c.label,
          color: c.color,
          order: c.order,
        },
        update: {
          // não sobrescreve label/cor se já existir; apenas garante tenant/projeto e "des-deleta"
          tenantId: user.tenantId,
          projectId,
          deletedAt: null,
        },
      }),
    ),
  );
  res.json({ imported: result.length });
});

projectsRouter.post("/:id/kanban-columns", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = String(req.params.id || "").trim();
  if (!projectId) {
    res.status(400).json({ error: "Projeto inválido" });
    return;
  }
  const canAccess = await assertCanAccessProject({ user, projectId });
  if (!canAccess) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  const id = parseColumnId((req.body as any)?.id);
  const label = normalizeColumnLabel((req.body as any)?.label);
  const color = normalizeColumnColor((req.body as any)?.color);
  if (!id || !id.startsWith("CUSTOM_") || !label) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  // Segurança: bloqueia reaproveitamento malicioso de ids existentes (PK global).
  const existing = await prisma.kanbanColumn.findUnique({
    where: { id },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (existing && (existing.tenantId !== user.tenantId || existing.projectId !== projectId)) {
    res.status(409).json({ error: "ID de coluna já existe em outro projeto/tenant." });
    return;
  }

  const max = await prisma.kanbanColumn.aggregate({
    where: { tenantId: user.tenantId, projectId, deletedAt: null },
    _max: { order: true },
  });
  const nextOrder = (max._max.order ?? 0) + 1;

  const col = await prisma.kanbanColumn.upsert({
    where: { id },
    create: { id, tenantId: user.tenantId, projectId, label, color, order: nextOrder },
    update: { tenantId: user.tenantId, projectId, label, color, deletedAt: null },
    select: { id: true, label: true, color: true, order: true, createdAt: true, updatedAt: true },
  });
  res.json(col);
});

projectsRouter.delete("/:id/kanban-columns/:columnId", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = String(req.params.id || "").trim();
  const columnId = String(req.params.columnId || "").trim();
  if (!projectId || !columnId) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }
  const canAccess = await assertCanAccessProject({ user, projectId });
  if (!canAccess) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  // Soft delete
  await prisma.kanbanColumn.updateMany({
    where: { tenantId: user.tenantId, projectId, id: columnId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
});

type ProjectsCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const PROJECTS_LIST_CACHE_TTL_MS = 12_000;
const projectsListCache = new Map<string, ProjectsCacheEntry>();

function buildProjectsCacheKey(params: {
  tenantId: string;
  userId: string;
  role: string;
  arquivado: boolean;
  light: boolean;
}) {
  return `${params.tenantId}:${params.userId}:${params.role}:${params.arquivado ? "archived" : "active"}:${params.light ? "light" : "full"}`;
}

function getProjectsCache(key: string) {
  const hit = projectsListCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    projectsListCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setProjectsCache(key: string, payload: unknown) {
  projectsListCache.set(key, {
    expiresAt: Date.now() + PROJECTS_LIST_CACHE_TTL_MS,
    payload,
  });
}

function clearProjectsCache() {
  projectsListCache.clear();
}

function canAccessProjectWhere(user: { id: string; role: string; tenantId: string }) {
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };
  if (canSeeAll) return { ...tenantFilter };
  return {
    ...tenantFilter,
    OR: [
      { createdById: user.id },
      { client: { users: { some: { userId: user.id } } } },
      ...(isConsultantLikeRole(user.role)
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
            { responsibles: { some: { userId: user.id } } },
          ]
        : []),
    ],
  };
}

function resolveProjectUploadPath(anexoUrl: string): string | null {
  const trimmed = anexoUrl.trim();
  if (!trimmed.startsWith("/uploads/projects/")) return null;
  const abs = resolveUploadsPublicPath(trimmed);
  if (!abs) return null;
  const rootPrefix = normalize(join(getUploadsRoot(), "projects") + sep);
  const normAbs = normalize(abs + sep);
  if (!normAbs.startsWith(rootPrefix)) return null;
  return abs;
}

async function buildHoursByTicketMap(ticketIds: string[]) {
  if (ticketIds.length === 0) return new Map<string, number>();
  const grouped = await prisma.timeEntry.groupBy({
    by: ["ticketId"],
    where: { ticketId: { in: ticketIds } },
    _sum: { totalHoras: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) {
    if (!row.ticketId) continue;
    map.set(row.ticketId, row._sum.totalHoras ?? 0);
  }
  return map;
}

/** Soma de todas as horas apontadas no projeto (todos os lançamentos vinculados ao projectId). */
async function buildHorasUtilizadasPorProjetoMap(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, number>();
  const rows = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds } },
    _sum: { totalHoras: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.projectId, row._sum.totalHoras ?? 0);
  }
  return map;
}

/** Listagem inicial: campos necessários para métricas, status e regra do consultor — sem description nem anexos. */
const TICKET_SUMMARY_FOR_LIST_SELECT = {
  id: true,
  code: true,
  title: true,
  type: true,
  criticidade: true,
  status: true,
  finalizacaoMotivo: true,
  finalizacaoObservacao: true,
  parentTicketId: true,
  dataInicio: true,
  dataFimPrevista: true,
  estimativaHoras: true,
  progresso: true,
  createdAt: true,
  projectId: true,
  assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
  responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
  _count: { select: { timeEntries: true } },
} as const;

projectsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };
  const showArquivados = req.query.arquivado === "true";
  const lightMode = req.query.light === "true";
  if (showArquivados) {
    const allowed = await isFeatureAllowed({
      tenantId: user.tenantId,
      role: user.role as RoleId,
      featureId: "projeto.arquivar",
    });
    if (!allowed) {
      res.status(403).json({ error: "Sem permissão para visualizar projetos arquivados" });
      return;
    }
  }
  const cacheKey = buildProjectsCacheKey({
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    arquivado: showArquivados,
    light: lightMode,
  });
  const cached = getProjectsCache(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const projectsWhere = {
    ...tenantFilter,
    arquivado: showArquivados ? true : false,
    // Admin e gestor: veem todos os projetos
    // Consultor: só projetos criados por ele ou com alguma tarefa atribuída/criada por ele
    // Cliente: só projetos do cliente ao qual está vinculado
    ...(!canSeeAll && {
      OR: [
        { createdById: user.id },
        { client: { users: { some: { userId: user.id } } } },
        ...(isConsultantLikeRole(user.role)
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
              { responsibles: { some: { userId: user.id } } },
            ]
          : []),
      ],
    }),
  };

  // Dois findMany separados para o TypeScript inferir `tickets` só no modo full (include condicional virava união sem `tickets`).
  if (lightMode) {
    const projectsLight = await prisma.project.findMany({
      where: projectsWhere,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        dataInicio: true,
        dataFimPrevista: true,
        prioridade: true,
        totalHorasPlanejadas: true,
        limiteHorasEscopo: true,
        tipoProjeto: true,
        horasMensaisAMS: true,
        bancoHorasInicial: true,
        slaRespostaBaixa: true,
        slaSolucaoBaixa: true,
        slaRespostaMedia: true,
        slaSolucaoMedia: true,
        slaRespostaAlta: true,
        slaSolucaoAlta: true,
        slaRespostaCritica: true,
        slaSolucaoCritica: true,
        anexoNomeArquivo: true,
        anexoUrl: true,
        anexoTipo: true,
        anexoTamanho: true,
        arquivado: true,
        arquivadoEm: true,
        statusInicial: true,
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
        _count: { select: { tickets: true, timeEntries: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const projectIds = projectsLight.map((p) => p.id);
    const summaryRows =
      projectIds.length === 0
        ? []
        : await prisma.ticket.findMany({
            where: { projectId: { in: projectIds } },
            select: TICKET_SUMMARY_FOR_LIST_SELECT,
            orderBy: { createdAt: "desc" },
          });
    type SummaryTicket = (typeof summaryRows)[number];
    const ticketsByProjectId = new Map<string, SummaryTicket[]>();
    for (const row of summaryRows) {
      const list = ticketsByProjectId.get(row.projectId) ?? [];
      list.push(row);
      ticketsByProjectId.set(row.projectId, list);
    }
    const horasPorProjeto = await buildHorasUtilizadasPorProjetoMap(projectIds);
    const lightweight = projectsLight.map((project) => {
      let tickets: SummaryTicket[] = ticketsByProjectId.get(project.id) ?? [];
      if (isConsultantLikeRole(user.role)) {
        tickets = consultantTicketsForProject(tickets, user.id, project.responsibles);
      }
      return {
        ...project,
        tickets,
        listMode: "summary" as const,
        horasUtilizadas: horasPorProjeto.get(project.id) ?? 0,
      };
    });
    setProjectsCache(cacheKey, lightweight);
    res.json(lightweight);
    return;
  }

  const projects = await prisma.project.findMany({
    where: projectsWhere,
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
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
          assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
          _count: { select: { timeEntries: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Evita N+1: agrega horas de todos os tickets em uma única consulta.
  const allTicketIds = projects.flatMap((project) => project.tickets.map((ticket) => ticket.id));
  const hoursByTicket = await buildHoursByTicketMap(allTicketIds);
  const projectIdsFull = projects.map((p) => p.id);
  const horasPorProjetoFull = await buildHorasUtilizadasPorProjetoMap(projectIdsFull);

  const projectsWithHours = projects.map((project) => {
    let ticketsToProcess = project.tickets;
    if (isConsultantLikeRole(user.role)) {
      ticketsToProcess = consultantTicketsForProject(project.tickets, user.id, project.responsibles);
    }
    const ticketsWithHours = ticketsToProcess.map((ticket) => ({
      ...ticket,
      totalHorasApontadas: hoursByTicket.get(ticket.id) ?? 0,
    }));
    return {
      ...project,
      tickets: ticketsWithHours,
      listMode: "full" as const,
      horasUtilizadas: horasPorProjetoFull.get(project.id) ?? 0,
    };
  });

  setProjectsCache(cacheKey, projectsWithHours);
  res.json(projectsWithHours);
});

// Visualização/Download autenticado da proposta comercial anexada ao projeto.
// Use este endpoint no frontend em vez de linkar direto em /uploads.
projectsRouter.get("/:id/proposal", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = req.params.id;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...canAccessProjectWhere(user) },
    select: {
      id: true,
      anexoUrl: true,
      anexoNomeArquivo: true,
      anexoTipo: true,
    },
  });
  if (!project || !project.anexoUrl) {
    res.status(404).json({ error: "Anexo não encontrado" });
    return;
  }

  const url = String(project.anexoUrl);
  if (url.startsWith("http://") || url.startsWith("https://")) {
    res.redirect(url);
    return;
  }

  const abs = resolveProjectUploadPath(url);
  if (!abs) {
    res.status(400).json({ error: "Anexo inválido" });
    return;
  }

  const download = req.query.download === "1" || req.query.download === "true";
  if (project.anexoTipo) res.setHeader("Content-Type", project.anexoTipo);
  if (download) {
    const name = project.anexoNomeArquivo ? String(project.anexoNomeArquivo) : "proposta-comercial";
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/\"/g, "")}"`);
  }
  res.sendFile(abs);
});

projectsRouter.get("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const projectId = req.params.id;
  const lightDetail = req.query.light === "true";
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  const tenantFilter = { client: { tenantId: user.tenantId } };

  if (lightDetail) {
    const projectLight = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...tenantFilter,
        ...(!canSeeAll && {
          OR: [
            { createdById: user.id },
            { client: { users: { some: { userId: user.id } } } },
            ...(isConsultantLikeRole(user.role)
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
                  { responsibles: { some: { userId: user.id } } },
                ]
              : []),
          ],
        }),
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
        _count: { select: { tickets: true, timeEntries: true } },
      },
    });
    if (!projectLight) {
      res.status(404).json({ error: "Projeto não encontrado" });
      return;
    }
    const usedLight = await prisma.timeEntry.aggregate({
      where: { projectId },
      _sum: { totalHoras: true },
    });
    res.json({
      ...projectLight,
      tickets: [],
      listMode: "summary" as const,
      horasUtilizadas: usedLight._sum.totalHoras ?? 0,
    });
    return;
  }

  const baseProject = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...tenantFilter,
      ...(!canSeeAll && {
        OR: [
          { createdById: user.id },
          { client: { users: { some: { userId: user.id } } } },
          ...(isConsultantLikeRole(user.role)
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
                { responsibles: { some: { userId: user.id } } },
              ]
            : []),
        ],
      }),
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
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
          assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
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
  if (isConsultantLikeRole(user.role)) {
    ticketsToProcess = consultantTicketsForProject(baseProject.tickets, user.id, baseProject.responsibles);
  }

  const hoursByTicket = await buildHoursByTicketMap(ticketsToProcess.map((ticket) => ticket.id));
  const ticketsWithHours = ticketsToProcess.map((ticket) => ({
    ...ticket,
    totalHorasApontadas: hoursByTicket.get(ticket.id) ?? 0,
  }));

  // Injeta label/cor das colunas customizadas diretamente no payload das tarefas
  // (Lista de Projetos usa essa listagem e precisa da cor sem depender de cache).
  const customStatusIds = Array.from(
    new Set(
      ticketsWithHours
        .map((t) => String((t as any)?.status ?? ""))
        .filter((s) => s && s.startsWith("CUSTOM_")),
    ),
  );
  let ticketsWithUi = ticketsWithHours as any[];
  if (customStatusIds.length > 0) {
    const cols = await prisma.kanbanColumn.findMany({
      where: {
        tenantId: user.tenantId,
        projectId,
        deletedAt: null,
        id: { in: customStatusIds },
      },
      select: { id: true, label: true, color: true },
    });
    const byId = new Map(cols.map((c) => [c.id, { label: c.label, color: normalizeKanbanColorClass(c.color) }] as const));
    ticketsWithUi = ticketsWithHours.map((t) => {
      const st = String((t as any)?.status ?? "");
      if (!st.startsWith("CUSTOM_")) return t as any;
      const hit = byId.get(st);
      if (!hit) return t as any;
      return { ...(t as any), statusLabel: hit.label, statusColor: hit.color };
    });
  }

  const usedDetail = await prisma.timeEntry.aggregate({
    where: { projectId },
    _sum: { totalHoras: true },
  });

  const project = {
    ...baseProject,
    tickets: ticketsWithUi,
    listMode: "full" as const,
    horasUtilizadas: usedDetail._sum.totalHoras ?? 0,
  };

  res.json(project);
});

projectsRouter.post("/", requireFeature("projeto.novo"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
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
    slaRespostaBaixa,
    slaSolucaoBaixa,
    slaRespostaMedia,
    slaSolucaoMedia,
    slaRespostaAlta,
    slaSolucaoAlta,
    slaRespostaCritica,
    slaSolucaoCritica,
    // Anexo
    anexoNomeArquivo,
    anexoUrl,
    anexoTipo,
    anexoTamanho,
    statusInicial,
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
      // status do projeto agora é manual: default = ATIVO (mantém comportamento anterior de permitir apontamento)
      statusInicial: normalizeProjectLifecycleStatus(statusInicial) ?? "ATIVO",
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
      slaRespostaBaixa: tipoProjeto === "AMS" && slaRespostaBaixa != null ? Number(slaRespostaBaixa) : null,
      slaSolucaoBaixa: tipoProjeto === "AMS" && slaSolucaoBaixa != null ? Number(slaSolucaoBaixa) : null,
      slaRespostaMedia: tipoProjeto === "AMS" && slaRespostaMedia != null ? Number(slaRespostaMedia) : null,
      slaSolucaoMedia: tipoProjeto === "AMS" && slaSolucaoMedia != null ? Number(slaSolucaoMedia) : null,
      slaRespostaAlta: tipoProjeto === "AMS" && slaRespostaAlta != null ? Number(slaRespostaAlta) : null,
      slaSolucaoAlta: tipoProjeto === "AMS" && slaSolucaoAlta != null ? Number(slaSolucaoAlta) : null,
      slaRespostaCritica: tipoProjeto === "AMS" && slaRespostaCritica != null ? Number(slaRespostaCritica) : null,
      slaSolucaoCritica: tipoProjeto === "AMS" && slaSolucaoCritica != null ? Number(slaSolucaoCritica) : null,
      // Anexo
      anexoNomeArquivo: anexoNomeArquivo ? String(anexoNomeArquivo).trim() : null,
      anexoUrl: anexoUrl ? String(anexoUrl).trim() : null,
      anexoTipo: anexoTipo ? String(anexoTipo).trim() : null,
      anexoTamanho: anexoTamanho != null ? Number(anexoTamanho) : null,
    },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
    },
  });

  clearProjectsCache();

  await prisma.projectResponsible.createMany({
    data: ids.map((userId: string) => ({ projectId: project.id, userId })),
  });

  const withResponsibles = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  res.status(201).json(withResponsibles);
});

projectsRouter.patch("/:id", requireFeature("projeto.editar"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;

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
    slaRespostaBaixa,
    slaSolucaoBaixa,
    slaRespostaMedia,
    slaSolucaoMedia,
    slaRespostaAlta,
    slaSolucaoAlta,
    slaRespostaCritica,
    slaSolucaoCritica,
    // Anexo
    anexoNomeArquivo,
    anexoUrl,
    anexoTipo,
    anexoTamanho,
    statusInicial,
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
          slaRespostaBaixa: slaRespostaBaixa != null ? Number(slaRespostaBaixa) : null,
          slaSolucaoBaixa: slaSolucaoBaixa != null ? Number(slaSolucaoBaixa) : null,
          slaRespostaMedia: slaRespostaMedia != null ? Number(slaRespostaMedia) : null,
          slaSolucaoMedia: slaSolucaoMedia != null ? Number(slaSolucaoMedia) : null,
          slaRespostaAlta: slaRespostaAlta != null ? Number(slaRespostaAlta) : null,
          slaSolucaoAlta: slaSolucaoAlta != null ? Number(slaSolucaoAlta) : null,
          slaRespostaCritica: slaRespostaCritica != null ? Number(slaRespostaCritica) : null,
          slaSolucaoCritica: slaSolucaoCritica != null ? Number(slaSolucaoCritica) : null,
        }
      : {
          tipoContratoAMS: null,
          horasMensaisAMS: null,
          bancoHorasInicial: null,
          slaAMS: null,
          slaRespostaBaixa: null,
          slaSolucaoBaixa: null,
          slaRespostaMedia: null,
          slaSolucaoMedia: null,
          slaRespostaAlta: null,
          slaSolucaoAlta: null,
          slaRespostaCritica: null,
          slaSolucaoCritica: null,
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
        statusInicial: normalizeProjectLifecycleStatus(statusInicial) ?? existing.statusInicial,
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

  clearProjectsCache();

  const updated = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true, email: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  res.json(updated);
});

projectsRouter.patch("/:id/archive", requireFeature("projeto.arquivar"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;

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
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
      _count: { select: { tickets: true, timeEntries: true } },
      tickets: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          dataFimPrevista: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          createdBy: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } },
          responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true, updatedAt: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  clearProjectsCache();

  res.json(updated);
});

projectsRouter.delete("/:id", requireFeature("projeto.excluir"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  const projectId = req.params.id;
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
  });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  await prisma.project.delete({ where: { id: projectId } });
  clearProjectsCache();
  res.status(204).send();
});
