"use client";

import type { ReactNode } from "react";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";

/** Bloqueia telas financeiras fora do build QA. */
export function FinanceiroModuleGuard({ children }: { children: ReactNode }) {
  if (!isFinanceiroModuleEnabled()) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="text-xs font-semibold text-[color:var(--muted-foreground)] tracking-wider">404</div>
          <h1 className="mt-2 text-xl font-bold text-[color:var(--foreground)]">Módulo indisponível</h1>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
            O financeiro está habilitado apenas no ambiente de QA.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
