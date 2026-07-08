"use client";

import { use } from "react";
import { FinanceProjectDetailPageContent } from "@/components/finance/FinanceProjectDetailPageContent";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default function AdminFinanceiroProjetoDetailPage({ params }: PageProps) {
  const { projectId } = use(params);
  return <FinanceProjectDetailPageContent projectId={projectId} />;
}
