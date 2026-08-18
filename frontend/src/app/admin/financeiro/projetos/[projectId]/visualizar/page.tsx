"use client";

import { use } from "react";
import { FinanceProjectViewPageContent } from "@/components/finance/FinanceProjectViewPageContent";
import { useFinanceProjectId } from "@/lib/financeProjectRoute";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function AdminFinanceiroProjetoVisualizarPage({ params }: PageProps) {
  const { projectId } = use(params);
  const resolvedProjectId = useFinanceProjectId(projectId);
  return <FinanceProjectViewPageContent projectId={resolvedProjectId} />;
}
