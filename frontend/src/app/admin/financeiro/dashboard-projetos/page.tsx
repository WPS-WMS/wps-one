"use client";

import { Suspense } from "react";
import { FinanceProjectsDashboardHubContent } from "@/components/finance/FinanceProjectsDashboardHubContent";

export default function AdminFinanceiroDashboardProjetosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[color:var(--muted-foreground)]">Carregando…</div>}>
      <FinanceProjectsDashboardHubContent />
    </Suspense>
  );
}
