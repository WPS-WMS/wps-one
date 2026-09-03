"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClienteProjetosArquivadosPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/cliente");
  }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-[color:var(--muted-foreground)] text-sm">
      A redirecionar…
    </div>
  );
}
