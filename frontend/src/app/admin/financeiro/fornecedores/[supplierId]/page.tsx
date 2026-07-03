"use client";

import { use, useMemo } from "react";
import { usePathname } from "next/navigation";
import { SupplierDetailPageContent } from "@/components/finance/SupplierDetailPageContent";

type PageProps = {
  params: Promise<{ supplierId: string }>;
};

export default function AdminFinanceiroFornecedorDetalhePage({ params }: PageProps) {
  const { supplierId } = use(params);
  const pathname = usePathname();

  const resolvedId = useMemo(() => {
    if (supplierId && supplierId !== "_") return supplierId;
    const parts = pathname.split("/").filter(Boolean);
    const idFromPath = parts[parts.length - 1];
    return idFromPath && idFromPath !== "_" ? idFromPath : "";
  }, [supplierId, pathname]);

  return <SupplierDetailPageContent supplierId={resolvedId} />;
}
