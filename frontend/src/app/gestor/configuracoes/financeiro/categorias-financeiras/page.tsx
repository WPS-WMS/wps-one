"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GestorCategoriasFinanceirasRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/gestor/configuracoes/financeiro/plano-contas?tab=DESPESA");
  }, [router]);
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando para Plano de contas…</p>
    </div>
  );
}
