"use client";

import { use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

function readQueryFlag(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  try {
    return String(new URLSearchParams(window.location.search).get(name) ?? "").trim();
  } catch {
    return "";
  }
}

export default function TarefaDetalhePage({ params }: PageProps) {
  const { projectId: routeProjectId, ticketId: routeTicketId } = use(params);
  const pathname = usePathname();
  const router = useRouter();

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
  const [from, setFrom] = useState("");
  const [focusComments, setFocusComments] = useState(false);

  useLayoutEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : (pathname ?? "");
    const fromPath = parseIdsFromPath(path);
    const qPid = readQueryParam("projectId");
    const qTid = readQueryParam("ticketId");
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
    setFrom(readQueryParam("from"));
    setFocusComments(readQueryFlag("focusComments"));
  }, [pathname, routeProjectId, routeTicketId]);

  const [ticket, setTicket] = useState<PackageTicket | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = useCallback(() => {
    if (from === "lista-tarefas") {
      router.push(listaTarefasHref);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando tarefa…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando tarefa...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[color:var(--muted-foreground)]">A ir para a lista de tarefas…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--background)]">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{
          borderColor: "var(--border)",
          background: "rgba(0,0,0,0.06)",
          color: "var(--foreground)",
        }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)]/70 px-4 py-3 backdrop-blur md:px-6 md:py-4">
        <div className="mx-auto w-full max-w-7xl pr-28">
          <h1 className="truncate text-xl font-semibold text-[color:var(--foreground)] md:text-2xl">
            {headerTitle}
          </h1>
          {headerSubtitle ? (
            <p className="mt-1 truncate text-xs text-[color:var(--muted-foreground)] md:text-sm">
              {headerSubtitle}
            </p>
          ) : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-col p-3 md:p-6" style={{ minHeight: "calc(100vh - 5.5rem)" }}>
          <EditTaskModalFull
            presentation="page"
            ticket={ticket}
            projectId={String(ticket.projectId ?? projectId ?? "")}
            projectName={ticket.project?.name}
            initialFocusComments={focusComments}
            onClose={handleBack}
            onSaved={() => void loadTicket()}
          />
        </div>
      </main>
    </div>
  );
}
