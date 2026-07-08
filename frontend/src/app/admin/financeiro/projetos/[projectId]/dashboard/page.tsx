"use client";

import { use } from "react";
import { FinanceProjectDashboardPageContent } from "@/components/finance/FinanceProjectDashboardPageContent";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function AdminFinanceiroProjetoDashboardPage({ params }: PageProps) {
  const { projectId } = use(params);
  return <FinanceProjectDashboardPageContent projectId={projectId} />;
}
