"use client";

import type { ReactNode } from "react";
import { reportsInputClass, reportsSelectClass } from "@/components/reports/ReportsPrimitives";

export function defaultReportStart(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export function defaultReportEnd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatReportCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinancialReportPeriodFilter({
  start,
  end,
  onStartChange,
  onEndChange,
  extra,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">De</label>
        <input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} className={reportsInputClass} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Até</label>
        <input type="date" value={end} onChange={(e) => onEndChange(e.target.value)} className={reportsInputClass} />
      </div>
      {extra}
    </div>
  );
}

export function FinancialKpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-[color:var(--foreground)]";
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
      <p className="text-[color:var(--muted-foreground)] text-sm">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}

export { reportsSelectClass };
