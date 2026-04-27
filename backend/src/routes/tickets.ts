import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, isConsultantLikeRole } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { filterTicketsForConsultant } from "../lib/ticketVisibility.js";
import { notifyTicketMembers } from "../lib/ticketEmailNotifications.js";
import {
  SLA_STAFF_ROLES,
  getSlaHorasPorPrioridade,
  isFinalizedAmsTicketWithinSla,
  slaHorasAplicavel,
} from "../lib/amsSlaCompliance.js";

export const ticketsRouter = Router();
ticketsRouter.use(authMiddleware);

/** Projeto exige motivo ao encerrar tarefa (alinhado ao frontend). */
function projectRequiresFinalizacaoMotivo(tipoProjeto: string | null | undefined): boolean {
  const t = String(tipoProjeto ?? "").trim();
  return t === "AMS" || t === "TIME_MATERIAL" || t === "FIXED_PRICE" || t === "INTERNO";
}

/** Maior código puramente numérico (chamados/tarefas; ignora tópicos e formatos como T12). */
function maxNumericTaskCode(codes: Iterable<string>): number {
  let max = 0;
  for (const code of codes) {
    const s = String(code).trim();
    if (!/^\d+$/.test(s)) continue;
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

/**
 * Tópicos (SUBPROJETO) usam `code` alfanumérico interno (prefixo tp_), distinto dos números de chamado.
 * Não é sequência exibida ao usuário; só localização no banco / APIs.
 */
async function allocateTopicInternalCode(
  tenantId: string,
  ticket: PrismaClient["ticket"],
): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = `tp_${randomBytes(10).toString("hex")}`;
    const clash = await ticket.findFirst({
      where: {
        code,
        project: { client: { tenantId } },
      },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `tp_${randomBytes(14).toString("hex")}`;
}

/** Campos de usuário para UI (foto de perfil, cache-bust). */
const USER_SELECT_UI = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  updatedAt: true,
} as const;

/** Listagem enxuta: menos colunas e relações (detalhe continua em GET /:id). */
const TICKET_LIST_LIGHT_SELECT = {
  id: true,
  code: true,
  title: true,
  type: true,
  criticidade: true,
  status: true,
  queuePriority: true,
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
  assignedTo: { select: USER_SELECT_UI },
  createdBy: { select: USER_SELECT_UI },
  responsibles: { select: { user: { select: USER_SELECT_UI } } },
  // Necessário para indicador "Aguardando aprovação" na home do cliente (light=true).
  budget: { select: { status: true } },
} as const;

/** Mesmo payload útil ao Kanban, sem join em `project` (redundante quando já filtramos por projectId). */
const TICKET_LIST_LIGHT_IN_PROJECT = {
  id: true,
  code: true,
  title: true,
  type: true,
  criticidade: true,
  status: true,
  queuePriority: true,
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
  assignedTo: { select: USER_SELECT_UI },
  createdBy: { select: USER_SELECT_UI },
  responsibles: { select: { user: { select: USER_SELECT_UI } } },
  budget: { select: { status: true } },
} as const;

const TICKET_LIST_FULL_INCLUDE = {
  project: { include: { client: true } },
  assignedTo: { select: USER_SELECT_UI },
  createdBy: { select: USER_SELECT_UI },
  responsibles: { include: { user: { select: USER_SELECT_UI } } },
  budget: { select: { status: true } },
} as const;

type TicketStatusUiPatch = { statusLabel?: string; statusColor?: string };

function normalizeKanbanColorClass(raw: unknown): string {
  const c = String(raw ?? "").trim();
  if (!c) return "bg-slate-400";
  if (c.startsWith("bg-")) return c;
  // Aceita sintaxe arbitrária do Tailwind (ex.: bg-[color:var(--primary)])
  if (/^bg-\[.+\]$/i.test(c)) return c;
  return "bg-slate-400";
}

async function attachCustomKanbanStatusUi(params: {
  tenantId: string;
  tickets: Array<{ status: string; projectId?: string | null }>;
}): Promise<TicketStatusUiPatch[]> {
  const { tenantId, tickets } = params;
  const keys: Array<{ projectId: string; statusId: string }> = [];
  for (const t of tickets) {
    const pid = String(t.projectId ?? "").trim();
    const st = String(t.status ?? "").trim();
    if (!pid) continue;
    if (!st.startsWith("CUSTOM_")) continue;
    keys.push({ projectId: pid, statusId: st });
  }
  if (keys.length === 0) return tickets.map(() => ({}));

  const projectIds = Array.from(new Set(keys.map((k) => k.projectId)));
  const statusIds = Array.from(new Set(keys.map((k) => k.statusId)));

  const cols = await prisma.kanbanColumn.findMany({
    where: {
      tenantId,
      deletedAt: null,
      projectId: { in: projectIds },
      id: { in: statusIds },
    },
    select: { id: true, projectId: true, label: true, color: true },
  });

  const byKey = new Map<string, { label: string; color: string }>();
  for (const c of cols) {
    byKey.set(`${c.projectId}:${c.id}`, { label: c.label, color: normalizeKanbanColorClass(c.color) });
  }

  return tickets.map((t) => {
    const pid = String(t.projectId ?? "").trim();
    const st = String(t.status ?? "").trim();
    if (!pid || !st.startsWith("CUSTOM_")) return {};
    const hit = byKey.get(`${pid}:${st}`);
    if (!hit) return {};
    return { statusLabel: hit.label, statusColor: hit.color };
  });
}

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

function escapeHtmlBasic(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateForEmail(value: string, max = 120): string {
  const v = String(value ?? "");
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1))}…`;
}

function formatDatePtBrFromIsoMaybe(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // Aceita ISO completo ou date-only (YYYY-MM-DD)
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

function formatValueForEmail(field: string | null, value: string): string {
  const f = String(field ?? "").trim();
  if (f === "dataInicio" || f === "dataFimPrevista") {
    const formatted = formatDatePtBrFromIsoMaybe(value);
    if (formatted) return formatted;
  }
  return value;
}

function formatFieldLabel(field: string | null | undefined): string {
  const f = String(field ?? "").trim();
  if (!f) return "Alteração";
  const map: Record<string, string> = {
    title: "Título",
    description: "Descrição",
    criticidade: "Prioridade",
    assignedToId: "Atribuição",
    responsibles: "Responsáveis",
    parentTicketId: "Tópico",
    dataFimPrevista: "Data de entrega",
    dataInicio: "Data de início",
    estimativaHoras: "Horas estimadas",
    progresso: "Progresso",
    status: "Status",
    type: "Tipo",
  };
  return map[f] ?? f;
}

function renderTicketUpdateEmailHtml(
  entries: Array<{ action: string; field: string | null; oldValue: string | null; newValue: string | null; details?: string }>,
): string {
  const rows = entries
    .map((e) => {
      const label = formatFieldLabel(e.field);
      const details = e.details ? escapeHtmlBasic(truncateForEmail(e.details, 220)) : "";
      const oldV =
        e.oldValue != null && String(e.oldValue).trim() !== ""
          ? escapeHtmlBasic(truncateForEmail(formatValueForEmail(e.field, String(e.oldValue))))
          : "";
      const newV =
        e.newValue != null && String(e.newValue).trim() !== ""
          ? escapeHtmlBasic(truncateForEmail(formatValueForEmail(e.field, String(e.newValue))))
          : "";

      // Preferimos "de → para" quando os dois existem; senão cai para detalhes.
      if (oldV && newV) {
        return `<li><b>${escapeHtmlBasic(label)}:</b> ${oldV} → ${newV}</li>`;
      }
      if (newV) {
        return `<li><b>${escapeHtmlBasic(label)}:</b> ${newV}</li>`;
      }
      if (details) {
        return `<li><b>${escapeHtmlBasic(label)}:</b> ${details}</li>`;
      }
      return `<li><b>${escapeHtmlBasic(label)}:</b> atualizado</li>`;
    })
    .join("");

  return `<p>O chamado foi <b>alterado</b>. Veja o que mudou:</p><ul>${rows}</ul>`;
}

// O status do projeto é controlado manualmente (não sincronizar automaticamente por tarefas/tópicos).

ticketsRouter.get("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const { projectId, assignedTo, status, parentTicketId, createdBy, type: typeQuery } = req.query;
  const light =
    String(req.query.light || "") === "true" || String(req.query.light || "") === "1";
  const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
  const consultantWithProject = isConsultantLikeRole(user.role) && projectId;

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
    ...(isConsultantLikeRole(user.role) && !consultantWithProject && {
      OR: [
        { assignedToId: user.id },
        { createdById: user.id },
        { responsibles: { some: { userId: user.id } } },
      ],
    }),
    // Cliente: vê tickets dos projetos da sua empresa. Além disso, sempre enxerga tickets que ele próprio criou
    // (isso cobre cenários de dado legado onde o vínculo client.users pode estar ausente/atrasado).
    ...(user.role === "CLIENTE" && {
      ...(createdBy === "me"
        ? { createdById: user.id }
        : {
            OR: [
              { createdById: user.id },
              { project: { client: { users: { some: { userId: user.id } } } } },
            ],
          }),
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

  let list = tickets;
  if (consultantWithProject) {
    const projectMember = await prisma.projectResponsible.findFirst({
      where: { projectId: String(projectId), userId: user.id },
      select: { id: true },
    });
    list = projectMember ? tickets : filterTicketsForConsultant(tickets, user.id);
  }
  const ui = await attachCustomKanbanStatusUi({
    tenantId: user.tenantId,
    tickets: list as any,
  });
  res.json((list as any[]).map((t, idx) => ({ ...t, ...ui[idx] })));
});

function parseDateRangeInclusive(input: {
  from?: unknown;
  to?: unknown;
}): { gte?: Date; lte?: Date } | null {
  const fromRaw = String(input.from ?? "").trim();
  const toRaw = String(input.to ?? "").trim();
  const range: { gte?: Date; lte?: Date } = {};
  if (fromRaw) {
    // Aceita YYYY-MM-DD ou ISO. Se for date-only, considera início do dia.
    const d = new Date(fromRaw.length === 10 ? `${fromRaw}T00:00:00.000Z` : fromRaw);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (toRaw) {
    // Aceita YYYY-MM-DD ou ISO. Se for date-only, considera fim do dia.
    const d = new Date(toRaw.length === 10 ? `${toRaw}T23:59:59.999Z` : toRaw);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  if (!range.gte && !range.lte) return null;
  return range;
}

/**
 * GET /api/tickets/tasks-list
 * Lista todas as tarefas (exclui SUBPROJETO e SUBTAREFA) com filtros para a tela "Lista de Tarefas".
 * Filtros:
 * - createdFrom/createdTo (createdAt)
 * - dueFrom/dueTo (dataFimPrevista)
 * - memberId (assignedTo OR responsibles OR createdBy)
 * - status (status exato)
 * - limit/offset (paginação)
 */
ticketsRouter.get("/tasks-list", requireFeature("projeto.listaTarefas"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;

  const tenantFilter = { project: { client: { tenantId: user.tenantId } } };
  const createdRange = parseDateRangeInclusive({ from: req.query.createdFrom, to: req.query.createdTo });
  const dueRange = parseDateRangeInclusive({ from: req.query.dueFrom, to: req.query.dueTo });

  const memberId = String(req.query.memberId ?? "").trim();
  const statusRaw = String(req.query.status ?? "").trim();
  const statusList = statusRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const statusUpperList = statusList.map((s) => s.toUpperCase());

  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;
  let take: number | undefined;
  let skip: number | undefined;
  if (rawLimit !== undefined && String(rawLimit) !== "") {
    const n = parseInt(String(rawLimit), 10);
    if (!Number.isNaN(n) && n > 0) {
      take = Math.min(500, n);
      const off = parseInt(String(rawOffset ?? "0"), 10);
      skip = Number.isNaN(off) || off < 0 ? 0 : off;
    }
  }

  const where: any = {
    ...tenantFilter,
    type: { notIn: ["SUBPROJETO", "SUBTAREFA"] },
    ...(createdRange ? { createdAt: createdRange } : {}),
    ...(dueRange ? { dataFimPrevista: dueRange } : {}),
    ...(memberId
      ? {
          OR: [
            { assignedToId: memberId },
            { createdById: memberId },
            { responsibles: { some: { userId: memberId } } },
          ],
        }
      : {}),
  };

  // Status pode ser:
  // - enum legado (ABERTO/EXECUCAO/ENCERRADO/...)
  // - id de coluna customizada do Kanban (CUSTOM_...)
  // - grupos da UI da Lista de Tarefas (__OPEN__/__EXEC__/__DONE__/__OVERDUE__)
  if (statusUpperList.length > 0) {
    const clauses: any[] = [];

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const startOfTodayUtc = new Date(`${todayStr}T00:00:00.000Z`);

    for (let i = 0; i < statusUpperList.length; i += 1) {
      const up = statusUpperList[i];
      const original = statusList[i] ?? "";
      if (!up) continue;

      if (up === "__OPEN__") {
        clauses.push({ status: { in: ["ABERTO", "EM_ANALISE", "APROVADO"] } });
      } else if (up === "BACKLOG") {
        // Compat: algumas tarefas salvam o status legado, outras salvam o id da coluna
        clauses.push({ status: { in: ["ABERTO", "EM_ANALISE", "APROVADO", "BACKLOG"] } });
      } else if (up === "__EXEC__") {
        clauses.push({ status: { in: ["EXECUCAO", "TESTE"] } });
      } else if (up === "EM_EXECUCAO") {
        clauses.push({ status: { in: ["EXECUCAO", "TESTE", "EM_EXECUCAO"] } });
      } else if (up === "__DONE__") {
        clauses.push({ status: "ENCERRADO" });
      } else if (up === "FINALIZADAS") {
        clauses.push({ status: { in: ["ENCERRADO", "FINALIZADAS"] } });
      } else if (up === "__OVERDUE__") {
        // Atrasado: tem dataFimPrevista no passado e não está encerrado.
        clauses.push({
          status: { notIn: ["ENCERRADO"] },
          dataFimPrevista: { lt: startOfTodayUtc },
        });
      } else {
        clauses.push({ status: original });
      }
    }

    if (clauses.length > 0) {
      where.AND = [...(where.AND ?? []), { OR: clauses }];
    }
  }

  // Consultor: mantém a mesma regra de visibilidade (membro direto ou via tópico),
  // mas como aqui buscamos "todas as tarefas", filtramos em memória com a mesma função usada em GET /.
  const isConsultant = isConsultantLikeRole(user.role);

  const orderBy = [{ createdAt: "desc" as const }];
  const pagination = take !== undefined ? { take, ...(skip !== undefined && skip > 0 ? { skip } : {}) } : {};

  const rows = await prisma.ticket.findMany({
    where,
    select: {
      ...TICKET_LIST_LIGHT_SELECT,
      // garantimos os campos usados na tela
      dataFimPrevista: true,
      createdAt: true,
    } as any,
    orderBy,
    ...pagination,
  });

  const list = isConsultant ? filterTicketsForConsultant(rows as any, user.id) : rows;
  const ui = await attachCustomKanbanStatusUi({
    tenantId: user.tenantId,
    tickets: list as any,
  });

  const enriched = (list as any[]).map((t, idx) => ({ ...t, ...ui[idx] }));

  // Ordenação da fila de prioridade por membro (assignedToId) e sem "Finalizadas" interferindo.
  // Regra: 1 = mais prioritária (topo). Itens sem prioridade ficam depois dos numerados.
  const sorted = enriched;
  // Sempre empurra finalizadas pro fim
  const openItems = sorted.filter((t) => {
    const s = String(t.status ?? "").toUpperCase();
    return s !== "ENCERRADO" && s !== "FINALIZADAS";
  });
  const closedItems = sorted.filter((t) => {
    const s = String(t.status ?? "").toUpperCase();
    return s === "ENCERRADO" || s === "FINALIZADAS";
  });
  openItems.sort((a, b) => {
    const pa = typeof a.queuePriority === "number" ? a.queuePriority : null;
    const pb = typeof b.queuePriority === "number" ? b.queuePriority : null;
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    // fallback: mais novo primeiro (mantém comportamento antigo)
    const ca = String(a.createdAt ?? "");
    const cb = String(b.createdAt ?? "");
    return cb.localeCompare(ca);
  });
  closedItems.sort((a, b) => {
    const ua = String(a.updatedAt ?? a.createdAt ?? "");
    const ub = String(b.updatedAt ?? b.createdAt ?? "");
    return ub.localeCompare(ua);
  });
  res.json([...openItems, ...closedItems]);
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
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
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

  // Projeto ENCERRADO: bloqueia criação de tópicos e tarefas, obrigando reabrir/alterar status.
  const stRaw = String((project as any).statusInicial ?? "").toUpperCase();
  const st =
    stRaw === "ATIVO" || stRaw === "ENCERRADO" || stRaw === "EM_ESPERA"
      ? stRaw
      : stRaw === "EM_ANDAMENTO"
        ? "ATIVO"
        : stRaw === "PLANEJADO"
          ? "EM_ESPERA"
          : stRaw === "CONCLUIDO"
            ? "ENCERRADO"
            : stRaw;
  if (st === "ENCERRADO") {
    res
      .status(400)
      .json({ error: "Não é possível criar pois o projeto se encontra encerrado" });
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

  const isClienteCreator = String(user.role).toUpperCase() === "CLIENTE";
  const responsiblesToCreate = Array.from(
    new Set<string>([...ids, ...(isClienteCreator ? [user.id] : [])].filter(Boolean)),
  );

  const implicitTopic = req.body?.implicitTopic === true;
  const tenantTicketScope = { project: { client: { tenantId: user.tenantId } } };

  /** Um POST: cria SUBPROJETO + chamado e dispara um único e-mail (evita corrida com dois POSTs no cliente). */
  if (implicitTopic) {
    if (parentTicketId) {
      res.status(400).json({ error: "Não combine parentTicketId com implicitTopic." });
      return;
    }
    if (isSubprojetoTopic) {
      res.status(400).json({ error: "implicitTopic não se aplica a tópicos (SUBPROJETO)." });
      return;
    }

    const mainTicketId = await prisma.$transaction(async (tx) => {
      const topicCode = await allocateTopicInternalCode(user.tenantId, tx.ticket);
      const topic = await tx.ticket.create({
        data: {
          code: topicCode,
          title: String(title).trim(),
          description: null,
          type: "SUBPROJETO",
          criticidade: null,
          status: "ABERTO",
          projectId,
          parentTicketId: null,
          createdById: user.id,
          assignedToId: null,
          estimativaHoras: null,
          dataFimPrevista: null,
          dataInicio: null,
          slaRespostaHoras: null,
          slaSolucaoHoras: null,
        },
      });
      await tx.ticketHistory.create({
        data: {
          ticketId: topic.id,
          userId: user.id,
          action: "CREATE",
          field: null,
          oldValue: null,
          newValue: null,
          details: `Tópico criado: "${topic.title}"`,
        },
      });

      const taskRows = await tx.ticket.findMany({
        where: { ...tenantTicketScope, type: { not: "SUBPROJETO" } },
        select: { code: true },
      });
      const mainCode = String(maxNumericTaskCode(taskRows.map((r) => r.code)) + 1);

      const ticket = await tx.ticket.create({
        data: {
          code: mainCode,
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          type: effectiveType,
          criticidade: criticidade || null,
          status: status || "ABERTO",
          projectId,
          parentTicketId: topic.id,
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
      });

      await tx.ticketHistory.create({
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

      if (responsiblesToCreate.length > 0) {
        await tx.ticketResponsible.createMany({
          data: responsiblesToCreate.map((userId: string) => ({ ticketId: ticket.id, userId })),
          skipDuplicates: true,
        });
        const usersInTenant = await tx.user.findMany({
          where: { id: { in: responsiblesToCreate }, tenantId: user.tenantId },
          select: { name: true },
        });
        const names = usersInTenant.map((u) => u.name).join(", ");
        await tx.ticketHistory.create({
          data: {
            ticketId: ticket.id,
            userId: user.id,
            action: "RESPONSIBLES_CHANGE",
            field: "responsibles",
            oldValue: null,
            newValue: names || null,
            details: `Responsáveis definidos: ${names || "-"}`,
          },
        });
      }

      return ticket.id;
    });

    const ticketFull = await prisma.ticket.findUnique({
      where: { id: mainTicketId },
      include: {
        project: { include: { client: true } },
        assignedTo: { select: USER_SELECT_UI },
        createdBy: { select: USER_SELECT_UI },
        responsibles: { include: { user: { select: USER_SELECT_UI } } },
      },
    });

    notifyTicketMembers({
      tenantId: user.tenantId,
      ticketId: mainTicketId,
      subject: `Chamado ${ticketFull?.code ?? ""} foi criado`,
      title: `Chamado ${ticketFull?.code ?? ""} foi criado`,
      messageHtml: `<p>O chamado foi criado e já está em <b>Backlog</b>.</p>`,
      trigger: "CRIACAO",
      openingByClient: isClienteCreator,
      includeProjectResponsibles: !isClienteCreator,
    }).catch(() => {});

    res.json(ticketFull ?? { id: mainTicketId });
    return;
  }

  let nextCode: string;
  if (isSubprojetoTopic) {
    nextCode = await allocateTopicInternalCode(user.tenantId, prisma.ticket);
  } else {
    const taskRows = await prisma.ticket.findMany({
      where: { ...tenantTicketScope, type: { not: "SUBPROJETO" } },
      select: { code: true },
    });
    nextCode = String(maxNumericTaskCode(taskRows.map((r) => r.code)) + 1);
  }
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
      assignedTo: { select: USER_SELECT_UI },
      createdBy: { select: USER_SELECT_UI },
      responsibles: { include: { user: { select: USER_SELECT_UI } } },
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
      details:
        effectiveType === "SUBPROJETO"
          ? `Tópico criado: "${ticket.title}"`
          : `Tarefa criada: "${ticket.title}"`,
    },
  });

  if (responsiblesToCreate.length > 0) {
    await prisma.ticketResponsible.createMany({
      data: responsiblesToCreate.map((userId: string) => ({ ticketId: ticket.id, userId })),
      skipDuplicates: true,
    });

    const usersInTenant = await prisma.user.findMany({
      where: { id: { in: responsiblesToCreate }, tenantId: user.tenantId },
      select: { name: true },
    });
    const names = usersInTenant.map((u) => u.name).join(", ");

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "RESPONSIBLES_CHANGE",
        field: "responsibles",
        oldValue: null,
        newValue: names || null,
        details: `Responsáveis definidos: ${names || "-"}`,
      },
    });
  }

  const ticketFull = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: {
      project: { include: { client: true } },
      assignedTo: { select: USER_SELECT_UI },
      createdBy: { select: USER_SELECT_UI },
      responsibles: { include: { user: { select: USER_SELECT_UI } } },
    },
  });

  // Tópicos (SUBPROJETO) não são chamados: não enviar e-mail de "chamado criado".
  if (effectiveType !== "SUBPROJETO") {
    notifyTicketMembers({
      tenantId: user.tenantId,
      ticketId: ticket.id,
      subject: `Chamado ${ticket.code} foi criado`,
      title: `Chamado ${ticket.code} foi criado`,
      messageHtml: `<p>O chamado foi criado e já está em <b>Backlog</b>.</p>`,
      trigger: "CRIACAO",
      openingByClient: isClienteCreator,
      includeProjectResponsibles: !isClienteCreator,
    }).catch(() => {});
  }

  res.json(ticketFull ?? ticket);
});

ticketsRouter.post("/:id/budget", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const { horas, observacao } = req.body as {
    horas?: number | string;
    observacao?: string;
  };

  const role = String(user.role ?? "").toUpperCase();
  const canSendBudget =
    role === "CONSULTOR" || role === "ADMIN_PORTAL" || role === "GESTOR_PROJETOS" || role === "SUPER_ADMIN";
  if (!canSendBudget) {
    res.status(403).json({ error: "Sem permissão para enviar orçamento." });
    return;
  }

  const h = Number(horas);
  const obs = String(observacao ?? "").trim();
  if (!Number.isFinite(h) || h <= 0 || !obs) {
    res.status(400).json({ error: "Preencha Horas e Observação para enviar o orçamento." });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true, code: true, status: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  if (String(ticket.status).toUpperCase() === "ENCERRADO") {
    res.status(400).json({ error: "Chamado finalizado não pode receber orçamento." });
    return;
  }

  const budget = await prisma.ticketBudget.upsert({
    where: { ticketId },
    create: {
      ticketId,
      status: "AGUARDANDO_APROVACAO",
      horas: h,
      observacao: obs,
      sentById: user.id,
      sentAt: new Date(),
    },
    update: {
      status: "AGUARDANDO_APROVACAO",
      horas: h,
      observacao: obs,
      rejectionReason: null,
      sentById: user.id,
      sentAt: new Date(),
      decidedById: null,
      decidedAt: null,
    },
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId,
      userId: user.id,
      action: "BUDGET_SENT",
      field: "budget",
      oldValue: null,
      newValue: JSON.stringify({ horas: h }),
      details: "Orçamento enviado para aprovação do cliente.",
    },
  });

  // Ação na aba Orçamento deve aparecer como comentário público na tarefa.
  await prisma.ticketComment.create({
    data: {
      ticketId,
      userId: user.id,
      visibility: "PUBLIC",
      content: `<p><b>Orçamento enviado</b> e está <b>aguardando aprovação</b>.</p><p><b>Horas:</b> ${escapeHtmlBasic(
        String(h),
      )}<br/><b>Observação:</b> ${escapeHtmlBasic(obs)}</p>`,
    },
  });

  notifyTicketMembers({
    tenantId: user.tenantId,
    ticketId,
    subject: `Chamado ${ticket.code} - Orçamento enviado`,
    title: "Orçamento enviado",
    messageHtml: `<p>Um orçamento foi enviado e está <b>aguardando aprovação</b>.</p>
      <p><b>Horas:</b> ${h}<br/><b>Observação:</b> ${obs}</p>`,
    trigger: "ORCAMENTO",
    includeClientUsers: true,
    includeProjectResponsibles: true,
  }).catch(() => {});

  const budgetFull = await prisma.ticketBudget.findUnique({
    where: { ticketId },
    include: {
      sentBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  });
  res.json({ ok: true, budget: budgetFull ?? budget });
});

ticketsRouter.get("/:id/budget", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
      select: {
        id: true,
        assignedToId: true,
        createdById: true,
        parentTicketId: true,
        project: { select: { createdById: true, client: { select: { users: { select: { userId: true } } } } } },
      },
    });
    if (!ticket) {
      res.status(404).json({ error: "Chamado não encontrado" });
      return;
    }

    const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
    if (!canSeeAll && isConsultantLikeRole(user.role)) {
      const uid = user.id;
      const isMember =
        ticket.assignedToId === uid ||
        ticket.createdById === uid ||
        (ticket.parentTicketId
          ? await prisma.ticketResponsible.findFirst({ where: { ticketId: ticket.parentTicketId, userId: uid } }).then(Boolean)
          : false) ||
        (await prisma.ticketResponsible.findFirst({ where: { ticketId, userId: uid } }).then(Boolean));
      if (!isMember) {
        res.status(403).json({ error: "Sem permissão para visualizar este item" });
        return;
      }
    }
    if (!canSeeAll && user.role === "CLIENTE") {
      const hasAccess =
        (ticket.project?.client?.users ?? []).some((u) => u.userId === user.id) ||
        ticket.createdById === user.id;
      if (!hasAccess) {
        res.status(403).json({ error: "Sem permissão para visualizar este item" });
        return;
      }
    }

    const budget = await prisma.ticketBudget.findUnique({
      where: { ticketId },
      include: {
        sentBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
    });
    res.json({ budget: budget ?? null });
  } catch (err) {
    // Se a tabela ainda não existir no banco, não derruba a tela.
    console.error("[BUDGET] get budget error", err);
    res.json({ budget: null });
  }
});

ticketsRouter.post("/:id/budget/approve", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  if (user.role !== "CLIENTE") {
    res.status(403).json({ error: "Apenas cliente pode aprovar orçamento." });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true, code: true, status: true, project: { select: { client: { select: { users: { select: { userId: true } } } } } } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  const hasAccess = (ticket.project?.client?.users ?? []).some((u) => u.userId === user.id);
  if (!hasAccess) {
    res.status(403).json({ error: "Sem permissão para aprovar este chamado" });
    return;
  }

  const budget = await prisma.ticketBudget.findUnique({ where: { ticketId } });
  if (!budget || budget.status !== "AGUARDANDO_APROVACAO") {
    res.status(400).json({ error: "Não há orçamento aguardando aprovação." });
    return;
  }

  const [updatedBudget] = await prisma.$transaction([
    prisma.ticketBudget.update({
      where: { ticketId },
      data: { status: "APROVADO", decidedById: user.id, decidedAt: new Date() },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "EXECUCAO" },
    }),
    prisma.ticketComment.create({
      data: {
        ticketId,
        userId: user.id,
        visibility: "PUBLIC",
        content:
          "<p><b>Orçamento aprovado</b> pelo cliente. O chamado foi movido para <b>Em execução</b>.</p>",
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "BUDGET_APPROVED",
        field: "budget",
        oldValue: "AGUARDANDO_APROVACAO",
        newValue: "APROVADO",
        details: "Orçamento aprovado pelo cliente. Chamado movido para Em execução.",
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "STATUS_CHANGE",
        field: "status",
        oldValue: String(ticket.status ?? ""),
        newValue: "EXECUCAO",
        details: `Status alterado automaticamente para "EXECUCAO" após aprovação do orçamento.`,
      },
    }),
  ]);

  notifyTicketMembers({
    tenantId: user.tenantId,
    ticketId,
    subject: `Chamado ${ticket.code} - Orçamento aprovado`,
    title: "Orçamento aprovado",
    messageHtml: `<p>O orçamento foi <b>aprovado</b>. O chamado foi movido para <b>Em execução</b>.</p>`,
    trigger: "RESPOSTA_ORCAMENTO",
    includeClientUsers: true,
    includeProjectResponsibles: true,
  }).catch(() => {});

  const budgetFull = await prisma.ticketBudget.findUnique({
    where: { ticketId },
    include: {
      sentBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  });
  res.json({ ok: true, budget: budgetFull ?? updatedBudget });
});

ticketsRouter.post("/:id/budget/reject", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const { motivo } = req.body as { motivo?: string };
  if (user.role !== "CLIENTE") {
    res.status(403).json({ error: "Apenas cliente pode reprovar orçamento." });
    return;
  }
  const reason = String(motivo ?? "").trim();
  if (!reason) {
    res.status(400).json({ error: "Informe o motivo da reprovação." });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true, code: true, status: true, project: { select: { client: { select: { users: { select: { userId: true } } } } } } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Chamado não encontrado" });
    return;
  }
  const hasAccess = (ticket.project?.client?.users ?? []).some((u) => u.userId === user.id);
  if (!hasAccess) {
    res.status(403).json({ error: "Sem permissão para reprovar este chamado" });
    return;
  }

  const budget = await prisma.ticketBudget.findUnique({ where: { ticketId } });
  if (!budget || budget.status !== "AGUARDANDO_APROVACAO") {
    res.status(400).json({ error: "Não há orçamento aguardando aprovação." });
    return;
  }

  const [updatedBudget] = await prisma.$transaction([
    prisma.ticketBudget.update({
      where: { ticketId },
      data: {
        status: "REPROVADO",
        rejectionReason: reason,
        decidedById: user.id,
        decidedAt: new Date(),
      },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "ENCERRADO",
        finalizacaoMotivo: "Orçamento reprovado",
        finalizacaoObservacao: reason,
      },
    }),
    prisma.ticketComment.create({
      data: {
        ticketId,
        userId: user.id,
        visibility: "PUBLIC",
        content: `<p><b>Orçamento reprovado</b> pelo cliente. O chamado foi <b>finalizado automaticamente</b>.</p><p><b>Motivo:</b> ${escapeHtmlBasic(
          reason,
        )}</p>`,
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "BUDGET_REJECTED",
        field: "budget",
        oldValue: "AGUARDANDO_APROVACAO",
        newValue: "REPROVADO",
        details: `Orçamento reprovado. Motivo: ${reason}`,
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "STATUS_CHANGE",
        field: "status",
        oldValue: String(ticket.status ?? ""),
        newValue: "ENCERRADO",
        details: `Status alterado automaticamente para "ENCERRADO" após reprovação do orçamento.`,
      },
    }),
  ]);

  notifyTicketMembers({
    tenantId: user.tenantId,
    ticketId,
    subject: `Chamado ${ticket.code} - Orçamento reprovado`,
    title: "Orçamento reprovado",
    messageHtml: `<p>O orçamento foi <b>reprovado</b> e o chamado foi <b>finalizado automaticamente</b>.</p>
      <p><b>Motivo:</b> ${reason}</p>`,
    trigger: "RESPOSTA_ORCAMENTO",
    includeClientUsers: true,
    includeProjectResponsibles: true,
  }).catch(() => {});

  const budgetFull = await prisma.ticketBudget.findUnique({
    where: { ticketId },
    include: {
      sentBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
  });
  res.json({ ok: true, budget: budgetFull ?? updatedBudget });
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
      assignedTo: { select: USER_SELECT_UI },
      createdBy: { select: USER_SELECT_UI },
      responsibles: { include: { user: { select: USER_SELECT_UI } } },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Tópico/tarefa não encontrado" });
    return;
  }
  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  if (!canSeeAll && isConsultantLikeRole(user.role)) {
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
    const hasAccess = clientUsers.some((u) => u.userId === user.id) || ticket.createdById === user.id;
    if (!hasAccess) {
      res.status(403).json({ error: "Sem permissão para visualizar este item" });
      return;
    }
  }
  const ui = await attachCustomKanbanStatusUi({
    tenantId: user.tenantId,
    tickets: [{ status: String(ticket.status ?? ""), projectId: (ticket as any).projectId ?? null }],
  });
  res.json({ ...ticket, ...(ui[0] ?? {}) });
});

ticketsRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const ticketId = req.params.id;
  const {
    status,
    statusLabel,
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
    const statusLabelSafe =
      typeof statusLabel === "string" && statusLabel.trim()
        ? statusLabel.trim().slice(0, 60)
        : null;
    const statusEmailDisplay =
      statusLabelSafe && String(status).startsWith("CUSTOM_")
        ? statusLabelSafe
        : String(status);
    const willClose = String(status) === "ENCERRADO" && ticket.status !== "ENCERRADO";
    const requiresCloseReason = willClose && projectRequiresFinalizacaoMotivo(ticket.project.tipoProjeto);
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
        details: `Status alterado de "${ticket.status}" para "${statusEmailDisplay}"`,
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
      assignedTo: { select: USER_SELECT_UI },
      createdBy: { select: USER_SELECT_UI },
      responsibles: { include: { user: { select: USER_SELECT_UI } } },
    },
  });

  const becameEncerrado =
    String(updated.status) === "ENCERRADO" && String(ticket.status ?? "") !== "ENCERRADO";
  if (becameEncerrado) {
    // Remove da fila (não renumera outras tarefas automaticamente)
    if ((updated as any).queuePriority != null) {
      await prisma.ticket.update({ where: { id: updated.id }, data: { queuePriority: null } });
      (updated as any).queuePriority = null;
    }

    const esc = (t: string) =>
      t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const motivo = updated.finalizacaoMotivo ? esc(String(updated.finalizacaoMotivo)) : "";
    const obs = updated.finalizacaoObservacao ? esc(String(updated.finalizacaoObservacao)) : "";
    let body = "<p>O chamado foi <b>finalizado</b>.</p>";
    if (motivo) body += `<p><b>Motivo:</b> ${motivo}</p>`;
    if (obs) body += `<p><b>Observação:</b> ${obs}</p>`;
    notifyTicketMembers({
      tenantId: user.tenantId,
      ticketId,
      subject: `Chamado ${updated.code} foi finalizado`,
      title: `Chamado ${updated.code} foi finalizado`,
      messageHtml: body,
      trigger: "STATUS_CHANGE",
      includeProjectResponsibles: true,
    }).catch(() => {});
  }

  if (updateData.status !== undefined && !becameEncerrado) {
    const statusLabelSafe =
      typeof statusLabel === "string" && statusLabel.trim()
        ? statusLabel.trim().slice(0, 60)
        : null;
    const display =
      statusLabelSafe && String(updated.status).startsWith("CUSTOM_")
        ? statusLabelSafe
        : String(updated.status);
    notifyTicketMembers({
      tenantId: user.tenantId,
      ticketId,
      subject: `Chamado ${updated.code} — status atualizado`,
      title: `Chamado ${updated.code} — status atualizado`,
      messageHtml: `<p>O status do chamado foi alterado para <b>${escapeHtmlBasic(display)}</b>.</p>`,
      trigger: "STATUS_CHANGE",
      includeProjectResponsibles: true,
    }).catch(() => {});
  }

  const nonStatusHistory = historyEntries.filter((e) => e.action !== "STATUS_CHANGE");
  if (nonStatusHistory.length > 0) {
    notifyTicketMembers({
      tenantId: user.tenantId,
      ticketId,
      subject: `Chamado ${updated.code} foi atualizado`,
      title: `Chamado ${updated.code} foi atualizado`,
      messageHtml: renderTicketUpdateEmailHtml(nonStatusHistory),
      trigger: "MODIFICACAO",
      includeProjectResponsibles: true,
    }).catch(() => {});
  }

  const ui = await attachCustomKanbanStatusUi({
    tenantId: user.tenantId,
    tickets: [{ status: String(updated.status ?? ""), projectId: (updated as any).projectId ?? null }],
  });
  res.json({ ...updated, ...(ui[0] ?? {}) });
});

ticketsRouter.patch("/:id/queue-priority", requireFeature("projeto.listaTarefas"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const role = String(user.role ?? "").toUpperCase();
  const canEditQueue = role === "GESTOR_PROJETOS" || role === "SUPER_ADMIN";
  if (!canEditQueue) {
    res.status(403).json({ error: "Sem permissão para ordenar fila." });
    return;
  }
  const ticketId = String(req.params.id ?? "").trim();
  const raw = (req.body as any)?.queuePriority;
  const desired =
    raw === null || raw === undefined || String(raw).trim() === ""
      ? null
      : Number.parseInt(String(raw), 10);
  if (desired != null && (!Number.isFinite(desired) || desired <= 0)) {
    res.status(400).json({ error: "Prioridade inválida (use 1, 2, 3...)." });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true, status: true, assignedToId: true, queuePriority: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Tarefa não encontrada." });
    return;
  }
  if (["ENCERRADO", "FINALIZADAS"].includes(String(ticket.status ?? "").toUpperCase())) {
    res.status(400).json({ error: "Tarefa finalizada não entra na fila." });
    return;
  }
  const ownerId = String(ticket.assignedToId ?? "").trim();
  if (!ownerId) {
    res.status(400).json({ error: "A tarefa precisa estar atribuída para entrar na fila." });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (desired == null) {
      await tx.ticket.update({ where: { id: ticket.id }, data: { queuePriority: null } });
      return tx.ticket.findUnique({ where: { id: ticket.id }, select: { id: true, queuePriority: true } });
    }

    // Para evitar duplicidade no mesmo consultor: empurra para baixo quem já está >= desired
    await tx.ticket.updateMany({
      where: {
        project: { client: { tenantId: user.tenantId } },
        assignedToId: ownerId,
        status: { notIn: ["ENCERRADO", "FINALIZADAS"] as any },
        id: { not: ticket.id },
        queuePriority: { gte: desired },
      },
      data: { queuePriority: { increment: 1 } as any },
    });

    await tx.ticket.update({ where: { id: ticket.id }, data: { queuePriority: desired } });
    return tx.ticket.findUnique({ where: { id: ticket.id }, select: { id: true, queuePriority: true } });
  });

  res.json({ ok: true, ticket: updated });
});

ticketsRouter.patch("/tasks-list/queue-priorities", requireFeature("projeto.listaTarefas"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const role = String(user.role ?? "").toUpperCase();
  const canEditQueue = role === "GESTOR_PROJETOS" || role === "SUPER_ADMIN";
  if (!canEditQueue) {
    res.status(403).json({ error: "Sem permissão para ordenar fila." });
    return;
  }

  const raw = (req.body as any)?.changes;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: "changes deve ser um array" });
    return;
  }

  const changes = raw
    .map((c: any) => ({
      ticketId: String(c?.ticketId ?? "").trim(),
      queuePriority:
        c?.queuePriority === null || c?.queuePriority === undefined || String(c?.queuePriority).trim() === ""
          ? null
          : Number.parseInt(String(c.queuePriority), 10),
    }))
    .filter((c) => c.ticketId);

  if (changes.length === 0) {
    res.json({ ok: true, updated: [] as Array<{ id: string; queuePriority: number | null }> });
    return;
  }

  // Carrega tickets e validações básicas
  const ids = Array.from(new Set(changes.map((c) => c.ticketId)));
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ids }, project: { client: { tenantId: user.tenantId } } },
    select: { id: true, assignedToId: true, status: true, queuePriority: true, createdAt: true },
  });
  const byId = new Map(tickets.map((t) => [t.id, t] as const));

  // Agrupa por consultor atribuído (fila é por assignedToId)
  const changesByOwner = new Map<string, Array<{ id: string; desired: number | null }>>();
  for (const c of changes) {
    const t = byId.get(c.ticketId);
    if (!t) continue;
    const st = String(t.status ?? "").toUpperCase();
    if (st === "ENCERRADO" || st === "FINALIZADAS") continue;
    const ownerId = String(t.assignedToId ?? "").trim();
    if (!ownerId) continue;
    const desired =
      c.queuePriority == null || Number.isNaN(c.queuePriority as any) ? null : Math.max(1, c.queuePriority);
    if (!changesByOwner.has(ownerId)) changesByOwner.set(ownerId, []);
    changesByOwner.get(ownerId)!.push({ id: t.id, desired });
  }

  const updatedAll: Array<{ id: string; queuePriority: number | null }> = [];

  for (const [ownerId, ownerChanges] of changesByOwner.entries()) {
    const updated = await prisma.$transaction(async (tx) => {
      // 1) limpar prioridades explicitamente (não renumera outros)
      const toClear = ownerChanges.filter((c) => c.desired == null).map((c) => c.id);
      if (toClear.length > 0) {
        await tx.ticket.updateMany({ where: { id: { in: toClear } }, data: { queuePriority: null } });
      }

      // 2) aplicar prioridades numéricas em ordem crescente (evita "pular" por efeito cascata)
      const toSet = ownerChanges
        .filter((c) => c.desired != null)
        .map((c) => ({ id: c.id, desired: c.desired as number }))
        .sort((a, b) => a.desired - b.desired);

      for (const it of toSet) {
        await tx.ticket.updateMany({
          where: {
            project: { client: { tenantId: user.tenantId } },
            assignedToId: ownerId,
            status: { notIn: ["ENCERRADO", "FINALIZADAS"] as any },
            id: { not: it.id },
            queuePriority: { gte: it.desired },
          },
          data: { queuePriority: { increment: 1 } as any },
        });
        await tx.ticket.update({ where: { id: it.id }, data: { queuePriority: it.desired } });
      }

      // Retorna estado atualizado para todos do consultor (inclui os "empurrados")
      return tx.ticket.findMany({
        where: {
          project: { client: { tenantId: user.tenantId } },
          assignedToId: ownerId,
          status: { notIn: ["ENCERRADO", "FINALIZADAS"] as any },
        },
        select: { id: true, queuePriority: true },
      });
    });

    updatedAll.push(...updated);
  }

  res.json({ ok: true, updated: updatedAll });
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
