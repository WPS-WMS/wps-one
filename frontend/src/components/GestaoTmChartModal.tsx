"use client";

import { useMemo } from "react";
import { X } from "lucide-react";

export type GestaoTmChartWeekRow = {
  label: string;
  plan: number;
  exec: number;
};

export type GestaoTmChartData = {
  title: string;
  mesPlanejado: number | null;
  mensalExecutado: number;
  rows: GestaoTmChartWeekRow[];
};

function fmtHoras(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function fmtPlannedHoras(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}

function fmtPct(executado: number, planejado: number | null | undefined): string {
  if (planejado == null || !Number.isFinite(planejado) || planejado <= 0) return "—";
  const pct = (executado / planejado) * 100;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function weekPct(plan: number, exec: number): number | null {
  if (plan <= 0 || !Number.isFinite(plan)) return null;
  return (exec / plan) * 100;
}

function niceMaxHours(max: number): number {
  if (max <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const n = Math.ceil(max / mag) * mag;
  return n < max ? max * 1.1 : n;
}

type GestaoTmChartModalProps = {
  data: GestaoTmChartData;
  onClose: () => void;
};

function GroupedWeekChart({ rows }: { rows: GestaoTmChartWeekRow[] }) {
  const layout = useMemo(() => {
    const W = 720;
    const H = 280;
    const padL = 48;
    const padR = 52;
    const padT = 20;
    const padB = 72;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maxH = Math.max(0, ...rows.flatMap((r) => [r.plan, r.exec]));
    const yMax = niceMaxHours(maxH);

    const pctValues = rows.map((r) => weekPct(r.plan, r.exec)).filter((p): p is number => p != null);
    const pctMax = pctValues.length > 0 ? Math.max(100, ...pctValues) * 1.08 : 100;

    const n = Math.max(1, rows.length);
    const groupW = plotW / n;

    const bars = rows.map((r, i) => {
      const gx = padL + i * groupW + groupW * 0.5;
      const barW = Math.min(28, groupW * 0.22);
      const gap = 6;
      const planH = (r.plan / yMax) * plotH;
      const execH = (r.exec / yMax) * plotH;
      const baseY = padT + plotH;
      return {
        label: r.label,
        shortLabel: `S${i + 1}`,
        plan: r.plan,
        exec: r.exec,
        labelX: gx,
        labelY: padT + plotH + 14,
        planRect: {
          x: gx - barW - gap / 2,
          y: baseY - planH,
          w: barW,
          h: planH,
        },
        execRect: {
          x: gx + gap / 2,
          y: baseY - execH,
          w: barW,
          h: execH,
        },
        pct: weekPct(r.plan, r.exec),
        pctY:
          r.plan > 0
            ? padT + plotH - (Math.min((r.exec / r.plan) * 100, pctMax) / pctMax) * plotH
            : null,
        pctX: gx,
      };
    });

    const yTicks = [0, yMax / 2, yMax].map((v) => ({
      value: v,
      y: padT + plotH - (v / yMax) * plotH,
      label: fmtHoras(v),
    }));

    const pctTicks = [0, 50, 100].filter((v) => v <= pctMax).map((v) => ({
      value: v,
      y: padT + plotH - (v / pctMax) * plotH,
      label: `${v}%`,
    }));

    const linePoints = bars
      .filter((b) => b.pct != null && b.pctY != null)
      .map((b) => `${b.pctX},${b.pctY}`)
      .join(" ");

    return { W, H, padL, padT, plotW, plotH, yMax, pctMax, bars, yTicks, pctTicks, linePoints, baseY: padT + plotH };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">Sem semanas no período.</p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.W} ${layout.H}`}
        className="w-full min-w-[320px] h-auto"
        role="img"
        aria-label="Gráfico de horas planejadas e executadas por semana"
      >
        {layout.yTicks.map((t) => (
          <g key={`y-${t.value}`}>
            <line
              x1={layout.padL}
              x2={layout.padL + layout.plotW}
              y1={t.y}
              y2={t.y}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <text
              x={layout.padL - 8}
              y={t.y + 4}
              textAnchor="end"
              className="fill-[color:var(--muted-foreground)] text-[10px]"
            >
              {t.label}
            </text>
          </g>
        ))}

        {layout.pctTicks.map((t) => (
          <g key={`pct-${t.value}`}>
            <text
              x={layout.padL + layout.plotW + 8}
              y={t.y + 4}
              textAnchor="start"
              className="fill-[color:var(--muted-foreground)] text-[10px]"
            >
              {t.label}
            </text>
          </g>
        ))}

        {layout.bars.map((b) => (
          <g key={b.label}>
            <title>
              {b.label}: planejado {fmtPlannedHoras(b.plan)} h, executado {fmtHoras(b.exec)} h
              {b.pct != null ? ` (${fmtPct(b.exec, b.plan)})` : ""}
            </title>
            <rect
              x={b.planRect.x}
              y={b.planRect.y}
              width={b.planRect.w}
              height={Math.max(b.planRect.h, b.plan > 0 ? 2 : 0)}
              rx={4}
              fill="rgba(92, 0, 225, 0.85)"
            />
            <rect
              x={b.execRect.x}
              y={b.execRect.y}
              width={b.execRect.w}
              height={Math.max(b.execRect.h, b.exec > 0 ? 2 : 0)}
              rx={4}
              fill="rgba(16, 185, 129, 0.9)"
            />
            <text
              x={b.labelX}
              y={b.labelY}
              textAnchor="middle"
              className="fill-[color:var(--muted-foreground)] text-[9px]"
            >
              {b.shortLabel}
            </text>
          </g>
        ))}

        {layout.linePoints && (
          <>
            <polyline
              points={layout.linePoints}
              fill="none"
              stroke="rgba(245, 158, 11, 0.95)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {layout.bars.map(
              (b) =>
                b.pct != null &&
                b.pctY != null && (
                  <circle key={`dot-${b.label}`} cx={b.pctX} cy={b.pctY} r={4} fill="rgba(245, 158, 11, 1)" />
                )
            )}
          </>
        )}

        <text
          x={layout.padL - 36}
          y={layout.padT + layout.plotH / 2}
          transform={`rotate(-90, ${layout.padL - 36}, ${layout.padT + layout.plotH / 2})`}
          textAnchor="middle"
          className="fill-[color:var(--muted-foreground)] text-[10px] font-medium"
        >
          Horas
        </text>
        <text
          x={layout.padL + layout.plotW + 40}
          y={layout.padT + layout.plotH / 2}
          transform={`rotate(90, ${layout.padL + layout.plotW + 40}, ${layout.padT + layout.plotH / 2})`}
          textAnchor="middle"
          className="fill-[color:var(--muted-foreground)] text-[10px] font-medium"
        >
          %
        </text>
      </svg>
    </div>
  );
}

export function GestaoTmChartModal({ data, onClose }: GestaoTmChartModalProps) {
  const { title, mesPlanejado, mensalExecutado, rows } = data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gestao-tm-chart-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="gestao-tm-chart-title" className="text-lg font-semibold text-[color:var(--foreground)] pr-2">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border hover:opacity-90 shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
          <div
            className="rounded-xl border p-3 min-w-0"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}
          >
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Mês planejado
            </p>
            <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums" style={{ color: "var(--primary)" }}>
              {fmtPlannedHoras(mesPlanejado)}
            </p>
          </div>
          <div
            className="rounded-xl border p-3 min-w-0"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}
          >
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Mensal executado
            </p>
            <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {fmtHoras(mensalExecutado)}
            </p>
          </div>
          <div
            className="rounded-xl border p-3 min-w-0"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}
          >
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              %
            </p>
            <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums text-[color:var(--foreground)]">
              {fmtPct(mensalExecutado, mesPlanejado)}
            </p>
          </div>
        </div>

        <GroupedWeekChart rows={rows} />

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 justify-center text-[10px] text-[color:var(--muted-foreground)]">
          {rows.map((r, i) => (
            <span key={r.label}>
              <span className="font-semibold text-[color:var(--foreground)]">S{i + 1}</span> {r.label}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-[color:var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(92, 0, 225, 0.85)" }} />
            Planejado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
            Executado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span className="inline-block h-0.5 w-4 bg-amber-500" />
            % da semana (executado ÷ planejado)
          </span>
        </div>
      </div>
    </div>
  );
}
