"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
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

export default function ProjetoDetalheAdminPage({ params }: PageProps) {
  const routeParams = use(params);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? routeParams.projectId;
  const router = useRouter();
  const [project, setProject] = useState<ProjectForCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [amsLoading, setAmsLoading] = useState(false);
  const [amsError, setAmsError] = useState<string | null>(null);
  const [amsEntries, setAmsEntries] = useState<
    Array<{ date: string; totalHoras: number }>
  >([]);
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

  useEffect(() => {
    if (!project || project.tipoProjeto !== "AMS") return;
    setAmsLoading(true);
    setAmsError(null);
    apiFetch(`/api/time-entries?projectId=${project.id}&view=project`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error ?? "Erro ao carregar horas AMS");
        }
        return r.json();
      })
      .then((entries: Array<{ date: string; totalHoras: number }>) => {
        setAmsEntries(
          entries.map((e) => ({
            date: e.date,
            totalHoras: e.totalHoras,
          })),
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Erro ao carregar horas AMS";
        setAmsError(msg);
      })
      .finally(() => setAmsLoading(false));
  }, [project]);

  const amsResumo = useMemo(() => {
    if (!project || project.tipoProjeto !== "AMS" || amsEntries.length === 0) return [];

    const horasMensais = project.horasMensaisAMS ?? 0;
    let bancoAnterior = project.bancoHorasInicial ?? 0;

    // Agrupa por ano-mês
    const porMes = new Map<string, number>();
    for (const entry of amsEntries) {
      const d = new Date(entry.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      porMes.set(key, (porMes.get(key) ?? 0) + (entry.totalHoras ?? 0));
    }

    const keysOrdenadas = Array.from(porMes.keys()).sort();
    const resumo: Array<{
      key: string;
      label: string;
      contratadas: number;
      bancoInicial: number;
      consumidas: number;
      saldoBanco: number;
      excedentes: number;
    }> = [];

    for (const key of keysOrdenadas) {
      const [anoStr, mesStr] = key.split("-");
      const ano = Number(anoStr);
      const mes = Number(mesStr);
      const consumidas = porMes.get(key) ?? 0;
      const contratadas = horasMensais;
      const bancoInicial = bancoAnterior;
      const totalDisponivel = contratadas + bancoInicial;

      let excedentes = 0;
      let saldoBanco = 0;
      if (consumidas <= totalDisponivel) {
        excedentes = 0;
        saldoBanco = totalDisponivel - consumidas;
      } else {
        excedentes = consumidas - totalDisponivel;
        saldoBanco = 0;
      }

      const dataRef = new Date(ano, mes - 1, 1);
      const label = dataRef.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });

      resumo.push({
        key,
        label,
        contratadas,
        bancoInicial,
        consumidas,
        saldoBanco,
        excedentes,
      });

      bancoAnterior = saldoBanco;
    }

    return resumo;
  }, [project, amsEntries]);

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
          onClick={() => router.push("/admin/projetos?tab=" + fromTab)}
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
          onClick={() => router.push("/admin/projetos?tab=" + fromTab)}
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

        {project.tipoProjeto === "AMS" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-4 w-full">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Resumo AMS – Horas Mensais
            </h2>
            <p className="text-xs text-slate-500">
              Controle de horas contratadas, banco de horas e excedentes por mês para este
              projeto AMS.
            </p>
            {amsError && (
              <p className="text-xs text-red-600">
                {amsError}
              </p>
            )}
            {amsLoading && !amsError && (
              <p className="text-xs text-slate-500">Carregando resumo de horas...</p>
            )}
            {!amsLoading && !amsError && amsResumo.length === 0 && (
              <p className="text-xs text-slate-500">
                Ainda não há apontamentos de horas para este projeto.
              </p>
            )}
            {!amsLoading && !amsError && amsResumo.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">
                        Mês / Ano
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        Horas contratadas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        Banco inicial
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        Horas consumidas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        Saldo banco
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        Excedentes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {amsResumo.map((mes) => (
                      <tr
                        key={mes.key}
                        className={
                          mes.excedentes > 0
                            ? "bg-rose-50/60"
                            : "hover:bg-slate-50/60"
                        }
                      >
                        <td className="px-3 py-2 text-slate-800">{mes.label}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {mes.contratadas.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {mes.bancoInicial.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {mes.consumidas.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {mes.saldoBanco.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800">
                          {mes.excedentes.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
