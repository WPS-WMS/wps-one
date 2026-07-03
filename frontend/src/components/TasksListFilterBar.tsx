"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import type { FilterOption } from "@/lib/tasksClientFilters";

export type TasksListFilterBarProps = {
  q: string;
  onQChange: (value: string) => void;
  statusIds: string[];
  onToggleStatus: (id: string) => void;
  statusOptions: FilterOption[];
  clientOptions: FilterOption[];
  clientIds: string[];
  onToggleClient: (id: string) => void;
  showClientFilter?: boolean;
  createdFrom: string;
  onCreatedFromChange: (value: string) => void;
  createdTo: string;
  onCreatedToChange: (value: string) => void;
  dueFrom: string;
  onDueFromChange: (value: string) => void;
  dueTo: string;
  onDueToChange: (value: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  hasAdvancedFilters: boolean;
  hasAnyFilters: boolean;
  onClear: () => void;
  showFiltrarButton?: boolean;
  onFiltrar?: () => void;
  fetching?: boolean;
  shownCount: number;
  totalCount: number;
  searchPlaceholder?: string;
};

export function TasksListFilterBar({
  q,
  onQChange,
  statusIds,
  onToggleStatus,
  statusOptions,
  clientOptions,
  clientIds,
  onToggleClient,
  showClientFilter = true,
  createdFrom,
  onCreatedFromChange,
  createdTo,
  onCreatedToChange,
  dueFrom,
  onDueFromChange,
  dueTo,
  onDueToChange,
  showAdvanced,
  onToggleAdvanced,
  hasAdvancedFilters,
  hasAnyFilters,
  onClear,
  showFiltrarButton = false,
  onFiltrar,
  fetching = false,
  shownCount,
  totalCount,
  searchPlaceholder = "Código, título, projeto, cliente...",
}: TasksListFilterBarProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const statusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const clientAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [statusMenuRect, setStatusMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [clientMenuRect, setClientMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selectableStatusIds = useMemo(
    () => statusOptions.filter((o) => o.id !== "").map((o) => o.id),
    [statusOptions],
  );
  const isStatusTodosChecked = useMemo(
    () => selectableStatusIds.length > 0 && selectableStatusIds.every((id) => statusIds.includes(id)),
    [selectableStatusIds, statusIds],
  );
  const selectedStatusLabels = useMemo(() => {
    if (statusIds.length === 0 || isStatusTodosChecked) return "Todos";
    const map = new Map(statusOptions.map((o) => [o.id, o.label] as const));
    const labels = statusIds.map((id) => map.get(id) ?? id).filter(Boolean);
    if (labels.length === 0) return "Todos";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }, [statusIds, statusOptions, isStatusTodosChecked]);

  const selectableClientIds = useMemo(
    () => clientOptions.filter((o) => o.id !== "").map((o) => o.id),
    [clientOptions],
  );
  const isClientTodosChecked = useMemo(
    () => selectableClientIds.length > 0 && selectableClientIds.every((id) => clientIds.includes(id)),
    [selectableClientIds, clientIds],
  );
  const selectedClientLabel = useMemo(() => {
    if (clientIds.length === 0 || isClientTodosChecked) return "Todos";
    const map = new Map(clientOptions.map((o) => [o.id, o.label] as const));
    const labels = clientIds.map((id) => map.get(id) ?? id).filter(Boolean);
    if (labels.length === 0) return "Todos";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }, [clientIds, clientOptions, isClientTodosChecked]);

  useEffect(() => {
    if (!statusOpen) return;
    const update = () => {
      const el = statusAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setStatusMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [statusOpen]);

  useEffect(() => {
    if (!clientOpen) return;
    const update = () => {
      const el = clientAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setClientMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [clientOpen]);

  useEffect(() => {
    if (!statusOpen && !clientOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStatusOpen(false);
        setClientOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const statusAnchor = statusAnchorRef.current;
      const clientAnchor = clientAnchorRef.current;
      const statusMenu = document.getElementById("tasks-filter-status-menu");
      const clientMenu = document.getElementById("tasks-filter-client-menu");
      if (statusOpen) {
        const inside =
          (statusAnchor && target && statusAnchor.contains(target)) ||
          (statusMenu && target && statusMenu.contains(target));
        if (!inside) setStatusOpen(false);
      }
      if (clientOpen) {
        const inside =
          (clientAnchor && target && clientAnchor.contains(target)) ||
          (clientMenu && target && clientMenu.contains(target));
        if (!inside) setClientOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [statusOpen, clientOpen]);

  const clientOptionsWithTodos = useMemo(
    () => [{ id: "", label: "Todos" }, ...clientOptions],
    [clientOptions],
  );

  return (
    <>
      {typeof document !== "undefined" && statusOpen && statusMenuRect
        ? createPortal(
            <div
              id="tasks-filter-status-menu"
              style={{
                position: "fixed",
                left: statusMenuRect.left,
                top: statusMenuRect.top,
                width: statusMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
              >
                {statusOptions.map((o) => {
                  const checked = o.id === "" ? isStatusTodosChecked : statusIds.includes(o.id);
                  return (
                    <button
                      key={o.id === "" ? "__todos__" : o.id}
                      type="button"
                      onClick={() => onToggleStatus(o.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        o.id === "" ? "font-semibold" : ""
                      }`}
                    >
                      <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && clientOpen && clientMenuRect
        ? createPortal(
            <div
              id="tasks-filter-client-menu"
              style={{
                position: "fixed",
                left: clientMenuRect.left,
                top: clientMenuRect.top,
                width: clientMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
              >
                {clientOptionsWithTodos.map((o) => {
                  const checked = o.id === "" ? isClientTodosChecked : clientIds.includes(o.id);
                  return (
                    <button
                      key={o.id === "" ? "__client_todos__" : o.id}
                      type="button"
                      onClick={() => onToggleClient(o.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        o.id === "" ? "font-semibold" : ""
                      }`}
                    >
                      <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <div
        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-visible"
        style={{
          background: "linear-gradient(135deg, rgba(92,0,225,0.08), rgba(0,0,0,0.02))",
        }}
      >
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="w-full sm:flex-[2] sm:min-w-[280px] lg:min-w-[360px]">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--muted-foreground)]" />
                  <input
                    value={q}
                    onChange={(e) => onQChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
              </div>

              <div className="w-full sm:flex-1 sm:min-w-[190px] lg:w-auto">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                  Status
                </label>
                <button
                  type="button"
                  ref={statusAnchorRef}
                  onClick={() => {
                    setClientOpen(false);
                    setStatusOpen((v) => !v);
                  }}
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                  aria-expanded={statusOpen}
                >
                  <span className="truncate">{selectedStatusLabels}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${statusOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {showClientFilter && clientOptions.length > 0 && (
                <div className="w-full sm:flex-1 sm:min-w-[220px] lg:w-auto">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Cliente
                  </label>
                  <button
                    type="button"
                    ref={clientAnchorRef}
                    onClick={() => {
                      setStatusOpen(false);
                      setClientOpen((v) => !v);
                    }}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                    aria-expanded={clientOpen}
                  >
                    <span className="truncate">{selectedClientLabel}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${clientOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end w-full lg:w-auto">
              <button
                type="button"
                onClick={onToggleAdvanced}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90 ${
                  showAdvanced || hasAdvancedFilters
                    ? "bg-[color:var(--primary)]/[0.10] text-[color:var(--foreground)]"
                    : "bg-[color:var(--surface)] text-[color:var(--foreground)]"
                }`}
                style={{ borderColor: "var(--border)" }}
                aria-expanded={showAdvanced}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                Filtros avançados
                {hasAdvancedFilters && (
                  <span
                    className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "rgba(92,0,225,0.12)", color: "var(--primary)" }}
                  >
                    ativo
                  </span>
                )}
              </button>

              {hasAnyFilters && (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90"
                  style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)", color: "var(--foreground)" }}
                  title="Limpar filtros"
                >
                  <X className="h-4 w-4" />
                  Limpar
                </button>
              )}

              {showFiltrarButton && (
                <button
                  type="button"
                  onClick={onFiltrar}
                  disabled={fetching}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[color:var(--primary)] text-[color:var(--primary-foreground)] transition hover:opacity-95 disabled:opacity-50"
                >
                  <Filter className="h-4 w-4" />
                  Filtrar
                </button>
              )}
            </div>
          </div>

          {showAdvanced && (
            <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/70 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Criação (de)
                  </label>
                  <input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => onCreatedFromChange(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Criação (até)
                  </label>
                  <input
                    type="date"
                    value={createdTo}
                    onChange={(e) => onCreatedToChange(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Entrega (de)
                  </label>
                  <input
                    type="date"
                    value={dueFrom}
                    onChange={(e) => onDueFromChange(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">
                    Entrega (até)
                  </label>
                  <input
                    type="date"
                    value={dueTo}
                    onChange={(e) => onDueToChange(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-[color:var(--muted-foreground)]">
            Mostrando <strong>{shownCount}</strong> de <strong>{totalCount}</strong> tarefa(s).
          </div>
        </div>
      </div>
    </>
  );
}
