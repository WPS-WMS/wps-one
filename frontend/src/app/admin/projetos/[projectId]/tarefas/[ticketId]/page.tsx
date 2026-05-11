"use client";

import { use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { EditTaskModalFull } from "@/components/EditTaskModalFull";
import type { PackageTicket } from "@/components/PackageCard";

type PageProps = {
  params: Promise<{ projectId: string; ticketId: string }>;
};

function decodeSeg(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Com static export + `_.html`, `use(params)` pode vir como `_`; o browser mantém os IDs reais no path. */
function parseIdsFromPath(path: string): { projectId: string; ticketId: string } {
  const m = path.match(/\/projetos\/([^/]+)\/tarefas\/([^/?#]+)/);
  const p = (m?.[1] ?? "").trim();
  const t = (m?.[2] ?? "").trim();
  return {
    projectId: p && p !== "_" ? decodeSeg(p) : "",
    ticketId: t && t !== "_" ? decodeSeg(t) : "",
  };
}

export default function TarefaDetalhePage({ params }: PageProps) {
  const { projectId: routeProjectId, ticketId: routeTicketId } = use(params);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchKey = searchParams.toString();

  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const listaTarefasHref = `${basePath}/projetos/lista-tarefas`;

  /** `null` = ainda não sincronizámos com `window.location` (evita redirect com `""` antes do layout). */
  const [projectId, setProjectId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const from = searchParams.get("from") ?? "";

  useLayoutEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : (pathname ?? "");
    const fromPath = parseIdsFromPath(path);
    const qPid = (searchParams.get("projectId") ?? "").trim();
    const qTid = (searchParams.get("ticketId") ?? "").trim();
    const pid =
      (qPid && qPid !== "_" ? decodeSeg(qPid) : "") ||
      fromPath.projectId ||
      (String(routeProjectId).trim() !== "_" ? String(routeProjectId).trim() : "");
    const tid =
      (qTid && qTid !== "_" ? decodeSeg(qTid) : "") ||
      fromPath.ticketId ||
      (String(routeTicketId).trim() !== "_" ? String(routeTicketId).trim() : "");
    setProjectId(pid);
    setTicketId(tid);
  }, [pathname, searchKey, routeProjectId, routeTicketId, searchParams]);

  const [ticket, setTicket] = useState<PackageTicket | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = useCallback(() => {
    if (from === "lista-tarefas") {
      router.push(listaTarefasHref);
      return;
    }
    const pid = projectId ?? "";
    router.push(`${basePath}/projetos/_?projectId=${encodeURIComponent(pid)}`);
  }, [router, basePath, from, projectId, listaTarefasHref]);

  const loadTicket = useCallback(async () => {
    if (ticketId === null || projectId === null) return;
    let didRedirect = false;
    if (!ticketId) {
      didRedirect = true;
      router.replace(listaTarefasHref);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tickets/${encodeURIComponent(ticketId)}`);
      if (!res.ok) {
        didRedirect = true;
        router.replace(listaTarefasHref);
        return;
      }
      const data = (await res.json()) as PackageTicket;
      setTicket(data);
    } catch {
      didRedirect = true;
      router.replace(listaTarefasHref);
      return;
    } finally {
      if (!didRedirect) setLoading(false);
    }
  }, [ticketId, projectId, router, listaTarefasHref]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const headerTitle = useMemo(() => {
    if (!ticket) return "Tarefa";
    return ticket.type === "SUBPROJETO" ? ticket.title : `#${ticket.code} · ${ticket.title}`;
  }, [ticket]);

  const headerSubtitle = useMemo(() => {
    if (!ticket) return "";
    const projectName = ticket.project?.name ? `Projeto: ${ticket.project.name}` : "";
    const clientName = ticket.project?.client?.name ? `Cliente: ${ticket.project.client.name}` : "";
    return [projectName, clientName].filter(Boolean).join(" · ");
  }, [ticket]);

  if (projectId === null || ticketId === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando tarefa…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando tarefa...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">A ir para a lista de tarefas…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 bg-[color:var(--surface)]/60 backdrop-blur border-b border-[color:var(--border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)] truncate">
              {headerTitle}
            </h1>
            {headerSubtitle ? (
              <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 truncate">
                {headerSubtitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            title="Voltar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
            style={{
              borderColor: "var(--border)",
              background: "rgba(0,0,0,0.06)",
              color: "var(--foreground)",
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <EditTaskModalFull
            ticket={ticket}
            projectId={String(ticket.projectId ?? projectId ?? "")}
            projectName={ticket.project?.name}
            onClose={handleBack}
            onSaved={() => void loadTicket()}
          />
        </div>
      </main>
    </div>
  );
}

