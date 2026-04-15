"use client";

import { Link } from "@/components/Link";
import { Clock, User, TrendingUp, FileSpreadsheet, Banknote, ArrowRight, CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ReportsPageShell } from "@/components/reports/ReportsPrimitives";

export default function RelatoriosPage() {
  const { user } = useAuth();
  const basePath =
    user?.role === "GESTOR_PROJETOS"
      ? "/gestor"
      : user?.role === "CONSULTOR"
        ? "/consultor"
        : "/admin";

  const relatorios = [
    { id: "gestao-horas", href: `${basePath}/relatorios/gestao-horas`, title: "Gestão de horas", description: "Lista de apontamentos com filtros por usuário, período e projeto. Exportar CSV e PDF.", icon: CalendarClock },
    { id: "horas", href: `${basePath}/relatorios/horas`, title: "Horas por período / projeto / cliente", description: "Total de horas apontadas com filtro por datas e agrupamento por consultor, projeto ou cliente.", icon: Clock },
    ...(user?.role === "SUPER_ADMIN" || user?.role === "GESTOR_PROJETOS"
      ? [{ id: "utilizacao", href: `${basePath}/relatorios/utilizacao`, title: "Utilização", description: "Horas por consultor no período vs. capacidade (carga horária). Quem está alocado e quem tem disponibilidade.", icon: User }]
      : []),
    { id: "chamados", href: `${basePath}/relatorios/chamados`, title: "Chamados / tickets", description: "Quantidade de chamados por status e por período. Visão de demanda e throughput.", icon: TrendingUp },
    { id: "banco-horas", href: `${basePath}/banco-horas`, title: "Banco de horas", description: "Saldo e movimentações do banco de horas por consultor ou por ano.", icon: Banknote },
    { id: "exportacao", href: `${basePath}/relatorios/exportacao`, title: "Exportar faturamento", description: "Exportar horas por cliente/projeto em CSV para cobrança ou integração.", icon: FileSpreadsheet },
  ];

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
