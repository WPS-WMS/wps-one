"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConsultorCategoriasFinanceirasRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/consultor/configuracoes/financeiro/plano-contas?tab=DESPESA");
  }, [router]);
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando para Plano de contas…</p>
    </div>
  );
}
