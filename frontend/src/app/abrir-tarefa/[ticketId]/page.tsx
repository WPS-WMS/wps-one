"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function basePathForTicketDeepLink(role: string): string {
  if (role === "CLIENTE") return "/cliente";
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  if (role === "CONSULTOR" || role === "ADMIN_PORTAL") return "/consultor";
  return "";
}

/**
 * Com static export + rewrite Firebase (`/abrir-tarefa/**` → `_.html`), o router do Next
 * pode reportar `usePathname()` como `/abrir-tarefa/_`. O ID correto está em `window.location`
 * e, nos e-mails, também em `?ticketId=` como redundância.
 */
function parseTicketId(pathname: string, search: string): string {
  const m = pathname.match(/\/abrir-tarefa\/([^/?#]+)/);
  let raw = (m?.[1] ?? "").trim();
  if (raw === "_") raw = "";
  if (!raw && typeof search === "string" && search.length > 0) {
    try {
      const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      raw = (q.get("ticketId") || q.get("id") || "").trim();
    } catch {
      /* ignore */
    }
  }
  if (!raw || raw === "_") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function AbrirTarefaPage() {
  const pathname = usePathname();
  /** `null` = ainda não lemos `window` (evita mismatch SSR/hidratação e uso de `_` do router). */
  const [ticketId, setTicketId] = useState<string | null>(null);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const fromWindow =
      typeof window !== "undefined"
        ? parseTicketId(window.location.pathname, window.location.search)
        : "";
    const fromNext = parseTicketId(pathname ?? "", "");
    const id = fromWindow || fromNext;
    setTicketId(id || "");
  }, [pathname]);

  useEffect(() => {
    if (ticketId === null) return;
    if (!ticketId) {
      setError("Link inválido ou incompleto. Abra o chamado a partir do botão no e-mail ou copie o endereço completo.");
      return;
    }
    if (loading) return;
    if (!user) {
      const qs = typeof window !== "undefined" ? window.location.search : "";
      const redirectPath = `/abrir-tarefa/${encodeURIComponent(ticketId)}${qs}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }
    const base = basePathForTicketDeepLink(user.role);
    if (!base) {
      setError("Este perfil não pode abrir tarefas por link. Entre com uma conta de consultor, gestor, administrador ou cliente.");
      return;
    }

    // Só redireciona para a Lista de Tarefas (sem chamada à API nem query): evita erros de permissão
    // ou de rota e mantém o fluxo do e-mail o mais simples possível.
    router.replace(`${base}/projetos/lista-tarefas`);
  }, [loading, user, router, ticketId]);

  if (ticketId === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
        <p className="text-sm text-[color:var(--muted-foreground)]">Abrindo tarefa…</p>
      </div>
    );
  }

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
