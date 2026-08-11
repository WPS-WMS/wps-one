"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Categorias financeiras foram unificadas em Plano de contas > Despesas. */
export default function AdminCategoriasFinanceirasRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/configuracoes/financeiro/plano-contas?tab=DESPESA");
  }, [router]);
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando para Plano de contas…</p>
    </div>
  );
}
