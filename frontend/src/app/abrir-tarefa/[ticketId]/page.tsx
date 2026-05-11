"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

function basePathForTicketDeepLink(role: string): string {
  if (role === "CLIENTE") return "/cliente";
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  if (role === "CONSULTOR" || role === "ADMIN_PORTAL") return "/consultor";
  return "";
}

/** Com static export + rewrite para `_.html`, `use(params)` fica com o placeholder `_`. O ID real está na URL. */
function parseTicketIdFromPathname(pathname: string | null): string {
  if (!pathname) return "";
  const m = pathname.match(/\/abrir-tarefa\/([^/?#]+)/);
  if (!m?.[1]) return "";
  const raw = m[1].trim();
  if (!raw || raw === "_") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function AbrirTarefaPage() {
  const pathname = usePathname();
  const ticketId = useMemo(() => parseTicketIdFromPathname(pathname), [pathname]);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) {
      setError("Link inválido ou incompleto. Abra o chamado a partir do botão no e-mail ou copie o endereço completo.");
      return;
    }
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/abrir-tarefa/${ticketId}`)}`);
      return;
    }
    const base = basePathForTicketDeepLink(user.role);
    if (!base) {
      setError("Este perfil não pode abrir tarefas por link. Entre com uma conta de consultor, gestor, administrador ou cliente.");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/tickets/${encodeURIComponent(ticketId)}`);
        const body = (await res.json().catch(() => ({}))) as { error?: string; projectId?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(String(body?.error ?? "Não foi possível abrir a tarefa."));
          return;
        }
        const projectId = String(body.projectId ?? "").trim();
        if (!projectId) {
          setError("Tarefa sem projeto associado.");
          return;
        }
        router.replace(
          `${base}/projetos/${encodeURIComponent(projectId)}/tarefas/${encodeURIComponent(ticketId)}`,
        );
      } catch {
        if (!cancelled) setError("Erro de conexão. Tente novamente.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, router, ticketId]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-[color:var(--background)]">
        <p className="text-sm text-red-600 text-center max-w-md">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-sm font-medium"
        >
          Ir para início
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
      <p className="text-sm text-[color:var(--muted-foreground)]">Abrindo tarefa…</p>
    </div>
  );
}
