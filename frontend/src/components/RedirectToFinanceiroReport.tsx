"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Redireciona URLs antigas `/relatorios/financeiro/*` para `/financeiro/*`. */
export function RedirectToFinanceiroReport({ suffix }: { suffix: string }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const base = pathname.startsWith("/gestor")
      ? "/gestor"
      : pathname.startsWith("/consultor")
        ? "/consultor"
        : "/admin";
    router.replace(`${base}/financeiro/${suffix}`);
  }, [pathname, router, suffix]);

  return (
    <p className="p-6 text-sm text-[color:var(--muted-foreground)]">Redirecionando…</p>
  );
}
