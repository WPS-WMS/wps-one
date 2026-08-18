"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Redireciona rotas legadas para a lista de clientes. */
export default function ClientesFinanceirosRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  useEffect(() => {
    router.replace(`${basePath}/clientes`);
  }, [router, basePath]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando...</p>
    </div>
  );
}
