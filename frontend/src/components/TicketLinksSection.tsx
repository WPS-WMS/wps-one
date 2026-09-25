"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isTicketClosedStatus } from "@/lib/ticketLinks";

export type TicketLinkTicket = {
  id: string;
  code: string;
  title: string;
  status: string;
  type: string;
  arquivado: boolean;
  projectId: string;
};

type LinkRow = {
  linkId: string;
  type: "FINISH_START" | "RELATES_TO";
  ticket: TicketLinkTicket;
};

export type TicketLinksState = {
  predecessors: LinkRow[];
  blocks: LinkRow[];
  relatesTo: LinkRow[];
  blocked: boolean;
  unfinishedPredecessors: TicketLinkTicket[];
};

type TicketLinksSectionProps = {
  ticketId: string;
  readOnly?: boolean;
  labelClass: string;
  inputClass: string;
};

function ticketLabel(t: Pick<TicketLinkTicket, "code" | "title">): string {
  const code = String(t.code ?? "").trim();
  const title = String(t.title ?? "").trim();
  if (code && title) return `${code} — ${title}`;
  return title || code || "Tarefa";
}

function statusHint(t: TicketLinkTicket): string {
  const st = String(t.status ?? "").toUpperCase();
  if (isTicketClosedStatus(st)) return "Concluída";
  if (t.arquivado) return "Arquivada";
  return st.replace(/_/g, " ") || "Aberta";
}

function ticketOpenHref(ticketId: string): string {
  return `/abrir-tarefa/${encodeURIComponent(ticketId)}`;
}

function LinkedTicketLabel({ ticket }: { ticket: TicketLinkTicket }) {
  const code = String(ticket.code ?? "").trim();
  const title = String(ticket.title ?? "").trim();
  const label = ticketLabel(ticket);
  return (
    <a
      href={ticketOpenHref(ticket.id)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block truncate text-sm font-medium text-[color:var(--primary)] hover:underline"
      title={`Abrir ${label} em nova aba`}
    >
      {code && title ? (
        <>
          <span className="font-semibold">{code}</span>
          <span className="text-[color:var(--foreground)]"> — {title}</span>
        </>
      ) : (
        label
      )}
    </a>
  );
}

export function TicketLinksSection({
  ticketId,
  readOnly = false,
  labelClass,
  inputClass,
}: TicketLinksSectionProps) {
  const [data, setData] = useState<TicketLinksState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [predQuery, setPredQuery] = useState("");
  const [refQuery, setRefQuery] = useState("");
  const [predOpen, setPredOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [predCandidates, setPredCandidates] = useState<TicketLinkTicket[]>([]);
  const [refCandidates, setRefCandidates] = useState<TicketLinkTicket[]>([]);
  const [searchingPred, setSearchingPred] = useState(false);
  const [searchingRef, setSearchingRef] = useState(false);
  const predBoxRef = useRef<HTMLDivElement>(null);
  const refBoxRef = useRef<HTMLDivElement>(null);
  const predTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/links`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error || "Falha ao carregar vínculos.");
        setData(null);
        return;
      }
      setData(json as TicketLinksState);
    } catch {
      setError("Falha ao carregar vínculos.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (predBoxRef.current && !predBoxRef.current.contains(t)) setPredOpen(false);
      if (refBoxRef.current && !refBoxRef.current.contains(t)) setRefOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function searchCandidates(
    q: string,
    includeArchived: boolean,
  ): Promise<TicketLinkTicket[]> {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (includeArchived) params.set("includeArchived", "true");
    params.set("limit", "30");
    const res = await apiFetch(`/api/tickets/${ticketId}/links/candidates?${params}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) return [];
    return Array.isArray((json as { items?: unknown })?.items)
      ? ((json as { items: TicketLinkTicket[] }).items)
      : [];
  }

  function schedulePredSearch(q: string) {
    setPredQuery(q);
    setPredOpen(true);
    if (predTimer.current) clearTimeout(predTimer.current);
    predTimer.current = setTimeout(async () => {
      setSearchingPred(true);
      try {
        setPredCandidates(await searchCandidates(q, false));
      } finally {
        setSearchingPred(false);
      }
    }, 250);
  }

  function scheduleRefSearch(q: string) {
    setRefQuery(q);
    setRefOpen(true);
    if (refTimer.current) clearTimeout(refTimer.current);
    refTimer.current = setTimeout(async () => {
      setSearchingRef(true);
      try {
        setRefCandidates(await searchCandidates(q, true));
      } finally {
        setSearchingRef(false);
      }
    }, 250);
  }

  async function addLink(type: "FINISH_START" | "RELATES_TO", otherTicketId: string) {
    if (readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, otherTicketId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error || "Não foi possível criar o vínculo.");
        return;
      }
      setData(json as TicketLinksState);
      if (type === "FINISH_START") {
        setPredQuery("");
        setPredOpen(false);
        setPredCandidates([]);
      } else {
        setRefQuery("");
        setRefOpen(false);
        setRefCandidates([]);
      }
    } catch {
      setError("Erro de conexão ao criar vínculo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId: string) {
    if (readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/links/${linkId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json as { error?: string } | null)?.error || "Não foi possível remover o vínculo.");
        return;
      }
      setData(json as TicketLinksState);
    } catch {
      setError("Erro de conexão ao remover vínculo.");
    } finally {
      setBusy(false);
    }
  }

  const predecessor = data?.predecessors?.[0] ?? null;
  const blocked = Boolean(data?.blocked);

  return (
    <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-[color:var(--muted-foreground)]" aria-hidden />
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Vínculos</h3>
        {blocked && (
          <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Bloqueada
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando vínculos…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <label className={labelClass}>Depende de</label>
              <p className="mb-1.5 text-[11px] text-[color:var(--muted-foreground)]">
                Só sai do backlog quando essa tarefa estiver concluída.
              </p>
              {predecessor ? (
                <div className="flex items-start gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <LinkedTicketLabel ticket={predecessor.ticket} />
                    <p className="text-[11px] text-[color:var(--muted-foreground)]">
                      {statusHint(predecessor.ticket)}
                      {!isTicketClosedStatus(predecessor.ticket.status) ? " · aguardando conclusão" : ""}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void removeLink(predecessor.linkId)}
                      disabled={busy}
                      className="rounded-md p-1 text-[color:var(--muted-foreground)] hover:bg-black/5 hover:text-[color:var(--foreground)] disabled:opacity-50"
                      title="Remover dependência"
                      aria-label="Remover dependência"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : !readOnly ? (
                <div className="relative" ref={predBoxRef}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
                    <input
                      type="search"
                      value={predQuery}
                      onChange={(e) => schedulePredSearch(e.target.value)}
                      onFocus={() => {
                        setPredOpen(true);
                        if (predCandidates.length === 0) schedulePredSearch(predQuery);
                      }}
                      placeholder="Buscar tarefa (código ou título)…"
                      className={`${inputClass} pl-9`}
                      disabled={busy}
                      autoComplete="off"
                    />
                  </div>
                  {predOpen && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-xl">
                      {searchingPred ? (
                        <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">Buscando…</p>
                      ) : predCandidates.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                          Nenhuma tarefa encontrada.
                        </p>
                      ) : (
                        predCandidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void addLink("FINISH_START", c.id)}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-black/5"
                          >
                            <span className="truncate font-medium text-[color:var(--foreground)]">
                              {ticketLabel(c)}
                            </span>
                            <span className="text-[11px] text-[color:var(--muted-foreground)]">
                              {statusHint(c)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma</p>
              )}
            </div>

            <div className="min-w-0">
              <label className={labelClass}>Relacionada a</label>
              <p className="mb-1.5 text-[11px] text-[color:var(--muted-foreground)]">
                Liga a outra tarefa sem bloquear (ex.: continuidade após finalizar).
              </p>
              {data && data.relatesTo.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {data.relatesTo.map((r) => (
                    <li
                      key={r.linkId}
                      className="flex items-start gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <LinkedTicketLabel ticket={r.ticket} />
                        <p className="text-[11px] text-[color:var(--muted-foreground)]">{statusHint(r.ticket)}</p>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => void removeLink(r.linkId)}
                          disabled={busy}
                          className="rounded-md p-1 text-[color:var(--muted-foreground)] hover:bg-black/5 hover:text-[color:var(--foreground)] disabled:opacity-50"
                          title="Remover relação"
                          aria-label="Remover relação"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="relative" ref={refBoxRef}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
                    <input
                      type="search"
                      value={refQuery}
                      onChange={(e) => scheduleRefSearch(e.target.value)}
                      onFocus={() => {
                        setRefOpen(true);
                        if (refCandidates.length === 0) scheduleRefSearch(refQuery);
                      }}
                      placeholder="Buscar tarefa (inclui finalizadas)…"
                      className={`${inputClass} pl-9`}
                      disabled={busy}
                      autoComplete="off"
                    />
                  </div>
                  {refOpen && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-xl">
                      {searchingRef ? (
                        <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">Buscando…</p>
                      ) : refCandidates.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                          Nenhuma tarefa encontrada.
                        </p>
                      ) : (
                        refCandidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void addLink("RELATES_TO", c.id)}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-black/5"
                          >
                            <span className="truncate font-medium text-[color:var(--foreground)]">
                              {ticketLabel(c)}
                            </span>
                            <span className="text-[11px] text-[color:var(--muted-foreground)]">
                              {statusHint(c)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {readOnly && (!data || data.relatesTo.length === 0) && (
                <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma</p>
              )}
            </div>
          </div>

          {data && data.blocks.length > 0 && (
            <div>
              <label className={labelClass}>Bloqueia</label>
              <ul className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {data.blocks.map((b) => (
                  <li
                    key={b.linkId}
                    className="rounded-lg border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2 text-sm"
                  >
                    <LinkedTicketLabel ticket={b.ticket} />
                    <span className="mt-0.5 block text-[11px] text-[color:var(--muted-foreground)]">
                      {statusHint(b.ticket)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
