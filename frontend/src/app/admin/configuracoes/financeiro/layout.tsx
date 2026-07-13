"use client";

import { usePathname } from "next/navigation";
import { FinanceiroRouteLayout } from "@/components/finance/FinanceiroRouteLayout";

/** Hub `/configuracoes/financeiro` fica fora do gate; demais subrotas exigem o módulo. */
export default function ConfigFinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub =
    pathname === "/admin/configuracoes/financeiro" ||
    pathname === "/gestor/configuracoes/financeiro" ||
    pathname === "/consultor/configuracoes/financeiro";

  if (isHub) return <>{children}</>;
  return <FinanceiroRouteLayout>{children}</FinanceiroRouteLayout>;
}
