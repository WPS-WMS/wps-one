import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

export const TICKET_LINK_FINISH_START = "FINISH_START";
export const TICKET_LINK_RELATES_TO = "RELATES_TO";

export type TicketLinkType = typeof TICKET_LINK_FINISH_START | typeof TICKET_LINK_RELATES_TO;

const CLOSED_STATUSES = new Set(["ENCERRADO", "FINALIZADAS"]);
/** Statuses em que a sucessora ainda não “começou” o trabalho. */
const NOT_STARTED_STATUSES = new Set(["ABERTO", "EM_ANALISE", "APROVADO", "BACKLOG"]);

const TICKET_SUMMARY_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  type: true,
  arquivado: true,
  projectId: true,
} as const;

export type TicketLinkSummary = {
  id: string;
  code: string;
  title: string;
  status: string;
  type: string;
  arquivado: boolean;
  projectId: string;
};

export function isTicketLinkType(raw: unknown): raw is TicketLinkType {
  const t = String(raw ?? "").trim().toUpperCase();
  return t === TICKET_LINK_FINISH_START || t === TICKET_LINK_RELATES_TO;
}

export function normalizeTicketLinkType(raw: unknown): TicketLinkType | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === TICKET_LINK_FINISH_START) return TICKET_LINK_FINISH_START;
  if (t === TICKET_LINK_RELATES_TO) return TICKET_LINK_RELATES_TO;
  return null;
}

export function isTicketClosedStatus(status: unknown): boolean {
  return CLOSED_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

export function isTicketNotStartedStatus(status: unknown): boolean {
  return NOT_STARTED_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

/**
 * Status que exige predecessora concluída (sair do backlog / começar execução).
 * Encerrar/finalizar continua permitido (cancelamento sem iniciar).
 */
export function statusRequiresFinishedPredecessors(newStatus: unknown): boolean {
  const s = String(newStatus ?? "").trim().toUpperCase();
  if (!s) return false;
  if (isTicketClosedStatus(s)) return false;
  if (isTicketNotStartedStatus(s)) return false;
  return true;
}

export async function wouldCreateFinishStartCycle(
  tenantId: string,
  predecessorId: string,
  successorId: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  if (predecessorId === successorId) return true;
  // Ciclo se, a partir da sucessora, já se alcança a predecessora via FINISH_START.
  const visited = new Set<string>();
  const queue = [successorId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const outs = await db.ticketLink.findMany({
      where: {
        tenantId,
        type: TICKET_LINK_FINISH_START,
        fromTicketId: current,
      },
      select: { toTicketId: true },
    });
    for (const edge of outs) {
      if (edge.toTicketId === predecessorId) return true;
      if (!visited.has(edge.toTicketId)) queue.push(edge.toTicketId);
    }
  }
  return false;
}

export async function getUnfinishedFinishStartPredecessors(
  tenantId: string,
  successorTicketId: string,
  db: PrismaClient = prisma,
): Promise<TicketLinkSummary[]> {
  const links = await db.ticketLink.findMany({
    where: {
      tenantId,
      type: TICKET_LINK_FINISH_START,
      toTicketId: successorTicketId,
    },
    include: {
      fromTicket: { select: TICKET_SUMMARY_SELECT },
    },
  });
  return links
    .map((l) => l.fromTicket)
    .filter((t) => !isTicketClosedStatus(t.status));
}

export async function assertCanAdvanceStatusWithPredecessors(
  tenantId: string,
  ticketId: string,
  newStatus: unknown,
  db: PrismaClient = prisma,
): Promise<{ ok: true } | { ok: false; error: string; blockers: TicketLinkSummary[] }> {
  if (!statusRequiresFinishedPredecessors(newStatus)) {
    return { ok: true };
  }
  const blockers = await getUnfinishedFinishStartPredecessors(tenantId, ticketId, db);
  if (blockers.length === 0) return { ok: true };
  const labels = blockers
    .map((t) => `${t.code || t.id.slice(0, 8)} — ${t.title}`)
    .slice(0, 3)
    .join("; ");
  const more = blockers.length > 3 ? ` (+${blockers.length - 3})` : "";
  return {
    ok: false,
    error: `Esta tarefa depende de outra até ela ser concluída: ${labels}${more}.`,
    blockers,
  };
}

export type TicketLinksPayload = {
  predecessors: Array<{
    linkId: string;
    type: typeof TICKET_LINK_FINISH_START;
    ticket: TicketLinkSummary;
  }>;
  blocks: Array<{
    linkId: string;
    type: typeof TICKET_LINK_FINISH_START;
    ticket: TicketLinkSummary;
  }>;
  relatesTo: Array<{
    linkId: string;
    type: typeof TICKET_LINK_RELATES_TO;
    ticket: TicketLinkSummary;
  }>;
  blocked: boolean;
  unfinishedPredecessors: TicketLinkSummary[];
};

export async function loadTicketLinksPayload(
  tenantId: string,
  ticketId: string,
  db: PrismaClient = prisma,
): Promise<TicketLinksPayload> {
  const links = await db.ticketLink.findMany({
    where: {
      tenantId,
      OR: [{ fromTicketId: ticketId }, { toTicketId: ticketId }],
    },
    include: {
      fromTicket: { select: TICKET_SUMMARY_SELECT },
      toTicket: { select: TICKET_SUMMARY_SELECT },
    },
    orderBy: { createdAt: "asc" },
  });

  const predecessors: TicketLinksPayload["predecessors"] = [];
  const blocks: TicketLinksPayload["blocks"] = [];
  const relatesTo: TicketLinksPayload["relatesTo"] = [];

  for (const link of links) {
    if (link.type === TICKET_LINK_FINISH_START) {
      if (link.toTicketId === ticketId) {
        predecessors.push({
          linkId: link.id,
          type: TICKET_LINK_FINISH_START,
          ticket: link.fromTicket,
        });
      } else if (link.fromTicketId === ticketId) {
        blocks.push({
          linkId: link.id,
          type: TICKET_LINK_FINISH_START,
          ticket: link.toTicket,
        });
      }
      continue;
    }
    if (link.type === TICKET_LINK_RELATES_TO) {
      const other = link.fromTicketId === ticketId ? link.toTicket : link.fromTicket;
      relatesTo.push({
        linkId: link.id,
        type: TICKET_LINK_RELATES_TO,
        ticket: other,
      });
    }
  }

  const unfinishedPredecessors = predecessors
    .map((p) => p.ticket)
    .filter((t) => !isTicketClosedStatus(t.status));

  return {
    predecessors,
    blocks,
    relatesTo,
    blocked: unfinishedPredecessors.length > 0,
    unfinishedPredecessors,
  };
}

export type TicketLinkListChip = { id: string; code: string; title: string };

export type TicketLinksListSummary = {
  predecessor: TicketLinkListChip | null;
  references: TicketLinkListChip[];
};

/** Resumo leve de vínculos para cards/listagens (1 query por lote). */
export async function attachTicketLinkSummariesForList(
  tenantId: string,
  tickets: Array<{ id: string }>,
  db: PrismaClient = prisma,
): Promise<TicketLinksListSummary[]> {
  if (tickets.length === 0) return [];
  const ids = tickets.map((t) => t.id);
  const idSet = new Set(ids);

  const empty = (): TicketLinksListSummary => ({ predecessor: null, references: [] });
  const byId = new Map<string, TicketLinksListSummary>(ids.map((id) => [id, empty()]));

  const links = await db.ticketLink.findMany({
    where: {
      tenantId,
      OR: [
        { toTicketId: { in: ids }, type: TICKET_LINK_FINISH_START },
        { fromTicketId: { in: ids }, type: TICKET_LINK_RELATES_TO },
        { toTicketId: { in: ids }, type: TICKET_LINK_RELATES_TO },
      ],
    },
    select: {
      type: true,
      fromTicketId: true,
      toTicketId: true,
      fromTicket: { select: { id: true, code: true, title: true } },
      toTicket: { select: { id: true, code: true, title: true } },
    },
  });

  const toChip = (t: { id: string; code: string; title: string }): TicketLinkListChip => ({
    id: t.id,
    code: t.code,
    title: t.title,
  });

  for (const link of links) {
    if (link.type === TICKET_LINK_FINISH_START && idSet.has(link.toTicketId)) {
      byId.get(link.toTicketId)!.predecessor = toChip(link.fromTicket);
      continue;
    }
    if (link.type === TICKET_LINK_RELATES_TO) {
      if (idSet.has(link.fromTicketId)) {
        const row = byId.get(link.fromTicketId)!;
        const chip = toChip(link.toTicket);
        if (!row.references.some((r) => r.id === chip.id)) row.references.push(chip);
      }
      if (idSet.has(link.toTicketId)) {
        const row = byId.get(link.toTicketId)!;
        const chip = toChip(link.fromTicket);
        if (!row.references.some((r) => r.id === chip.id)) row.references.push(chip);
      }
    }
  }

  return tickets.map((t) => byId.get(t.id) ?? empty());
}
