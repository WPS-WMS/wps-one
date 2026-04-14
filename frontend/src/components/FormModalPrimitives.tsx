"use client";

import type { ReactNode } from "react";

export const formModalBackdropClass =
  "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4";

/** Painel para formulários extensos (ex.: cadastro de cliente). */
export const formModalPanelWideClass =
  "bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] w-full max-w-3xl max-h-[min(92vh,920px)] shadow-lg flex flex-col overflow-hidden";

/** Painel médio (ex.: criar/editar tópico). */
export const formModalPanelNarrowClass =
  "bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] w-full max-w-lg max-h-[min(92vh,720px)] shadow-2xl flex flex-col overflow-hidden";

export function FormModalSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--border)]/90 bg-[color:var(--background)]/25 p-4 md:p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">{title}</h3>
        {description ? (
          <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export const formModalLabelClass =
  "block text-sm font-medium text-[color:var(--muted-foreground)] mb-1.5";

export function formModalInputClass(hasError?: boolean) {
  const base =
    "w-full px-4 py-3 rounded-xl border bg-[color:var(--surface)] text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2";
  return hasError
    ? `${base} border-red-500 focus:ring-red-500/40`
    : `${base} border-[color:var(--border)] focus:ring-[color:var(--primary)]/35`;
}
