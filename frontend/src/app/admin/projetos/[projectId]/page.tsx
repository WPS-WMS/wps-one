"use client";

import { use, useEffect, useMemo, useState } from "react";
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
  const membros: Array<{ id?: string; name: string; email?: string; avatarUrl?: string | null }> =
    responsibles.length > 0
      ? responsibles.map((u) => ({
          id: (u as { id?: string }).id,
          name: u.name,
          email: (u as { email?: string }).email,
          avatarUrl: (u as { avatarUrl?: string | null }).avatarUrl ?? null,
        }))
      : project.createdBy
        ? [
            {
              id: (project.createdBy as { id?: string }).id,
              name: project.createdBy.name,
              email: (project.createdBy as { email?: string }).email,
              avatarUrl: (project.createdBy as { avatarUrl?: string | null }).avatarUrl ?? null,
            },
          ]
        : [];
  const horasPlanejamento = getHorasPlanejamentoByTipo(project);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header className="flex-shrink-0 border-b px-4 py-4 md:px-6 md:py-5 flex items-center justify-between bg-[color:var(--surface)]/80 backdrop-blur-xl" style={{ borderColor: "var(--border)" }}>
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
          onClick={() => router.push("/admin/projetos?tab=" + fromTab)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </header>
      <main className="flex-1 p-4 md:p-6 min-h-0 overflow-auto space-y-6">
        <section className="rounded-2xl border p-4 md:p-5 space-y-5 w-full bg-[color:var(--surface)]/80 backdrop-blur" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Visão geral</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Início</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
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
                            avatarVersion={(u as { updatedAt?: string | Date }).updatedAt}
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
                    {membros.length > 6 && (
                      <div className="relative -ml-1">
                        <div className="group">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-[11px] font-semibold ring-2 ring-white">
                            +{membros.length - 6}
                          </div>
                          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
                            <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
                              {membros.length - 6} membro(s) a mais
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[color:var(--muted-foreground)]">—</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Descrição</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--foreground)] whitespace-pre-wrap">
                {project.description ?? "—"}
              </p>
            </div>
            <div className="lg:col-span-4 space-y-3">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Cliente</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">{project.client?.name ?? "—"}</p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Prioridade</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                  {project.prioridade
                    ? PRIORIDADE_LABELS[project.prioridade === "CRITICA" ? "URGENTE" : project.prioridade] ??
                      (project.prioridade === "CRITICA" ? "Urgente" : project.prioridade)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{horasPlanejamento.label}</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                  {horasPlanejamento.value != null ? horasPlanejamento.value : "—"}
                </p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Data prevista de término</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                {project.dataFimPrevista
                  ? new Date(project.dataFimPrevista).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
                </p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)" }}>
                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Criado em</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
                  {new Date(project.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        </section>

        <ProjectPropostaComercialReadonly project={project} />

        <ProjectAmsSlaReadonly project={project} />

        {project.tipoProjeto === "AMS" && (
          <section
            className="rounded-2xl border p-4 md:p-5 space-y-4 w-full bg-[color:var(--surface)]/80 backdrop-blur"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Resumo AMS – Horas Mensais
            </h2>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Controle de horas contratadas, banco de horas e excedentes por mês para este
              projeto AMS.
            </p>
            {amsError && (
              <p className="text-xs text-red-600">
                {amsError}
              </p>
            )}
            {amsLoading && !amsError && (
              <p className="text-xs text-[color:var(--muted-foreground)]">Carregando resumo de horas...</p>
            )}
            {!amsLoading && !amsError && amsResumo.length === 0 && (
              <p className="text-xs text-[color:var(--muted-foreground)]">
                Ainda não há apontamentos de horas para este projeto.
              </p>
            )}
            {!amsLoading && !amsError && amsResumo.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-[color:var(--muted-foreground)]">
                        Mês / Ano
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[color:var(--muted-foreground)]">
                        Horas contratadas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[color:var(--muted-foreground)]">
                        Banco inicial
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[color:var(--muted-foreground)]">
                        Horas consumidas
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[color:var(--muted-foreground)]">
                        Saldo banco
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[color:var(--muted-foreground)]">
                        Excedentes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {amsResumo.map((mes) => (
                      <tr
                        key={mes.key}
                        className="border-t"
                        style={{
                          borderColor: "var(--border)",
                          background: mes.excedentes > 0 ? "rgba(220, 38, 38, 0.10)" : "transparent",
                        }}
                      >
                        <td className="px-3 py-2 text-[color:var(--foreground)]">{mes.label}</td>
                        <td className="px-3 py-2 text-right text-[color:var(--foreground)]">
                          {mes.contratadas.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-[color:var(--foreground)]">
                          {mes.bancoInicial.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-[color:var(--foreground)]">
                          {mes.consumidas.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right text-[color:var(--foreground)]">
                          {mes.saldoBanco.toFixed(1)}h
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[color:var(--foreground)]">
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
