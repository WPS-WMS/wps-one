"use client";

import { use } from "react";
import { FinanceProjectDashboardPageContent } from "@/components/finance/FinanceProjectDashboardPageContent";
import { useFinanceProjectId } from "@/lib/financeProjectRoute";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function AdminFinanceiroProjetoDashboardPage({ params }: PageProps) {
  const { projectId } = use(params);
  const resolvedProjectId = useFinanceProjectId(projectId);
  return <FinanceProjectDashboardPageContent projectId={resolvedProjectId} />;
}
