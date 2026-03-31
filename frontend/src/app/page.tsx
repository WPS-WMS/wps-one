"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Usuário já autenticado continua indo direto para o seu dashboard.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.role === "CLIENTE") router.replace("/cliente");
    else if (user.role === "ADMIN") router.replace("/admin");
    else if (user.role === "GESTOR_PROJETOS") router.replace("/gestor");
    else router.replace("/consultor");
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-800/60 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 flex items-center justify-center text-slate-950 font-bold text-sm shadow-md">
              W
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">WPS One</p>
              <p className="text-[11px] text-slate-400 leading-tight">
                Gestão de projetos, horas e SLA em um só lugar.
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/80 px-4 py-1.5 text-sm font-medium text-slate-50 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-50 transition-colors"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:py-20">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Plataforma para consultorias, PMOs e times de serviço
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
              Organize projetos, chamados e horas em um fluxo único.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              O WPS One centraliza o dia a dia de times de serviço: projetos, chamados, tarefas,
              horas apontadas, contratos e indicadores de SLA em um só lugar, com uma experiência
              moderna pensada para uso contínuo.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
              >
                Entrar e começar a usar
              </Link>
              <p className="text-xs text-slate-400 max-w-xs">
                Acesso segmentado por tipos de perfil: cada pessoa vê apenas o que precisa, com
                áreas específicas para gestão, operação e clientes.
              </p>
            </div>
            <dl className="grid gap-4 text-sm text-slate-200 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Gestão de projetos
                </dt>
                <dd className="mt-1 text-sm">
                  Modele projetos internos, Fixed Price, AMS e T&amp;M, com horas contratadas,
                  banco de horas e escopo.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Chamados &amp; tarefas
                </dt>
                <dd className="mt-1 text-sm">
                  Backlog, em execução e finalizados, com status claros, histórico, comentários
                  públicos/internos e anexos.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Horas, SLA e relatórios
                </dt>
                <dd className="mt-1 text-sm">
                  Apontamento diário, consumo de horas, SLA por prioridade, relatórios para gestão e
                  faturamento.
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex-1">
            <div className="relative mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden">
              <div className="flex h-64">
                {/* Sidebar semelhante ao menu lateral do sistema */}
                <div className="w-24 border-right border-slate-800 bg-slate-900/95 p-3 flex flex-col gap-2 text-[10px] text-slate-300">
                  <div className="rounded-lg bg-slate-800/80 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Início</p>
                    <p className="text-xs font-semibold text-slate-50">Resumo</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 hover:bg-slate-800/60">
                    <p className="text-[9px] text-slate-400">Projetos</p>
                    <p className="text-xs text-slate-100">Kanban</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 hover:bg-slate-800/60">
                    <p className="text-[9px] text-slate-400">Chamados</p>
                    <p className="text-xs text-slate-100">Backlog</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 hover:bg-slate-800/60">
                    <p className="text-[9px] text-slate-400">Relatórios</p>
                    <p className="text-xs text-slate-100">Horas &amp; SLA</p>
                  </div>
                </div>
                {/* Conteúdo principal simulando a home atual */}
                <div className="flex-1 bg-gradient-to-b from-slate-900 to-slate-950 p-4 space-y-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <div>
                      <p className="text-xs font-semibold text-slate-50">Seu resumo</p>
                      <p>Visão geral de projetos, tarefas e horas.</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">
                      Semana atual • 03
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                      <p className="text-slate-400">Horas apontadas</p>
                      <p className="mt-1 text-lg font-semibold text-slate-50 tabular-nums">32,5 h</p>
                      <p className="mt-1 text-[10px] text-slate-500">Últimos 7 dias.</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                      <p className="text-slate-400">Tarefas</p>
                      <p className="mt-1 text-lg font-semibold text-slate-50 tabular-nums">18</p>
                      <p className="mt-1 text-[10px] text-slate-500">Backlog, em execução e finalizadas.</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                      <p className="text-slate-400">SLA clientes</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-300 tabular-nums">90%</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Chamados encerrados dentro do prazo combinado.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                    <p className="text-[11px] font-medium text-slate-200">Chamados do dia</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-300">
                      <div className="rounded bg-slate-950/70 px-2 py-1">
                        <p className="text-slate-400">Backlog</p>
                        <p className="font-semibold tabular-nums">6</p>
                      </div>
                      <div className="rounded bg-slate-950/70 px-2 py-1">
                        <p className="text-slate-400">Em execução</p>
                        <p className="font-semibold tabular-nums text-amber-300">4</p>
                      </div>
                      <div className="rounded bg-slate-950/70 px-2 py-1">
                        <p className="text-slate-400">Finalizados</p>
                        <p className="font-semibold tabular-nums text-emerald-300">12</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900/80 bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} WPS One. Todos os direitos reservados.</p>
          <p className="text-[11px]">
            Plataforma focada em consultorias e times de serviço que precisam controlar projetos,
            SLA e horas utilizadas pelos clientes.
          </p>
        </div>
      </footer>
    </div>
  );
}
