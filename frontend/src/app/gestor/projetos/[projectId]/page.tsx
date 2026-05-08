"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { type ProjectForCard } from "@/components/ProjectCard";
import { ProjectAmsSlaReadonly } from "@/components/ProjectAmsSlaReadonly";
import { ProjectPropostaComercialReadonly } from "@/components/ProjectPropostaComercialReadonly";
import { Avatar } from "@/components/Avatar";
import { ArrowLeft, Calendar, ClipboardList, Flag, Users } from "lucide-react";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  EM_ESPERA: "Em espera",
  ENCERRADO: "Encerrado",
  // legado
  PLANEJADO: "Em espera",
  EM_ANDAMENTO: "Ativo",
  CONCLUIDO: "Encerrado",
};
const PRIORIDADE_LABELS: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};
const TIPO_PROJETO_LABELS: Record<string, string> = {
  INTERNO: "Interno",
  CUSTOS_OPERACIONAIS: "Custos Operacionais",
  FIXED_PRICE: "Projeto Fechado",
  AMS: "AMS",
  TIME_MATERIAL: "Time & Material",
};

function getTipoProjetoLabel(tipo: string | null | undefined): string {
  if (!tipo) return "Interno";
  return TIPO_PROJETO_LABELS[tipo] || tipo;
}

function getHorasPlanejamentoByTipo(project: ProjectForCard): { label: string; value: number | null } {
  const tipo = project.tipoProjeto ?? "INTERNO";
  if (tipo === "FIXED_PRICE") {
    return { label: "Limite de horas do escopo", value: project.limiteHorasEscopo ?? null };
  }
  if (tipo === "AMS") {
    return { label: "Horas mínimas contratadas por mês", value: project.horasMensaisAMS ?? null };
  }
  return { label: "Total de horas planejadas", value: project.totalHorasPlanejadas ?? null };
}

export default function ProjetoDetalheGestorPage({ params }: PageProps) {
  const routeParams = use(params);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? routeParams.projectId;
  const router = useRouter();
  const [project, setProject] = useState<ProjectForCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fromTab = searchParams.get("from") ?? "op2";

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error ?? "Erro ao carregar projeto");
        }
        return r.json();
      })
      .then((p: ProjectForCard) => setProject(p))
      .catch((err) => setError(err?.message ?? "Erro ao carregar projeto"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Carregando projeto...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button
          type="button"
          onClick={() => router.push("/gestor/projetos?tab=" + fromTab)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          ← Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Projeto não encontrado"}</p>
      </div>
    );
  }

  const tarefas = project.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
  const totalTarefas = tarefas.length;
  const responsavel = project.responsibles?.[0]?.user ?? null;
  const membros: Array<{ id?: string; name: string; email?: string; avatarUrl?: string | null; updatedAt?: string | Date }> =
    (project.members ?? []).map((m) => ({
      id: (m.user as { id?: string }).id,
      name: m.user.name,
      email: (m.user as { email?: string }).email,
      avatarUrl: (m.user as { avatarUrl?: string | null }).avatarUrl ?? null,
      updatedAt: (m.user as { updatedAt?: string | Date }).updatedAt,
    }));
  const horasPlanejamento = getHorasPlanejamentoByTipo(project);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header
        className="flex-shrink-0 border-b px-4 py-4 md:px-6 md:py-5 flex items-center justify-between bg-[color:var(--surface)]/80 backdrop-blur-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-[color:var(--foreground)] md:text-xl">{project.name}</h1>
            {project.tipoProjeto && (
              <span className="wps-projeto-tipo-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">
                {getTipoProjetoLabel(project.tipoProjeto)}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 text-[color:var(--muted-foreground)]">
            {project.client?.name ?? "—"} · {totalTarefas} tarefas
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/gestor/projetos?tab=" + fromTab)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 min-h-0 overflow-auto space-y-6">
        <section
          className="rounded-2xl border p-4 md:p-5 space-y-5 w-full bg-[color:var(--surface)]/80 backdrop-blur"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Visão geral</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Total de tarefas</p>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[color:var(--foreground)]">{totalTarefas}</p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Status inicial</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                {project.statusInicial ? STATUS_LABELS[project.statusInicial] ?? project.statusInicial : "—"}
              </p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Prioridade</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                {project.prioridade ? PRIORIDADE_LABELS[project.prioridade] ?? project.prioridade : "—"}
              </p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Criado por</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">{project.createdBy?.name ?? "—"}</p>
              <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
                {project.createdAt
                  ? new Date(project.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Responsável</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">{responsavel?.name ?? "—"}</p>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Membros</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center">
                {membros.length > 0 ? (
                  <>
                    {membros.slice(0, 6).map((u, idx) => (
                      <div key={u.id ?? `${u.name}-${idx}`} className="relative -ml-1 first:ml-0">
                        <div className="group">
                          <Avatar
                            name={u.name}
                            email={u.email}
                            avatarUrl={u.avatarUrl ?? null}
                            avatarVersion={u.updatedAt}
                            size={32}
                            className="ring-2 ring-white shadow-sm"
                            imgClassName="ring-2 ring-white shadow-sm"
                            fallbackClassName="text-xs"
                          />
                          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
                            <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
                              {u.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-[color:var(--muted-foreground)]">—</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              {horasPlanejamento.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)] tabular-nums">
              {horasPlanejamento.value != null ? horasPlanejamento.value.toLocaleString("pt-BR") : "—"}
            </p>
          </div>
        </section>

        {project.tipoProjeto === "AMS" && <ProjectAmsSlaReadonly project={project} />}
        <ProjectPropostaComercialReadonly project={project} />
      </main>
    </div>
  );
}

