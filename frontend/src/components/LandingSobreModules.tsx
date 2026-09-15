"use client";

import { useMemo, useState, type ReactNode } from "react";

const PURPLE = "#5c00e1";

type PreviewKind =
  | "home"
  | "projetos-lista"
  | "projetos-daily"
  | "projetos-tarefas"
  | "projetos-tm"
  | "projetos-aprovacoes"
  | "apontamento"
  | "reembolso"
  | "banco-horas"
  | "portal"
  | "relatorios-visao"
  | "relatorios-horas"
  | "relatorios-utilizacao"
  | "financeiro-projetos"
  | "financeiro-cr"
  | "financeiro-cp"
  | "financeiro-dashboard"
  | "config-cadastro"
  | "config-assinatura";

type FeatureItem = {
  id: string;
  title: string;
  description: string;
  preview: PreviewKind;
};

type ModuleTab = {
  id: string;
  label: string;
  blurb: string;
  features: FeatureItem[];
};

const MODULES: ModuleTab[] = [
  {
    id: "home",
    label: "Home",
    blurb: "Visão do dia: horas apontadas, contexto de calendário e tarefas priorizadas.",
    features: [
      {
        id: "home-dash",
        title: "Painel inicial",
        description:
          "Ao entrar, o usuário vê o resumo de horas (hoje, semana e mês) e a lista de tarefas atribuídas, ordenadas por prioridade — sem precisar abrir vários menus.",
        preview: "home",
      },
    ],
  },
  {
    id: "projetos",
    label: "Projetos",
    blurb: "Do portfólio ao detalhe da tarefa: status, SLA, T&M e aprovações em um só fluxo.",
    features: [
      {
        id: "lista-projetos",
        title: "Lista de Projetos",
        description:
          "Centraliza clientes e projetos com filtros, status e indicadores. Ideal para localizar um contrato, ver saúde do projeto e entrar no Kanban ou nas tarefas.",
        preview: "projetos-lista",
      },
      {
        id: "dashboard-daily",
        title: "Dashboard Daily",
        description:
          "Painel diário da operação: o que está em risco de SLA, o que avançou e o que precisa de atenção na daily — visão rápida para gestores e líderes.",
        preview: "projetos-daily",
      },
      {
        id: "lista-tarefas",
        title: "Lista de Tarefas",
        description:
          "Lista transversal de chamados/tarefas com prioridade, responsável, prazo e status. Facilita priorizar a fila sem perder o contexto do projeto.",
        preview: "projetos-tarefas",
      },
      {
        id: "gestao-tm",
        title: "Gestão T&M",
        description:
          "Acompanha horas contratadas versus consumidas em projetos Time & Material, com visão mensal para previsibilidade e faturamento.",
        preview: "projetos-tm",
      },
      {
        id: "aprovacoes",
        title: "Aprovações",
        description:
          "Fila de pedidos que precisam de autorização (ex.: apontamento fora da regra), com histórico e decisão registrada.",
        preview: "projetos-aprovacoes",
      },
    ],
  },
  {
    id: "apontamento",
    label: "Apontamento",
    blurb: "Registro de horas por projeto e tarefa, com rastreabilidade para gestão e cobrança.",
    features: [
      {
        id: "apontamento",
        title: "Apontamento de horas",
        description:
          "O consultor lança horas por dia, vinculando projeto, tarefa e atividade. O sistema valida limites e regras, alimentando relatórios, banco de horas e financeiro.",
        preview: "apontamento",
      },
    ],
  },
  {
    id: "reembolso",
    label: "Solicitar Reembolso",
    blurb: "Despesas de campo ou viagem com comprovante, projeto e fluxo de aprovação.",
    features: [
      {
        id: "reembolso",
        title: "Solicitar reembolso",
        description:
          "Cria solicitações com tipo, valor, projeto e anexos. O status acompanha o ciclo até a aprovação financeira — sem planilha paralela.",
        preview: "reembolso",
      },
    ],
  },
  {
    id: "banco-horas",
    label: "Banco de horas",
    blurb: "Saldo, movimentações e consumo do banco por colaborador e contexto.",
    features: [
      {
        id: "banco",
        title: "Banco de horas",
        description:
          "Mostra saldo disponível, créditos e débitos. Ajuda a controlar horas extras e compensações com transparência para RH e operação.",
        preview: "banco-horas",
      },
    ],
  },
  {
    id: "portal",
    label: "Portal colaborativo",
    blurb: "Espaço corporativo com seções, conteúdos e eventos para o time.",
    features: [
      {
        id: "portal",
        title: "Portal colaborativo",
        description:
          "Organiza comunicados, materiais e eventos em seções. É o ponto de encontro interno além da operação de projetos.",
        preview: "portal",
      },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    blurb: "Indicadores de horas, utilização, tarefas e exportações para gestão.",
    features: [
      {
        id: "visao",
        title: "Visão geral",
        description:
          "Entrada dos relatórios com atalhos para as análises mais usadas pela gestão.",
        preview: "relatorios-visao",
      },
      {
        id: "horas",
        title: "Gestão de horas / Horas",
        description:
          "Consolida apontamentos por período, projeto e pessoa — base para cobrança, utilização e acompanhamento de capacidade.",
        preview: "relatorios-horas",
      },
      {
        id: "utilizacao",
        title: "Utilização",
        description:
          "Mostra quanto do tempo disponível foi alocado em projetos, ajudando a balancear carga e margem.",
        preview: "relatorios-utilizacao",
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    blurb: "Receitas, contas a pagar/receber, dashboards e medição horas × receita.",
    features: [
      {
        id: "fin-projetos",
        title: "Projetos e receitas",
        description:
          "Visão financeira por projeto: receitas contratadas, composição e acompanhamento do resultado.",
        preview: "financeiro-projetos",
      },
      {
        id: "fin-cr",
        title: "Contas a receber",
        description:
          "Títulos a receber com status, vencimentos, parcelas e vínculo com contratos/projetos.",
        preview: "financeiro-cr",
      },
      {
        id: "fin-cp",
        title: "Contas a pagar",
        description:
          "Obrigações com fornecedores, vencimentos e controle de pagamento — integrado ao módulo financeiro.",
        preview: "financeiro-cp",
      },
      {
        id: "fin-dash",
        title: "Dashboard financeiro",
        description:
          "Resumo executivo de entradas, saídas e indicadores para decisão rápida da diretoria.",
        preview: "financeiro-dashboard",
      },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    blurb: "Cadastros, hubs de configuração e assinatura da organização.",
    features: [
      {
        id: "cadastro",
        title: "Cadastro",
        description:
          "Gestão de usuários, clientes, fornecedores e perfis de permissão — base para operar o tenant com segurança.",
        preview: "config-cadastro",
      },
      {
        id: "assinatura",
        title: "Minha Assinatura",
        description:
          "O Super Admin escolhe o plano (Standard ou Premium), forma de pagamento e acompanha aquisição e próxima parcela.",
        preview: "config-assinatura",
      },
    ],
  },
];

function usePreviewTheme(isDark: boolean) {
  return useMemo(
    () => ({
      border: isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)",
      cardBg: isDark ? "rgba(18,12,28,0.92)" : "#ffffff",
      muted: isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)",
      fg: isDark ? "#f4f2ff" : "#111827",
      pageBg: isDark ? "rgba(10,8,16,0.92)" : "#f8fafc",
      soft: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)",
      purpleSoft: "rgba(92,0,225,0.14)",
    }),
    [isDark],
  );
}

function PreviewChrome({
  title,
  subtitle,
  isDark,
  children,
}: {
  title: string;
  subtitle?: string;
  isDark: boolean;
  children: ReactNode;
}) {
  const t = usePreviewTheme(isDark);
  return (
    <div
      className="overflow-hidden rounded-2xl shadow-xl"
      style={{
        border: `1px solid ${t.border}`,
        background: t.pageBg,
        boxShadow: isDark ? "0 28px 70px rgba(0,0,0,0.4)" : "0 24px 60px rgba(17,24,39,0.1)",
      }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${t.border}`, background: t.cardBg }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: t.fg }}>
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[11px]" style={{ color: t.muted }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
          style={{ background: PURPLE }}
        >
          WPS One
        </span>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

function MiniTable({
  headers,
  rows,
  isDark,
}: {
  headers: string[];
  rows: string[][];
  isDark: boolean;
}) {
  const t = usePreviewTheme(isDark);
  return (
    <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${t.border}` }}>
      <div
        className="grid gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
          background: t.soft,
          color: t.muted,
        }}
      >
        {headers.map((h) => (
          <span key={h} className="truncate">
            {h}
          </span>
        ))}
      </div>
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid gap-2 px-3 py-2.5 text-[11px]"
          style={{
            gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
            borderTop: `1px solid ${t.border}`,
            color: t.fg,
            background: t.cardBg,
          }}
        >
          {row.map((cell, i) => (
            <span key={i} className="truncate">
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function StatRow({
  items,
  isDark,
}: {
  items: Array<{ label: string; value: string }>;
  isDark: boolean;
}) {
  const t = usePreviewTheme(isDark);
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl px-3 py-2.5"
          style={{ background: t.cardBg, border: `1px solid ${t.border}` }}
        >
          <p className="text-[10px]" style={{ color: t.muted }}>
            {item.label}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: t.fg }}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function FeaturePreview({ kind, isDark }: { kind: PreviewKind; isDark: boolean }) {
  const t = usePreviewTheme(isDark);

  switch (kind) {
    case "home":
      return (
        <PreviewChrome title="Home" subtitle="Horas e tarefas do dia" isDark={isDark}>
          <div
            className="rounded-2xl p-4"
            style={{
              border: `1px solid ${t.border}`,
              background: isDark
                ? "radial-gradient(700px 320px at 25% 15%, rgba(92,0,225,0.35), rgba(12,8,18,0.9) 62%)"
                : "radial-gradient(700px 320px at 25% 15%, rgba(92,0,225,0.18), #fff 62%)",
            }}
          >
            <p className="text-base font-semibold" style={{ color: t.fg }}>
              Olá, Administrador!
            </p>
            <p className="mt-1 text-[11px]" style={{ color: t.muted }}>
              Acompanhe suas horas e tarefas em um só lugar.
            </p>
            <StatRow
              isDark={isDark}
              items={[
                { label: "Hoje", value: "02:30" },
                { label: "Semana", value: "18:00" },
                { label: "Mês", value: "64:15" },
              ]}
            />
          </div>
          <div className="mt-3 rounded-xl p-3" style={{ background: t.cardBg, border: `1px solid ${t.border}` }}>
            <p className="text-xs font-semibold" style={{ color: t.fg }}>
              Lista de tarefas
            </p>
            <div className="mt-2 space-y-2">
              {[
                ["Urgente", "Ajuste de integração SAP"],
                ["Alta", "Daily cliente ACME"],
                ["Média", "Revisão de escopo T&M"],
              ].map(([prio, title]) => (
                <div
                  key={title}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[11px]"
                  style={{ background: t.soft, color: t.fg }}
                >
                  <span className="truncate font-medium">{title}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: PURPLE }}>
                    {prio}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </PreviewChrome>
      );

    case "projetos-lista":
      return (
        <PreviewChrome title="Lista de Projetos" subtitle="Portfólio por cliente e status" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Ativos", value: "24" },
              { label: "Em risco", value: "3" },
              { label: "Horas mês", value: "1.280h" },
            ]}
          />
          <MiniTable
            isDark={isDark}
            headers={["Projeto", "Cliente", "Status", "Horas"]}
            rows={[
              ["Implantação ERP", "ACME S.A.", "Em andamento", "320/400"],
              ["Sustentação BI", "NovaTech", "Saudável", "80/120"],
              ["Migração Cloud", "Grupo Sul", "Atenção", "210/180"],
            ]}
          />
        </PreviewChrome>
      );

    case "projetos-daily":
      return (
        <PreviewChrome title="Dashboard Daily" subtitle="Riscos e avanços do dia" isDark={isDark}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: "SLA em risco", value: "5", hint: "tarefas < 24h" },
              { title: "Concluídas ontem", value: "12", hint: "entregas" },
              { title: "Bloqueios", value: "2", hint: "aguardando cliente" },
              { title: "Sem dono", value: "1", hint: "para alocar" },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl p-3"
                style={{ background: t.cardBg, border: `1px solid ${t.border}` }}
              >
                <p className="text-[10px]" style={{ color: t.muted }}>
                  {card.title}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: t.fg }}>
                  {card.value}
                </p>
                <p className="text-[10px]" style={{ color: t.muted }}>
                  {card.hint}
                </p>
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "projetos-tarefas":
      return (
        <PreviewChrome title="Lista de Tarefas" subtitle="Fila por prioridade e prazo" isDark={isDark}>
          <MiniTable
            isDark={isDark}
            headers={["Tarefa", "Projeto", "Prioridade", "Prazo"]}
            rows={[
              ["#1842 Integração API", "ERP ACME", "Urgente", "15/04"],
              ["#1838 Ajuste relatório", "BI NovaTech", "Alta", "16/04"],
              ["#1821 Homologação UAT", "Cloud Sul", "Média", "18/04"],
            ]}
          />
        </PreviewChrome>
      );

    case "projetos-tm":
      return (
        <PreviewChrome title="Gestão T&M" subtitle="Contratado × consumido no mês" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Contratado", value: "160h" },
              { label: "Consumido", value: "132h" },
              { label: "Saldo", value: "28h" },
            ]}
          />
          <div className="h-3 overflow-hidden rounded-full" style={{ background: t.soft }}>
            <div className="h-full rounded-full" style={{ width: "82%", background: PURPLE }} />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: t.muted }}>
            82% do pacote mensal utilizado · previsão de excedente na semana 4
          </p>
        </PreviewChrome>
      );

    case "projetos-aprovacoes":
      return (
        <PreviewChrome title="Aprovações" subtitle="Pedidos pendentes de autorização" isDark={isDark}>
          <div className="space-y-2">
            {[
              ["Apontamento fora do horário", "Ana Silva", "Pendente"],
              ["Horas extras projeto X", "Carlos M.", "Pendente"],
              ["Ajuste banco de horas", "Lia Costa", "Em análise"],
            ].map(([tipo, quem, status]) => (
              <div
                key={tipo}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: t.cardBg, border: `1px solid ${t.border}` }}
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold" style={{ color: t.fg }}>
                    {tipo}
                  </p>
                  <p className="text-[10px]" style={{ color: t.muted }}>
                    {quem}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: t.purpleSoft, color: PURPLE }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "apontamento":
      return (
        <PreviewChrome title="Apontamento" subtitle="Lançamento diário de horas" isDark={isDark}>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {["Projeto", "Tarefa", "Atividade"].map((label) => (
              <div key={label} className="rounded-lg px-3 py-2 text-[11px]" style={{ border: `1px solid ${t.border}`, background: t.cardBg, color: t.muted }}>
                {label}: selecionar…
              </div>
            ))}
          </div>
          <MiniTable
            isDark={isDark}
            headers={["Data", "Projeto", "Horas", "Status"]}
            rows={[
              ["14/04", "ERP ACME", "04:00", "OK"],
              ["14/04", "BI NovaTech", "02:30", "OK"],
              ["13/04", "Cloud Sul", "06:00", "Aprovar"],
            ]}
          />
        </PreviewChrome>
      );

    case "reembolso":
      return (
        <PreviewChrome title="Solicitar Reembolso" subtitle="Despesas com comprovante" isDark={isDark}>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {[
              ["Tipo", "Deslocamento"],
              ["Valor", "R$ 186,40"],
              ["Projeto", "ERP ACME"],
              ["Status", "Em análise"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: t.cardBg, border: `1px solid ${t.border}` }}>
                <p className="text-[10px]" style={{ color: t.muted }}>
                  {k}
                </p>
                <p className="mt-0.5 text-sm font-semibold" style={{ color: t.fg }}>
                  {v}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-3 py-6 text-center text-[11px]" style={{ border: `1px dashed ${t.border}`, color: t.muted }}>
            Comprovante.pdf · anexado
          </div>
        </PreviewChrome>
      );

    case "banco-horas":
      return (
        <PreviewChrome title="Banco de horas" subtitle="Saldo e movimentações" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Saldo", value: "+12:30" },
              { label: "Créditos", value: "18:00" },
              { label: "Débitos", value: "05:30" },
            ]}
          />
          <MiniTable
            isDark={isDark}
            headers={["Data", "Tipo", "Horas", "Obs."]}
            rows={[
              ["10/04", "Crédito", "+04:00", "Plantão"],
              ["08/04", "Débito", "-02:00", "Folga"],
              ["02/04", "Crédito", "+03:30", "Entrega"],
            ]}
          />
        </PreviewChrome>
      );

    case "portal":
      return (
        <PreviewChrome title="Portal colaborativo" subtitle="Comunicados e seções" isDark={isDark}>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Comunicados", "Políticas", "Eventos", "Treinamentos"].map((section) => (
              <div
                key={section}
                className="rounded-xl p-4"
                style={{ background: t.cardBg, border: `1px solid ${t.border}` }}
              >
                <p className="text-sm font-semibold" style={{ color: t.fg }}>
                  {section}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: t.muted }}>
                  3 itens atualizados esta semana
                </p>
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "relatorios-visao":
      return (
        <PreviewChrome title="Relatórios" subtitle="Atalhos de análise" isDark={isDark}>
          <div className="grid gap-2 sm:grid-cols-2">
            {["Gestão de horas", "Utilização", "Tarefas", "Exportar faturamento"].map((item) => (
              <div
                key={item}
                className="rounded-xl px-3 py-3 text-sm font-medium"
                style={{ background: t.cardBg, border: `1px solid ${t.border}`, color: t.fg }}
              >
                {item}
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "relatorios-horas":
      return (
        <PreviewChrome title="Gestão de horas" subtitle="Consolidado por período" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Total", value: "842h" },
              { label: "Faturáveis", value: "710h" },
              { label: "Internas", value: "132h" },
            ]}
          />
          <MiniTable
            isDark={isDark}
            headers={["Pessoa", "Projeto", "Horas", "%"]}
            rows={[
              ["Ana Silva", "ERP ACME", "42:00", "28%"],
              ["Carlos M.", "BI NovaTech", "36:30", "24%"],
              ["Lia Costa", "Cloud Sul", "31:00", "21%"],
            ]}
          />
        </PreviewChrome>
      );

    case "relatorios-utilizacao":
      return (
        <PreviewChrome title="Utilização" subtitle="Capacidade × alocação" isDark={isDark}>
          <div className="space-y-3">
            {[
              ["Ana Silva", 92],
              ["Carlos M.", 78],
              ["Lia Costa", 85],
            ].map(([nome, pct]) => (
              <div key={String(nome)}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span style={{ color: t.fg }}>{nome}</span>
                  <span style={{ color: t.muted }}>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: t.soft }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PURPLE }} />
                </div>
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "financeiro-projetos":
      return (
        <PreviewChrome title="Financeiro · Projetos" subtitle="Receitas e resultado" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Receita", value: "R$ 248 mil" },
              { label: "Custo", value: "R$ 171 mil" },
              { label: "Margem", value: "31%" },
            ]}
          />
          <MiniTable
            isDark={isDark}
            headers={["Projeto", "Receita", "Margem", "Status"]}
            rows={[
              ["ERP ACME", "R$ 96 mil", "34%", "No alvo"],
              ["BI NovaTech", "R$ 54 mil", "28%", "Atenção"],
              ["Cloud Sul", "R$ 98 mil", "30%", "No alvo"],
            ]}
          />
        </PreviewChrome>
      );

    case "financeiro-cr":
      return (
        <PreviewChrome title="Contas a receber" subtitle="Títulos e vencimentos" isDark={isDark}>
          <MiniTable
            isDark={isDark}
            headers={["Cliente", "Valor", "Vencimento", "Status"]}
            rows={[
              ["ACME S.A.", "R$ 42.000", "20/04", "Aberto"],
              ["NovaTech", "R$ 18.500", "12/04", "Atrasado"],
              ["Grupo Sul", "R$ 61.200", "28/04", "Faturado"],
            ]}
          />
        </PreviewChrome>
      );

    case "financeiro-cp":
      return (
        <PreviewChrome title="Contas a pagar" subtitle="Obrigações e fornecedores" isDark={isDark}>
          <MiniTable
            isDark={isDark}
            headers={["Fornecedor", "Valor", "Vencimento", "Status"]}
            rows={[
              ["Cloud Host BR", "R$ 3.200", "18/04", "A pagar"],
              ["Licenças Soft", "R$ 7.850", "22/04", "Agendado"],
              ["Consultoria X", "R$ 12.400", "05/04", "Pago"],
            ]}
          />
        </PreviewChrome>
      );

    case "financeiro-dashboard":
      return (
        <PreviewChrome title="Dashboard financeiro" subtitle="Visão executiva" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Entradas", value: "R$ 312 mil" },
              { label: "Saídas", value: "R$ 198 mil" },
              { label: "Saldo", value: "R$ 114 mil" },
            ]}
          />
          <div className="grid h-28 grid-cols-6 items-end gap-2 rounded-xl p-3" style={{ background: t.soft }}>
            {[40, 55, 48, 70, 62, 78].map((h, i) => (
              <div key={i} className="rounded-t-md" style={{ height: `${h}%`, background: PURPLE, opacity: 0.55 + i * 0.07 }} />
            ))}
          </div>
        </PreviewChrome>
      );

    case "config-cadastro":
      return (
        <PreviewChrome title="Configurações · Cadastro" subtitle="Usuários, clientes e perfis" isDark={isDark}>
          <div className="grid gap-2 sm:grid-cols-2">
            {["Usuários", "Clientes", "Fornecedores", "Gestão de perfis"].map((item) => (
              <div
                key={item}
                className="rounded-xl px-3 py-3 text-sm font-medium"
                style={{ background: t.cardBg, border: `1px solid ${t.border}`, color: t.fg }}
              >
                {item}
              </div>
            ))}
          </div>
        </PreviewChrome>
      );

    case "config-assinatura":
      return (
        <PreviewChrome title="Minha Assinatura" subtitle="Plano e cobrança por usuário ativo" isDark={isDark}>
          <StatRow
            isDark={isDark}
            items={[
              { label: "Plano", value: "Premium" },
              { label: "Por usuário", value: "R$ 99" },
              { label: "Próx. parcela", value: "15/05" },
            ]}
          />
          <div className="rounded-xl px-3 py-3 text-[11px]" style={{ background: t.purpleSoft, color: PURPLE }}>
            Pix · Boleto · Cartão — escolha na contratação do plano
          </div>
        </PreviewChrome>
      );

    default:
      return null;
  }
}

export function LandingSobreModules({ isDark }: { isDark: boolean }) {
  const [moduleId, setModuleId] = useState(MODULES[0].id);
  const activeModule = MODULES.find((m) => m.id === moduleId) ?? MODULES[0];
  const [featureId, setFeatureId] = useState(activeModule.features[0].id);

  const activeFeature =
    activeModule.features.find((f) => f.id === featureId) ?? activeModule.features[0];

  const muted = isDark ? "rgba(244,242,255,0.68)" : "rgba(17,24,39,0.58)";
  const fg = isDark ? "#f4f2ff" : "#0b0b12";
  const chipBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.12)";
  const surface = isDark ? "rgba(12,8,18,0.55)" : "rgba(255,255,255,0.8)";

  return (
    <div className="mt-10">
      <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODULES.map((mod) => {
          const active = mod.id === activeModule.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                setModuleId(mod.id);
                setFeatureId(mod.features[0].id);
              }}
              className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-95"
              style={{
                background: active ? PURPLE : "transparent",
                color: active ? "#fff" : fg,
                border: `1px solid ${active ? PURPLE : chipBorder}`,
              }}
            >
              {mod.label}
            </button>
          );
        })}
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed md:text-[15px]" style={{ color: muted }}>
        {activeModule.blurb}
      </p>

      {activeModule.features.length > 1 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {activeModule.features.map((feat) => {
            const active = feat.id === activeFeature.id;
            return (
              <button
                key={feat.id}
                type="button"
                onClick={() => setFeatureId(feat.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-95"
                style={{
                  background: active ? "rgba(92,0,225,0.14)" : surface,
                  color: active ? PURPLE : muted,
                  border: `1px solid ${active ? "rgba(92,0,225,0.35)" : chipBorder}`,
                }}
              >
                {feat.title}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-start lg:gap-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: PURPLE }}>
            {activeModule.label}
          </p>
          <h3 className="mt-2 text-xl font-bold md:text-2xl" style={{ color: fg }}>
            {activeFeature.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed md:text-[15px]" style={{ color: muted }}>
            {activeFeature.description}
          </p>
        </div>
        <FeaturePreview kind={activeFeature.preview} isDark={isDark} />
      </div>
    </div>
  );
}
