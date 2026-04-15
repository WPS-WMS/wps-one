"use client";

import type { ReactNode } from "react";

export function ReportsPageShell({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header
        className="flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>
          {right ? <div className="flex-shrink-0">{right}</div> : null}
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function ReportsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border shadow-sm bg-[color:var(--surface)] " +
        className
      }
      style={{ borderColor: "var(--border)" }}
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

