"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function ClienteFinanceiroDetalheRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean);
    const clientId = parts[parts.length - 1];
    if (clientId && clientId !== "_") {
      router.replace(`${basePath}/clientes/${clientId}`);
    } else {
      router.replace(`${basePath}/clientes`);
    }
  }, [router, basePath, pathname]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Redirecionando...</p>
    </div>
  );
}
