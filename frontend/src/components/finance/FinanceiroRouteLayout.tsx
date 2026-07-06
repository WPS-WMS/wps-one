"use client";

import type { ReactNode } from "react";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";

/** Layout de rotas financeiras — bloqueia acesso fora do build QA. */
export function FinanceiroRouteLayout({ children }: { children: ReactNode }) {
  if (!isFinanceiroModuleEnabled()) {
    return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  }
  return <>{children}</>;
}
