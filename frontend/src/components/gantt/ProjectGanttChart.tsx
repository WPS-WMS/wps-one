"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type GanttLaneKind = "future" | "active" | "overdue" | "done" | "nodates";

export type GanttRow = {
  id: string;
  projectName: string;
  topicName: string;
  code: string;
  title: string;
  resource: string;
  predecessor: string;
  start: string | null; // YYYY-MM-DD
  end: string | null;
  status: string;
  statusLabel?: string | null;
  kind: GanttLaneKind;
  progress: number;
};

const LANE_META: Record<
  Exclude<GanttLaneKind, "nodates">,
  { label: string; bar: string; text: string }
> = {
  future: {
    label: "Futuro",
    bar: "bg-violet-400/90 dark:bg-violet-500/80",
    text: "text-violet-800 dark:text-violet-200",
  },
  active: {
    label: "Em andamento",
    bar: "bg-[color:var(--primary)]",
    text: "text-[color:var(--primary)]",
  },
  overdue: {
    label: "Atrasada",
    bar: "bg-rose-500",
    text: "text-rose-800 dark:text-rose-200",
  },
  done: {
    label: "Concluída",
    bar: "bg-slate-400 dark:bg-slate-500",
    text: "text-slate-600 dark:text-slate-300",
  },
};

function parseYmd(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const ymd = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmdBr(raw: string | null | undefined): string {
  if (!raw) return "—";
  const ymd = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysBetweenUtc(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function startOfWeekUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDaysUtc(d, mondayOffset);
}

export function classifyGanttLane(params: {
  start: string | null;
  end: string | null;
  status: string;
  todayYmd?: string;
}): GanttLaneKind {
  const st = String(params.status ?? "").trim().toUpperCase();
  if (st === "ENCERRADO" || st === "FINALIZADAS") return "done";
  const start = parseYmd(params.start);
  const end = parseYmd(params.end);
  if (!start && !end) return "nodates";
  const today = params.todayYmd
    ? parseYmd(params.todayYmd)!
    : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  if (end && end < today) return "overdue";
  if (st === "EXECUCAO" || st === "TESTE" || st === "EM_EXECUCAO") return "active";
  if (start && start > today) return "future";
  return "active";
}

type Scale = "week" | "month";

type ProjectGanttChartProps = {
  rows: GanttRow[];
  onOpenTask?: (id: string) => void;
};

export function ProjectGanttChart({ rows, onOpenTask }: ProjectGanttChartProps) {
  const [scale, setScale] = useState<Scale>("week");
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const leftBodyRef = useRef<HTMLDivElement>(null);

  const dayWidth = scale === "week" ? 36 : 14;

  const { rangeStart, days, todayOffset } = useMemo(() => {
    const today = new Date(
      Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
    );
    let min = today;
    let max = addDaysUtc(today, 28);
    for (const row of rows) {
      const s = parseYmd(row.start);
      const e = parseYmd(row.end);
      if (s && s < min) min = s;
      if (e && e > max) max = e;
      if (s && !e && s > max) max = addDaysUtc(s, 7);
      if (e && !s && e < min) min = addDaysUtc(e, -7);
    }
    // padding
    min = addDaysUtc(startOfWeekUtc(min), -7);
    max = addDaysUtc(max, 14);
    const total = Math.max(14, daysBetweenUtc(min, max) + 1);
    const list: Date[] = [];
    for (let i = 0; i < total; i++) list.push(addDaysUtc(min, i));
    return {
      rangeStart: min,
      days: list,
      todayOffset: daysBetweenUtc(min, today),
    };
  }, [rows]);

  function syncScroll(source: "header" | "body" | "left") {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    const left = leftBodyRef.current;
    if (!header || !body || !left) return;
    if (source === "body") {
      header.scrollLeft = body.scrollLeft;
      left.scrollTop = body.scrollTop;
    } else if (source === "header") {
      body.scrollLeft = header.scrollLeft;
    } else {
      body.scrollTop = left.scrollTop;
    }
  }

  const monthLabels = useMemo(() => {
    const labels: Array<{ key: string; label: string; span: number }> = [];
    let i = 0;
    while (i < days.length) {
      const d = days[i]!;
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      let span = 1;
      while (
        i + span < days.length &&
        days[i + span]!.getUTCFullYear() === d.getUTCFullYear() &&
        days[i + span]!.getUTCMonth() === d.getUTCMonth()
      ) {
        span++;
      }
      labels.push({
        key,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }),
        span,
      });
      i += span;
    }
    return labels;
  }, [days]);

  const timelineWidth = days.length * dayWidth;

  useEffect(() => {
    const body = bodyScrollRef.current;
    const header = headerScrollRef.current;
    if (!body || todayOffset < 0) return;
    const target = Math.max(0, todayOffset * dayWidth - body.clientWidth * 0.25);
    body.scrollLeft = target;
    if (header) header.scrollLeft = target;
  }, [todayOffset, dayWidth, days.length]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {(Object.keys(LANE_META) as Array<keyof typeof LANE_META>).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[color:var(--muted-foreground)]">
              <span className={`h-2.5 w-5 rounded-full ${LANE_META[k].bar}`} aria-hidden />
              {LANE_META[k].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[color:var(--muted-foreground)]">
            <span className="h-2.5 w-5 rounded-full border border-dashed border-slate-400 bg-transparent" aria-hidden />
            Sem datas
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setScale("week")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              scale === "week"
                ? "bg-[color:var(--primary)] text-white shadow-sm"
                : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setScale("month")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              scale === "month"
                ? "bg-[color:var(--primary)] text-white shadow-sm"
                : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
            }`}
          >
            Mês
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
        <div className="flex border-b border-[color:var(--border)] bg-[color:var(--background)]/40">
          <div className="grid w-[min(52vw,640px)] shrink-0 grid-cols-[1.1fr_1fr_0.55fr_1.3fr_0.9fr_0.7fr_0.7fr_0.7fr] gap-0 border-r border-[color:var(--border)] text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            {["Projeto", "Tópico", "ID", "Tarefa", "Recurso", "Depende de", "Início", "Fim"].map((h) => (
              <div key={h} className="truncate border-r border-[color:var(--border)]/60 px-2 py-2.5 last:border-r-0">
                {h}
              </div>
            ))}
          </div>
          <div
            ref={headerScrollRef}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
            onScroll={() => syncScroll("header")}
          >
            <div style={{ width: timelineWidth }}>
              <div className="flex border-b border-[color:var(--border)]/70 text-[10px] font-semibold text-[color:var(--muted-foreground)]">
                {monthLabels.map((m) => (
                  <div
                    key={m.key}
                    className="truncate border-r border-[color:var(--border)]/50 px-1 py-1 text-center capitalize"
                    style={{ width: m.span * dayWidth }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="flex text-[10px] text-[color:var(--muted-foreground)]">
                {days.map((d, i) => {
                  const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  const isToday = i === todayOffset;
                  const label =
                    scale === "week"
                      ? String(d.getUTCDate()).padStart(2, "0")
                      : d.getUTCDate() === 1 || d.getUTCDay() === 1
                        ? String(d.getUTCDate())
                        : "";
                  return (
                    <div
                      key={d.toISOString()}
                      className={`relative flex h-7 items-center justify-center border-r border-[color:var(--border)]/40 ${
                        isWeekend ? "bg-black/[0.03] dark:bg-white/[0.03]" : ""
                      } ${isToday ? "font-bold text-amber-700 dark:text-amber-400" : ""}`}
                      style={{ width: dayWidth }}
                      title={isToday ? "Hoje" : undefined}
                    >
                      {isToday ? (
                        <span className="rounded bg-amber-500 px-0.5 text-[9px] font-bold uppercase text-white">
                          Hoje
                        </span>
                      ) : (
                        label
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex max-h-[min(70vh,720px)]">
          <div
            ref={leftBodyRef}
            className="w-[min(52vw,640px)] shrink-0 overflow-y-auto overflow-x-hidden border-r border-[color:var(--border)]"
            onScroll={() => syncScroll("left")}
          >
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
                Nenhuma tarefa com período para exibir.
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onOpenTask?.(row.id)}
                  className="grid w-full grid-cols-[1.1fr_1fr_0.55fr_1.3fr_0.9fr_0.7fr_0.7fr_0.7fr] border-b border-[color:var(--border)]/60 text-left text-[11px] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                  style={{ height: 44 }}
                >
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 text-[color:var(--foreground)]" title={row.projectName}>
                    {row.projectName || "—"}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 text-[color:var(--muted-foreground)]" title={row.topicName}>
                    {row.topicName || "—"}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 font-mono text-[color:var(--muted-foreground)]">
                    {row.code || "—"}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 font-medium text-[color:var(--foreground)]" title={row.title}>
                    {row.title}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 text-[color:var(--muted-foreground)]" title={row.resource}>
                    {row.resource || "—"}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 text-[color:var(--muted-foreground)]" title={row.predecessor}>
                    {row.predecessor || "—"}
                  </span>
                  <span className="truncate border-r border-[color:var(--border)]/40 px-2 py-2.5 text-[color:var(--muted-foreground)]">
                    {formatYmdBr(row.start)}
                  </span>
                  <span className="truncate px-2 py-2.5 text-[color:var(--muted-foreground)]">
                    {formatYmdBr(row.end)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div
            ref={bodyScrollRef}
            className="min-w-0 flex-1 overflow-auto"
            onScroll={() => syncScroll("body")}
          >
            <div className="relative" style={{ width: timelineWidth, minHeight: Math.max(44, rows.length * 44) }}>
              {/* weekend / grid */}
              <div className="pointer-events-none absolute inset-0 flex">
                {days.map((d) => {
                  const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  return (
                    <div
                      key={`g-${d.toISOString()}`}
                      className={`h-full border-r border-[color:var(--border)]/30 ${
                        isWeekend ? "bg-black/[0.025] dark:bg-white/[0.025]" : ""
                      }`}
                      style={{ width: dayWidth }}
                    />
                  );
                })}
              </div>

              {/* today line */}
              {todayOffset >= 0 && todayOffset < days.length && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-amber-500/90"
                  style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                  title="Hoje"
                />
              )}

              {rows.map((row) => {
                const s = parseYmd(row.start);
                const e = parseYmd(row.end);
                const hasBar = Boolean(s || e);
                const barStart = s ?? e!;
                const barEnd = e ?? s!;
                const startIdx = Math.max(0, daysBetweenUtc(rangeStart, barStart));
                const endIdx = Math.min(days.length - 1, daysBetweenUtc(rangeStart, barEnd));
                const left = startIdx * dayWidth;
                const width = Math.max(dayWidth * 0.7, (endIdx - startIdx + 1) * dayWidth - 4);
                const meta = row.kind !== "nodates" ? LANE_META[row.kind] : null;

                return (
                  <div
                    key={row.id}
                    className="relative border-b border-[color:var(--border)]/40"
                    style={{ height: 44 }}
                  >
                    {hasBar && meta ? (
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(row.id)}
                        className={`absolute top-2 z-10 flex h-7 items-center overflow-hidden rounded-md px-2 text-left shadow-sm transition hover:brightness-110 ${meta.bar}`}
                        style={{ left: left + 2, width }}
                        title={`${row.code} — ${row.title}\n${formatYmdBr(row.start)} → ${formatYmdBr(row.end)}\n${meta.label}`}
                      >
                        <span className="truncate text-[10px] font-semibold text-white drop-shadow-sm">
                          {row.code || row.title}
                        </span>
                        {row.kind === "active" && row.progress > 0 && (
                          <span
                            className="pointer-events-none absolute inset-y-0 left-0 bg-white/25"
                            style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }}
                          />
                        )}
                      </button>
                    ) : (
                      <div className="absolute top-3 left-2 h-5 w-8 rounded border border-dashed border-slate-400/70" title="Sem datas de início/fim" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
