"use client";

import type { ReactNode } from "react";

export const financePrimaryBtnClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export const financeSecondaryBtnClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-[color:var(--surface)] px-3.5 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 disabled:pointer-events-none";

export const financePrimaryBtnStyle = {
  background:
    "linear-gradient(135deg, var(--wps-purple-600) 0%, color-mix(in srgb, var(--wps-purple-600) 65%, var(--wps-purple-900)) 100%)",
} as const;

type FinancePageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Default: Financeiro */
  eyebrow?: string;
  actions?: ReactNode;
  /** Conteúdo abaixo do subtítulo (ex.: nav links). */
  below?: ReactNode;
  /** card = bloco arredondado; bar = faixa full-bleed com border-b */
  variant?: "card" | "bar";
  className?: string;
  /** max-width do conteúdo interno (bar). Default max-w-6xl */
  contentClassName?: string;
};

export function FinancePageHeader({
  title,
  subtitle,
  eyebrow = "Financeiro",
  actions,
  below,
  variant = "card",
  className = "",
  contentClassName = "max-w-6xl",
}: FinancePageHeaderProps) {
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={`${eyebrow ? "mt-0.5" : ""} text-xl font-semibold tracking-tight text-[color:var(--foreground)]`}
        >
          {title}
        </h1>
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
        style={{ background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full opacity-[0.08]"
        style={{ background: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)" }}
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
