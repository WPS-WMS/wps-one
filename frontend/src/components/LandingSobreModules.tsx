"use client";

import { useState } from "react";

const PURPLE = "#5c00e1";

type FeatureItem = {
  id: string;
  title: string;
  description: string;
  imageSrc?: string;
  imageAlt: string;
};

type ModuleTab = {
  id: string;
  label: string;
  blurb: string;
  features: FeatureItem[];
};

type CapabilityCard = {
  id: string;
  title: string;
  benefit: string;
  imageSrc: string;
  moduleId: string;
  featureId: string;
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
          "Ao entrar, o usuário vê o resumo de horas (hoje, semana e mês), o calendário e a lista de tarefas — tudo em um só lugar para começar o dia.",
        imageSrc: "/landing/home.png",
        imageAlt: "Tela Home do WPS One",
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
          "Centraliza clientes e projetos com status, progresso, tópicos e tarefas. Ideal para localizar um contrato, ver a saúde do projeto e entrar no Kanban.",
        imageSrc: "/landing/projetos-lista.png",
        imageAlt: "Tela Lista de Projetos do WPS One",
      },
      {
        id: "dashboard-daily",
        title: "Dashboard Daily",
        description:
          "Kanban diário da operação: filtre por grupo de projetos, acompanhe Backlog, execução e finalizadas — perfeito para a daily do time.",
        imageSrc: "/landing/projetos-daily.png",
        imageAlt: "Tela Dashboard Daily do WPS One",
      },
      {
        id: "lista-tarefas",
        title: "Lista de Tarefas",
        description:
          "Visão consolidada de tarefas para acompanhamento, cobrança e planejamento, com filtros por status, cliente e membro.",
        imageSrc: "/landing/projetos-tarefas.png",
        imageAlt: "Tela Lista de Tarefas do WPS One",
      },
      {
        id: "tarefa-detalhe",
        title: "Detalhe da tarefa",
        description:
          "Título, tópico, datas, membros, horas, status, prioridade e progresso — com abas de apontamentos, histórico, orçamento e anexos no mesmo fluxo.",
        imageSrc: "/landing/tarefa-detalhe.png",
        imageAlt: "Tela Detalhe da tarefa do WPS One",
      },
      {
        id: "gestao-tm",
        title: "Gestão T&M",
        description:
          "Acompanha horas planejadas versus executadas em projetos Time & Material e AMS, com visão agregada e por projeto.",
        imageSrc: "/landing/projetos-tm.png",
        imageAlt: "Tela Gestão T&M do WPS One",
      },
      {
        id: "aprovacoes",
        title: "Aprovações",
        description:
          "Fila de pedidos de permissão de apontamento (ex.: fora do horário), com justificativa e decisão de aprovar ou rejeitar.",
        imageSrc: "/landing/projetos-aprovacoes.png",
        imageAlt: "Tela Aprovações do WPS One",
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
          "O consultor lança horas na semana, vinculando projeto e tarefa. O sistema mostra saldo, regras e status de aprovação.",
        imageSrc: "/landing/apontamento.png",
        imageAlt: "Tela Apontamento de horas do WPS One",
      },
    ],
  },
  {
    id: "reembolso",
    label: "Solicitar Reembolso",
    blurb: "Despesas com comprovante, projeto e fluxo até a aprovação financeira.",
    features: [
      {
        id: "reembolso",
        title: "Solicitar reembolso",
        description:
          "Cria solicitações com tipo, valor, projeto, pagamento e anexos opcionais — sem planilha paralela.",
        imageSrc: "/landing/reembolso.png",
        imageAlt: "Tela Solicitar Reembolso do WPS One",
      },
    ],
  },
  {
    id: "banco-horas",
    label: "Banco de horas",
    blurb: "Saldo, horas do período e histórico mensal com exportação.",
    features: [
      {
        id: "banco",
        title: "Banco de horas",
        description:
          "Mostra saldo de referência, horas trabalhadas versus previstas e o acumulado do colaborador.",
        imageSrc: "/landing/banco-horas.png",
        imageAlt: "Tela Banco de horas do WPS One",
      },
    ],
  },
  {
    id: "portal",
    label: "Portal Colaborativo",
    blurb:
      "Intranet da empresa: comunicação interna, agenda, pessoas e documentos em um só lugar.",
    features: [
      {
        id: "portal-empresa",
        title: "Portal da empresa",
        description:
          "Tela interna da organização para publicar notícias e imagens, acompanhar atualizações do WPS One, ver aniversariantes do mês e eventos importantes, além de anexar documentos e manuais internos — tudo centralizado para o time.",
        imageSrc: "/landing/portal-colaborativo.jpg",
        imageAlt: "Tela Portal Colaborativo do WPS One",
      },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    blurb: "Indicadores de horas e utilização para gestão e faturamento.",
    features: [
      {
        id: "horas",
        title: "Gestão de horas",
        description:
          "Filtra apontamentos por período, colaborador, projeto e status. Exporta PDF/Excel e pode gerar contas a pagar.",
        imageSrc: "/landing/relatorios-horas.png",
        imageAlt: "Tela Gestão de horas do WPS One",
      },
      {
        id: "utilizacao",
        title: "Utilização",
        description:
          "Compara horas trabalhadas com a capacidade do período — essencial para balancear carga e margem.",
        imageSrc: "/landing/relatorios-utilizacao.png",
        imageAlt: "Tela Utilização do WPS One",
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    blurb: "Contas a pagar/receber, resultado por projeto, dashboard e aprovação de reembolsos.",
    features: [
      {
        id: "fin-resultado",
        title: "Resultado de projeto",
        description:
          "Receita, despesa, impostos e margem por projeto — visão completa ou mensal, com composição detalhada para a gestão enxergar o resultado em tempo real.",
        imageSrc: "/landing/financeiro-resultado-projeto.png",
        imageAlt: "Tela Resultado de projeto do WPS One",
      },
      {
        id: "fin-cr",
        title: "Contas a receber",
        description:
          "Faturamento e reembolsos a cobrar, com aging, filtros e acompanhamento de status/NF.",
        imageSrc: "/landing/financeiro-cr.png",
        imageAlt: "Tela Contas a receber do WPS One",
      },
      {
        id: "fin-cp",
        title: "Contas a pagar",
        description:
          "Saídas com aging, filtros por centro de custo e ações de PDF, Excel e nova conta.",
        imageSrc: "/landing/financeiro-cp.png",
        imageAlt: "Tela Contas a pagar do WPS One",
      },
      {
        id: "fin-dash",
        title: "Dashboard financeiro",
        description:
          "Receita, impostos, custo, EBITDA e inadimplência consolidados do período.",
        imageSrc: "/landing/financeiro-dashboard.png",
        imageAlt: "Tela Dashboard financeiro do WPS One",
      },
      {
        id: "fin-reembolsos",
        title: "Aprovar reembolsos",
        description:
          "Fila financeira de reembolsos: aprova, rejeita e gera contas automaticamente quando aprovado.",
        imageSrc: "/landing/financeiro-reembolsos.png",
        imageAlt: "Tela Aprovação de reembolsos do WPS One",
      },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    blurb: "Cadastros da organização e assinatura WPS One.",
    features: [
      {
        id: "usuarios",
        title: "Usuários",
        description:
          "Gerencie usuários, perfis e status (ativo/inativo) com busca e filtros.",
        imageSrc: "/landing/config-usuarios.png",
        imageAlt: "Tela Usuários do WPS One",
      },
      {
        id: "clientes",
        title: "Clientes",
        description:
          "Cadastro de clientes com projetos vinculados — base comercial da operação.",
        imageSrc: "/landing/config-clientes.png",
        imageAlt: "Tela Clientes do WPS One",
      },
      {
        id: "assinatura",
        title: "Minha Assinatura",
        description:
          "Escolha do plano (Standard ou Premium), forma de pagamento e acompanhamento da cobrança por usuário ativo.",
        imageSrc: "/landing/config-assinatura.png",
        imageAlt: "Tela Minha Assinatura do WPS One",
      },
    ],
  },
];

/** Grade de capacidades no topo do Sobre — clique abre a aba/feature correspondente. */
const CAPABILITIES: CapabilityCard[] = [
  {
    id: "cap-projetos",
    title: "Projetos",
    benefit: "Portfólio, status e progresso em um só lugar",
    imageSrc: "/landing/projetos-lista.png",
    moduleId: "projetos",
    featureId: "lista-projetos",
  },
  {
    id: "cap-kanban",
    title: "Kanban / Daily",
    benefit: "Fluxo do time na daily, sem planilha",
    imageSrc: "/landing/projetos-daily.png",
    moduleId: "projetos",
    featureId: "dashboard-daily",
  },
  {
    id: "cap-tarefa",
    title: "Detalhe da tarefa",
    benefit: "SLA, membros, horas e anexos no mesmo card",
    imageSrc: "/landing/tarefa-detalhe.png",
    moduleId: "projetos",
    featureId: "tarefa-detalhe",
  },
  {
    id: "cap-apontamento",
    title: "Apontamento",
    benefit: "Horas no projeto, prontas para cobrança",
    imageSrc: "/landing/apontamento.png",
    moduleId: "apontamento",
    featureId: "apontamento",
  },
  {
    id: "cap-tm",
    title: "Gestão T&M",
    benefit: "Planejado × executado por contrato",
    imageSrc: "/landing/projetos-tm.png",
    moduleId: "projetos",
    featureId: "gestao-tm",
  },
  {
    id: "cap-resultado",
    title: "Resultado de projeto",
    benefit: "Receita, despesa e margem em tempo real",
    imageSrc: "/landing/financeiro-resultado-projeto.png",
    moduleId: "financeiro",
    featureId: "fin-resultado",
  },
  {
    id: "cap-portal",
    title: "Portal",
    benefit: "Comunicação e documentos do time",
    imageSrc: "/landing/portal-colaborativo.jpg",
    moduleId: "portal",
    featureId: "portal-empresa",
  },
  {
    id: "cap-relatorios",
    title: "Relatórios",
    benefit: "Horas e utilização para a gestão",
    imageSrc: "/landing/relatorios-horas.png",
    moduleId: "relatorios",
    featureId: "horas",
  },
];

function ScreenshotFrame({
  src,
  alt,
  isDark,
}: {
  src: string;
  alt: string;
  isDark: boolean;
}) {
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)";
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        border: `1px solid ${border}`,
        background: isDark ? "rgba(10,8,16,0.9)" : "#fff",
        boxShadow: isDark ? "0 28px 70px rgba(0,0,0,0.4)" : "0 24px 60px rgba(17,24,39,0.1)",
      }}
    >
      <img
        src={src}
        alt={alt}
        className="block h-auto w-full"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
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

  function selectCapability(card: CapabilityCard) {
    setModuleId(card.moduleId);
    setFeatureId(card.featureId);
    requestAnimationFrame(() => {
      document.getElementById("sobre-tour")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="mt-10">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {CAPABILITIES.map((card) => {
          const selected = moduleId === card.moduleId && featureId === card.featureId;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selectCapability(card)}
              className="group flex flex-col overflow-hidden rounded-2xl text-left transition-transform duration-300 hover:-translate-y-0.5"
              style={{
                background: surface,
                border: selected
                  ? `1.5px solid ${PURPLE}`
                  : `1px solid ${chipBorder}`,
                boxShadow: selected
                  ? isDark
                    ? "0 12px 28px rgba(92,0,225,0.25)"
                    : "0 12px 28px rgba(92,0,225,0.12)"
                  : undefined,
              }}
            >
              <div
                className="relative h-20 overflow-hidden sm:h-24"
                style={{
                  background: isDark ? "rgba(0,0,0,0.35)" : "rgba(17,24,39,0.04)",
                }}
              >
                <img
                  src={card.imageSrc}
                  alt=""
                  className="h-full w-full object-cover object-left-top opacity-95 transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                  decoding="async"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: isDark
                      ? "linear-gradient(180deg, transparent 40%, rgba(12,8,18,0.75) 100%)"
                      : "linear-gradient(180deg, transparent 45%, rgba(255,255,255,0.85) 100%)",
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 px-3 py-3 sm:px-3.5 sm:py-3.5">
                <span className="text-sm font-semibold leading-snug" style={{ color: fg }}>
                  {card.title}
                </span>
                <span className="text-xs leading-snug" style={{ color: muted }}>
                  {card.benefit}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs" style={{ color: muted }}>
        Clique em um card para ver a tela e o problema que ela resolve.
      </p>

      <div id="sobre-tour" className="mt-10 scroll-mt-28">
        <div className="flex flex-wrap gap-2">
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
                className="rounded-full px-3.5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-95 md:px-4 md:text-sm"
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

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)] lg:items-start lg:gap-10">
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
          {activeFeature.imageSrc ? (
            <ScreenshotFrame src={activeFeature.imageSrc} alt={activeFeature.imageAlt} isDark={isDark} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
