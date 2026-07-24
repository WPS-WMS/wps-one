"use client";

import type { ReactNode } from "react";

export function ReportsPageShell({
  title,
  subtitle,
  children,
  right,
  wide = false,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  /** Conteúdo mais largo (ex.: grades mensais sem scroll horizontal). */
  wide?: boolean;
  /** Quando definido, aplica o header no padrão visual do Financeiro WPSone. */
  eyebrow?: string;
}) {
  const contentMax = wide ? "w-full max-w-none" : "max-w-6xl";
  const financeLook = Boolean(eyebrow);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header
        className={
          financeLook
            ? "relative flex-shrink-0 overflow-hidden border-b bg-[color:var(--surface)]"
            : "flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl"
        }
        style={{ borderColor: "var(--border)" }}
      >
        {financeLook ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-1"
              style={{
                background: "linear-gradient(180deg, var(--wps-purple-600), var(--wps-purple-900))",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full opacity-[0.08]"
              style={{ background: "radial-gradient(circle, var(--wps-purple-600), transparent 70%)" }}
              aria-hidden
            />
          </>
        ) : null}
        <div
          className={`${contentMax} mx-auto flex items-end justify-between gap-4 ${
            financeLook ? "relative px-4 py-4 pl-5 md:px-6 md:py-5 md:pl-7" : ""
          }`}
        >
          <div className="min-w-0">
            {financeLook && eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--primary)]">
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={
                financeLook
                  ? `${eyebrow ? "mt-0.5" : ""} text-xl font-semibold tracking-tight text-[color:var(--foreground)]`
                  : "text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--foreground)]"
              }
            >
              {title}
            </h1>
            {subtitle ? (
              <p
                className={
                  financeLook
                    ? "mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]"
                    : "text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 leading-relaxed"
                }
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {right ? <div className="flex-shrink-0">{right}</div> : null}
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto md:py-5">
        <div className={`${contentMax} mx-auto`}>{children}</div>
      </main>
    </div>
  );
}

/** Fundo lilás dos painéis de filtro (mesmo padrão da Lista de Tarefas). */
export const reportsFilterPanelBackground =
  "linear-gradient(135deg, rgba(92,0,225,0.08), rgba(0,0,0,0.02))";

export function ReportsCard({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  /** `filter` aplica o gradiente lilás usado nas barras de filtro. */
  tone?: "default" | "filter";
}) {
  return (
    <div
      className={
        "rounded-2xl border shadow-sm " +
        (tone === "filter" ? "" : "bg-[color:var(--surface)] ") +
        className
      }
      style={{
        borderColor: "var(--border)",
        ...(tone === "filter" ? { background: reportsFilterPanelBackground } : {}),
      }}
    >
      {children}
    </div>
  );
}

export function ReportsCardHeader({
  title,
  right,
}: {
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className="px-4 py-3 border-b flex items-center justify-between gap-3"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-sm font-semibold text-[color:var(--foreground)]">{title}</p>
      {right ? <div className="text-xs text-[color:var(--muted-foreground)]">{right}</div> : null}
    </div>
  );
}

export function ReportsEmpty({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="p-6 text-sm text-[color:var(--muted-foreground)]">{children}</div>
  );
}

export const reportsInputClass =
  "w-full rounded-xl border bg-[color:var(--input-bg)] py-2 px-3 text-sm text-[color:var(--input-fg)] " +
  "focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35";

export const reportsSelectClass =
  reportsInputClass + " appearance-none cursor-pointer";

export const reportsPrimaryBtnClass =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] " +
  "shadow-sm transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed";

export const reportsSecondaryBtnClass =
  "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed";

