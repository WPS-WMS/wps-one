"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatarMoeda } from "@/lib/brFormatters";
import { reportsFilterPanelBackground } from "@/components/reports/ReportsPrimitives";

export type FinanceHeaderTone = "default" | "inflow" | "outflow";

const TONE_STYLES: Record<
  FinanceHeaderTone,
  { bar: string; glow: string; eyebrow: string; chip: string }
> = {
  default: {
    bar: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))",
    glow: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)",
    eyebrow: "text-[color:var(--primary)]",
    chip: "bg-[color:var(--primary)]/10 text-[color:var(--primary)]",
  },
  inflow: {
    bar: "linear-gradient(180deg, #059669, #064e3b)",
    glow: "radial-gradient(circle, #10b981, transparent 70%)",
    eyebrow: "text-emerald-700",
    chip: "bg-emerald-100 text-emerald-800",
  },
  outflow: {
    bar: "linear-gradient(180deg, #d97706, #92400e)",
    glow: "radial-gradient(circle, #f59e0b, transparent 70%)",
    eyebrow: "text-amber-700",
    chip: "bg-amber-100 text-amber-900",
  },
};

export const financePrimaryBtnClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export const financeSecondaryBtnClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-[color:var(--surface)] px-3.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 disabled:pointer-events-none";

export const financePrimaryBtnStyle = {
  background:
    "linear-gradient(135deg, var(--wps-purple-600) 0%, color-mix(in srgb, var(--wps-purple-600) 65%, var(--wps-purple-900)) 100%)",
} as const;

/** Shell da tabela lista CR/CP. */
export const financeListTableWrapClass =
  "relative isolate min-w-0 max-h-[min(70vh,calc(100dvh-13rem))] overflow-auto overscroll-contain scroll-smooth rounded-xl border [transform:translateZ(0)] [scrollbar-gutter:stable]";

export const financeListTheadClass =
  "border-b text-[10px] font-medium uppercase tracking-[0.06em] text-[color:var(--muted-foreground)] [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[color:var(--surface)]";

export const financeListTheadStyle = {
  borderColor: "var(--border)",
  background: "color-mix(in srgb, var(--wps-purple-600) 4%, var(--surface))",
} as const;

export const financeListPageShellClass = "mx-auto min-w-0 max-w-[1400px] space-y-6 overflow-x-hidden p-4 md:p-6";

export const FINANCE_PAGE_SIZE_OPTIONS = [50, 100, 200, 300, 500] as const;

type FinancePageSizeSelectProps = {
  id: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
};

/** Seletor de itens por página, fora do painel de filtros. */
export function FinancePageSizeSelect({
  id,
  value,
  onChange,
  disabled,
}: FinancePageSizeSelectProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor={id} className="text-xs text-[color:var(--muted-foreground)] whitespace-nowrap">
        Itens por página
      </label>
      <select
        id={id}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 min-w-[4.75rem] rounded-lg border bg-[color:var(--surface)] px-2.5 text-sm tabular-nums disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        {FINANCE_PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

type FinancePageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Default: Financeiro */
  eyebrow?: string;
  /** Chip ao lado do título (ex.: Entradas / Saídas). */
  chip?: string;
  tone?: FinanceHeaderTone;
  actions?: ReactNode;
  below?: ReactNode;
  variant?: "card" | "bar";
  className?: string;
  contentClassName?: string;
};

export function FinancePageHeader({
  title,
  subtitle,
  eyebrow = "Financeiro",
  chip,
  tone = "default",
  actions,
  below,
  variant = "card",
  className = "",
  contentClassName = "max-w-6xl",
}: FinancePageHeaderProps) {
  const styles = TONE_STYLES[tone];

  const body = (
    <div
      className={`relative flex flex-col gap-3 ${
        variant === "card"
          ? "px-4 py-4 pl-5 md:flex-row md:items-end md:justify-between md:px-5 md:py-5 md:pl-6"
          : "px-4 py-4 pl-5 md:flex-row md:items-end md:justify-between md:px-6 md:py-5 md:pl-7"
      }`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${styles.eyebrow}`}>
            {eyebrow}
          </p>
        ) : null}
        <div className={`flex flex-wrap items-center gap-2 ${eyebrow ? "mt-0.5" : ""}`}>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--foreground)]">{title}</h1>
          {chip ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${styles.chip}`}
            >
              {chip}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
            {subtitle}
          </p>
        ) : null}
        {below ? <div className="mt-3">{below}</div> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
          {actions}
        </div>
      ) : null}
    </div>
  );

  const accent = (
    <>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: styles.bar }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full opacity-[0.1]"
        style={{ background: styles.glow }}
        aria-hidden
      />
    </>
  );

  if (variant === "bar") {
    return (
      <header
        className={`relative flex-shrink-0 overflow-hidden border-b bg-[color:var(--surface)] ${className}`}
        style={{ borderColor: "var(--border)" }}
      >
        {accent}
        <div className={`relative mx-auto ${contentClassName}`}>{body}</div>
      </header>
    );
  }

  return (
    <section
      className={`relative overflow-hidden rounded-xl border bg-[color:var(--surface)] ${className}`}
      style={{ borderColor: "var(--border)" }}
    >
      {accent}
      {body}
    </section>
  );
}

export const FINANCE_AGING_BUCKET_LABELS: Record<string, string> = {
  VENCIDOS: "Vencidos",
  A_VENCER: "A vencer (1–7 dias)",
  "1_30": "1–30 dias",
  "31_60": "31–60 dias",
  "61_90": "61–90 dias",
  "90_PLUS": "90+ dias",
};

export type FinanceAgingBuckets = Record<string, { count: number; totalCents: number } | undefined>;

type FinanceAgingSummaryCardProps = {
  title?: string;
  overdueCount: number;
  overdueTotalCents: number;
  buckets: FinanceAgingBuckets;
  tone?: "inflow" | "outflow";
  bucketOrder?: string[];
};

export function FinanceAgingSummaryCard({
  title = "Aging financeiro",
  overdueCount,
  overdueTotalCents,
  buckets,
  bucketOrder = ["VENCIDOS", "A_VENCER", "1_30", "31_60", "61_90", "90_PLUS"],
}: FinanceAgingSummaryCardProps) {
  const leftAccent = "var(--wps-purple-600)";

  return (
    <div
      className="rounded-xl border bg-[color:var(--surface)] p-4"
      style={{
        borderColor: "var(--border)",
        borderLeftWidth: 4,
        borderLeftColor: leftAccent,
      }}
    >
      <h2 className="text-sm font-semibold text-[color:var(--foreground)]">{title}</h2>
      <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
        {overdueCount} parcela{overdueCount === 1 ? "" : "s"} vencida
        {overdueCount === 1 ? "" : "s"} — total {formatarMoeda(overdueTotalCents / 100)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {bucketOrder.map((key) => {
          const b = buckets[key];
          const isOverdue = key === "VENCIDOS";
          return (
            <div
              key={key}
              className={`rounded-lg p-2 text-center ${
                isOverdue ? "border border-red-200 bg-red-50" : "bg-black/5"
              }`}
            >
              <div
                className={`text-[10px] uppercase tracking-[0.04em] ${
                  isOverdue ? "font-medium text-red-700" : "text-[color:var(--muted-foreground)]"
                }`}
              >
                {FINANCE_AGING_BUCKET_LABELS[key] ?? key}
              </div>
              <div className={`mt-0.5 text-sm font-semibold tabular-nums ${isOverdue ? "text-red-800" : ""}`}>
                {formatarMoeda((b?.totalCents ?? 0) / 100)}
              </div>
              <div className={`text-[11px] ${isOverdue ? "text-red-700" : "text-[color:var(--muted-foreground)]"}`}>
                {b?.count ?? 0} título{(b?.count ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FinanceCollapsibleFiltersProps = {
  children: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  /** Default: fechado para priorizar a listagem. */
  defaultOpen?: boolean;
  title?: string;
};

export function FinanceCollapsibleFilters({
  children,
  activeCount = 0,
  onClear,
  defaultOpen = false,
  title = "Filtros",
}: FinanceCollapsibleFiltersProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl border shadow-sm overflow-visible"
      style={{
        borderColor: "var(--border)",
        background: reportsFilterPanelBackground,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]"
          aria-expanded={open}
          aria-label={open ? "Recolher filtros" : "Expandir filtros"}
          title={open ? "Recolher filtros" : "Expandir filtros"}
        >
          <ChevronDown
            className={`h-4 w-4 text-[color:var(--muted-foreground)] transition-transform ${
              open ? "rotate-0" : "-rotate-90"
            }`}
          />
          {title}
          {activeCount > 0 ? (
            <span className="rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--primary)]">
              {activeCount} ativo{activeCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </button>
        {activeCount > 0 && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-[color:var(--muted-foreground)] underline-offset-2 hover:underline"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
