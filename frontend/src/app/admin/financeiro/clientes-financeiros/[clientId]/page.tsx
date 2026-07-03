"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ClientFinancialConfig } from "@/components/finance/ClientFinancialConfig";

type PageProps = {
  params: Promise<{ clientId: string }>;
};

export default function AdminFinanceiroClienteFinanceiroDetalhePage({ params }: PageProps) {
  const { clientId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => can("financeiro.clientesFinanceiros"), [can]);

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const resolvedClientId = useMemo(() => {
    if (clientId && clientId !== "_") return clientId;
    const parts = pathname.split("/").filter(Boolean);
    const idFromPath = parts[parts.length - 1];
    return idFromPath && idFromPath !== "_" ? idFromPath : "";
  }, [clientId, pathname]);

  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!resolvedClientId) {
      setError("Cliente inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/clients/${resolvedClientId}/financial`);
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Cliente não encontrado.");
      }
      setClientName(String(data?.client?.name ?? "Cliente"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar cliente.");
    } finally {
      setLoading(false);
    }
  }, [resolvedClientId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  if (!permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-[color:var(--muted-foreground)]">
        Carregando...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Acesso negado.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 text-sm text-[color:var(--muted-foreground)]">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => router.push(`${basePath}/financeiro/clientes-financeiros`)}
          className="self-start inline-flex items-center gap-1 text-sm text-[color:var(--muted-foreground)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => router.push(`${basePath}/financeiro/clientes-financeiros`)}
            className="inline-flex items-center gap-1 text-xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] mb-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Clientes financeiros
          </button>
          <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)]">{clientName}</h1>
          <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1">Dados financeiros do cliente</p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ClientFinancialConfig clientId={resolvedClientId} />
        </div>
      </main>
    </div>
  );
}
