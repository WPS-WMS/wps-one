"use client";

import { Link } from "@/components/Link";
import { Clock, User, TrendingUp, FileSpreadsheet, Banknote, ArrowRight } from "lucide-react";

const RELATORIOS = [
  { id: "horas", href: "/admin/relatorios/horas", title: "Horas por período / projeto / cliente", description: "Total de horas apontadas com filtro por datas e agrupamento por consultor, projeto ou cliente.", icon: Clock },
  { id: "utilizacao", href: "/admin/relatorios/utilizacao", title: "Utilização", description: "Horas por consultor no período vs. capacidade (carga horária). Quem está alocado e quem tem disponibilidade.", icon: User },
  { id: "chamados", href: "/admin/relatorios/chamados", title: "Chamados / tickets", description: "Quantidade de chamados por status e por período. Visão de demanda e throughput.", icon: TrendingUp },
  { id: "banco-horas", href: "/admin/banco-horas", title: "Banco de horas", description: "Saldo e movimentações do banco de horas por consultor ou por ano.", icon: Banknote },
  { id: "exportacao", href: "/admin/relatorios/exportacao", title: "Exportar faturamento", description: "Exportar horas por cliente/projeto em CSV para cobrança ou integração.", icon: FileSpreadsheet },
];

export default function RelatoriosPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Relatórios</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Visão geral. Escolha um relatório no menu ao lado ou nos cards abaixo.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RELATORIOS.map((r) => {
              const Icon = r.icon;
              return (
                <Link
                  key={r.id}
                  href={r.href}
                  className="flex flex-col p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-slate-900 group-hover:text-blue-700">{r.title}</h2>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </div>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">{r.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
