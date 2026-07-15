"use client";

import { useMemo } from "react";
import { Link } from "@/components/Link";
import { Clock, User, TrendingUp, FileSpreadsheet, Banknote, ArrowRight, CalendarClock, Receipt, Layers, BarChart3, LineChart, PieChart, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRelatorioGestaoHoras, canAccessRelatorioReembolsos } from "@/lib/featureNav";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { ReportsPageShell } from "@/components/reports/ReportsPrimitives";

export default function RelatoriosPage() {
  const { user, can } = useAuth();
  const basePath =
    user?.role === "GESTOR_PROJETOS"
      ? "/gestor"
      : user?.role === "CONSULTOR"
        ? "/consultor"
        : "/admin";

  const relatorios = useMemo(() => {
    const cards: Array<{
      id: string;
      href: string;
      title: string;
      description: string;
      icon: typeof Clock;
    }> = [];
    if (canAccessRelatorioGestaoHoras(can)) {
      cards.push({
        id: "gestao-horas",
        href: `${basePath}/relatorios/gestao-horas`,
        title: "Gestão de horas",
        description: "Lista de apontamentos com filtros por usuário, período e projeto. Exportar CSV e PDF.",
        icon: CalendarClock,
      });
    }
    if (can("relatorios.horas")) {
      cards.push({
        id: "horas",
        href: `${basePath}/relatorios/horas`,
        title: "Horas",
        description: "Total de horas apontadas com filtro por datas e agrupamento por consultor, projeto ou cliente.",
        icon: Clock,
      });
    }
    if (canAccessRelatorioReembolsos(can)) {
      cards.push({
        id: "reembolsos",
        href: `${basePath}/relatorios/reembolsos`,
        title: "Reembolsos",
        description: "Relatório de solicitações de reembolso com filtros por período, usuário e tipo. Inclui anexos para download.",
        icon: Receipt,
      });
    }
    if (can("relatorios.utilizacao")) {
      cards.push({
        id: "utilizacao",
        href: `${basePath}/relatorios/utilizacao`,
        title: "Utilização",
        description: "Horas por consultor no período vs. capacidade (carga horária). Quem está alocado e quem tem disponibilidade.",
        icon: User,
      });
    }
    if (can("relatorios.chamados")) {
      cards.push({
        id: "tarefas",
        href: `${basePath}/relatorios/chamados`,
        title: "Tarefas",
        description: "Quantidade de tarefas por status e por período. Visão de demanda e throughput.",
        icon: TrendingUp,
      });
    }
    if (can("hora-banco")) {
      cards.push({
        id: "banco-horas",
        href: `${basePath}/banco-horas`,
        title: "Banco de horas",
        description: "Saldo e movimentações do banco de horas por consultor ou por ano.",
        icon: Banknote,
      });
    }
    if (can("relatorios.exportacao")) {
      cards.push({
        id: "exportacao",
        href: `${basePath}/relatorios/exportacao`,
        title: "Exportar faturamento",
        description: "Exportar horas por cliente/projeto em CSV para cobrança ou integração.",
        icon: FileSpreadsheet,
      });
    }
    if (canFinanceFeature(can, "relatorios.financeiroCentroCusto")) {
      cards.push({
        id: "centro-custo",
        href: `${basePath}/relatorios/centro-custo`,
        title: "Controle de orçamento",
        description: "Orçado e realizado agrupados por centro de custo no período selecionado.",
        icon: Layers,
      });
    }
    if (isFinanceiroModuleEnabled() && canFinanceFeature(can, "relatorios.financeiroDashboard")) {
      cards.push({
        id: "finance-dashboard",
        href: `${basePath}/relatorios/financeiro/dashboard`,
        title: "Dashboard financeiro",
        description: "Receita, despesa, resultado, EBITDA, recorrência, inadimplência e fluxo previsto.",
        icon: BarChart3,
      });
    }
    if (isFinanceiroModuleEnabled() && canFinanceFeature(can, "relatorios.financeiroDre")) {
      cards.push({
        id: "finance-dre",
        href: `${basePath}/relatorios/financeiro/dre`,
        title: "DRE gerencial",
        description: "Receita bruta/líquida, impostos, custos operacionais, margem e EBITDA.",
        icon: PieChart,
      });
    }
    if (isFinanceiroModuleEnabled() && canFinanceFeature(can, "relatorios.financeiroFluxoCaixa")) {
      cards.push({
        id: "finance-cashflow",
        href: `${basePath}/relatorios/financeiro/fluxo-caixa`,
        title: "Fluxo de caixa",
        description: "Visão diária, semanal ou mensal com realizado e previsto.",
        icon: Wallet,
      });
    }
    if (isFinanceiroModuleEnabled() && canFinanceFeature(can, "relatorios.financeiroAnalises")) {
      cards.push({
        id: "finance-analyses",
        href: `${basePath}/relatorios/financeiro/analises`,
        title: "Análises financeiras",
        description: "Entrada vs saída, resultado por projeto/cliente/CC, despesas, receita por consultor e margem.",
        icon: LineChart,
      });
    }
    if (isFinanceiroModuleEnabled() && canFinanceFeature(can, "relatorios.financeiroMedicaoHoras")) {
      cards.push({
        id: "finance-hours-vs-revenue",
        href: `${basePath}/relatorios/financeiro/medicao-horas`,
        title: "Medição de horas vs receita",
        description:
          "Horas previstas/realizadas, receita, custo e despesa operacional e margem (R$ e %) por projeto.",
        icon: Clock,
      });
    }
    return cards;
  }, [basePath, can]);

  return (
    <ReportsPageShell
      title="Relatórios"
      subtitle="Visão geral. Escolha um relatório no menu ao lado ou nos cards abaixo."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatorios.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.id}
              href={r.href}
              className="group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md"
              style={{
                borderColor: "var(--border)",
                background: "linear-gradient(135deg, rgba(92, 0, 225, 0.10), rgba(0,0,0,0.02))",
              }}
            >
              <div
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(800px circle at 20% 0%, rgba(92,0,225,0.18), transparent 55%)",
                }}
              />
              <div className="relative flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm"
                  style={{
                    borderColor: "rgba(92,0,225,0.30)",
                    background: "rgba(92,0,225,0.12)",
                    color: "var(--primary)",
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-[color:var(--foreground)] leading-snug">
                    {r.title}
                  </h2>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform"
                  style={{ color: "var(--muted-foreground)" }}
                />
              </div>
              <p className="relative mt-3 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                {r.description}
              </p>
            </Link>
          );
        })}
      </div>
    </ReportsPageShell>
  );
}
