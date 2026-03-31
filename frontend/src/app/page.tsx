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
              O WPS One centraliza tudo o que você precisa para gerir projetos de consultoria, AMS e
              Time &amp; Material: abertura de chamados, tarefas, apontamento de horas, contratos,
              SLA, relatórios de desempenho e visão dedicada para o cliente final.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
              >
                Entrar e começar a usar
              </Link>
              <p className="text-xs text-slate-400 max-w-xs">
                Acesso segmentado por perfil: Administrador, Gestor de projetos, Consultor e Cliente,
                cada um com a visão certa para o seu dia a dia.
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
            <div className="relative mx-auto max-w-md rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Resumo em tempo real
                </span>
                <span>Visão exemplo do WPS One</span>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                    <p className="text-slate-400">Projetos ativos</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-50 tabular-nums">12</p>
                    <p className="mt-1 text-[11px] text-emerald-300">
                      AMS, Fixed Price e T&amp;M em um único painel.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                    <p className="text-slate-400">Horas apontadas</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-50 tabular-nums">184</p>
                    <p className="mt-1 text-[11px] text-slate-400">Semana atual dos consultores.</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                    <p className="text-slate-400">SLA Clientes</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-300 tabular-nums">
                      92%
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Baseado em chamados encerrados dentro do prazo.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium text-slate-200">Pipeline de chamados</span>
                    <span>Hoje</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-300">
                    <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                      <p className="text-slate-400">Backlog</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">18</p>
                    </div>
                    <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                      <p className="text-slate-400">Em execução</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-amber-300">7</p>
                    </div>
                    <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800">
                      <p className="text-slate-400">Finalizados</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">34</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">Experiência pensada para cada perfil</p>
                  <ul className="mt-2 space-y-1.5">
                    <li>
                      <span className="font-semibold text-slate-50">Administrador:</span>{" "}
                      configura acessos, empresas, contratos e relatórios globais.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-50">Gestor de projetos:</span>{" "}
                      acompanha portfólio, SLA, horas e saúde dos projetos.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-50">Consultor:</span>{" "}
                      foca em tarefas do dia, apontamento de horas e chamados.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-50">Cliente:</span>{" "}
                      vê consumo de horas, SLA e situação dos chamados em linguagem clara, sem
                      informações internas sensíveis.
                    </li>
                  </ul>
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
