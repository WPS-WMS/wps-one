"use client";

import { use } from "react";
import { FinanceProjectDetailPageContent } from "@/components/finance/FinanceProjectDetailPageContent";
import { useFinanceProjectId } from "@/lib/financeProjectRoute";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function AdminFinanceiroProjetoDetailPage({ params }: PageProps) {
  const { projectId } = use(params);
  const resolvedProjectId = useFinanceProjectId(projectId);
  return <FinanceProjectDetailPageContent projectId={resolvedProjectId} />;
}
