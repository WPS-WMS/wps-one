"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { type ProjectForCard } from "@/components/ProjectCard";
import { ProjectAmsSlaReadonly } from "@/components/ProjectAmsSlaReadonly";
import { ProjectPropostaComercialReadonly } from "@/components/ProjectPropostaComercialReadonly";

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
  FIXED_PRICE: "Fixed Price",
  AMS: "AMS",
  TIME_MATERIAL: "Time & Material",
};

function getTipoProjetoLabel(tipo: string | null | undefined): string {
  if (!tipo) return "Interno";
  return TIPO_PROJETO_LABELS[tipo] || tipo;
}

function getIniciais(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
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

export default function ProjetoDetalheConsultorPage({ params }: PageProps) {
  const routeParams = use(params);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? routeParams.projectId;
  const router = useRouter();
  const { user } = useAuth();
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
      .then((p: ProjectForCard) => {
        setProject(p);
      })
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
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          ← Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Projeto não encontrado"}</p>
      </div>
    );
  }

  // Filtrar apenas tarefas (excluir tópicos e subtarefas)
  const tarefas = project.tickets?.filter((t) => t.type !== "SUBPROJETO" && t.type !== "SUBTAREFA") ?? [];
  const totalTarefas = tarefas.length;
  const responsibles = project.responsibles?.map((r) => r.user) ?? [];
  const horasPlanejamento = getHorasPlanejamentoByTipo(project);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-800">{project.name}</h1>
            {project.tipoProjeto && (
              <span className="wps-projeto-tipo-badge inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">
                {getTipoProjetoLabel(project.tipoProjeto)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {project.client?.name ?? "—"} · {totalTarefas} tarefas
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          ← Voltar
        </button>
      </header>
      <main className="flex-1 p-4 md:p-6 min-h-0 overflow-auto space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-4 w-full">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Informações</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Nome do Projeto</p>
              <p className="font-medium text-slate-800">{project.name}</p>
            </div>
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-medium text-slate-800">{project.client?.name ?? "—"}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="text-slate-500 mb-2">Responsável(is)</p>
              <div className="flex flex-wrap gap-2">
                {responsibles.length > 0 ? (
                  responsibles.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 rounded-full bg-slate-100 pl-1 pr-3 py-1 border border-slate-200"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">
                        {getIniciais(u.name)}
                      </span>
                      <span className="text-slate-800 truncate max-w-[120px]">{u.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">{project.createdBy?.name ?? "—"}</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-slate-500">Data de Início</p>
              <p className="font-medium text-slate-800">
                {project.dataInicio
                  ? new Date(project.dataInicio).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : project.createdAt
                    ? new Date(project.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Status Inicial</p>
              <p className="font-medium text-slate-800">
                {project.statusInicial ? STATUS_LABELS[project.statusInicial] ?? project.statusInicial : "—"}
              </p>
            </div>
          </div>

          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide pt-2">Mais informações</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <p className="text-slate-500">Descrição do Projeto</p>
              <p className="font-medium text-slate-800 whitespace-pre-wrap">{project.description ?? "—"}</p>
            </div>
            <div>
              <p className="text-slate-500">Data Prevista de Término</p>
              <p className="font-medium text-slate-800">
                {project.dataFimPrevista
                  ? new Date(project.dataFimPrevista).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Prioridade</p>
              <p className="font-medium text-slate-800">
                {project.prioridade
                  ? PRIORIDADE_LABELS[project.prioridade === "CRITICA" ? "URGENTE" : project.prioridade] ??
                    (project.prioridade === "CRITICA" ? "Urgente" : project.prioridade)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{horasPlanejamento.label}</p>
              <p className="font-medium text-slate-800">
                {horasPlanejamento.value != null ? horasPlanejamento.value : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Data de criação</p>
              <p className="font-medium text-slate-800">
                {new Date(project.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Total de tarefas</p>
              <p className="font-medium text-slate-800">{totalTarefas}</p>
            </div>
          </div>
        </section>

        <ProjectPropostaComercialReadonly project={project} />

        <ProjectAmsSlaReadonly project={project} />

      </main>
    </div>
  );
}
