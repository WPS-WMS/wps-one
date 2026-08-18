import type { LucideIcon } from "lucide-react";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import {
  Building2,
  CalendarDays,
  ListChecks,
  Layers,
  ListTree,
  Mail,
  Percent,
  Plug,
  Receipt,
  Tags,
  UserCog,
  Users,
  Wallet,
  FileText,
  ReceiptText,
  TrendingUp,
  Truck,
} from "lucide-react";

export type ConfiguracaoSection = "geral" | "cadastro" | "financeiro";

export type ConfiguracaoItem = {
  permission: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  section: ConfiguracaoSection;
  /** Exige módulo financeiro QA + permissão financeira. */
  financeGated?: boolean;
};

export const CONFIGURACAO_SECTION_META: Record<
  ConfiguracaoSection,
  { title: string; description: string; hrefSuffix: string }
> = {
  geral: {
    title: "Geral",
    description: "Parâmetros do sistema, notificações e integrações.",
    hrefSuffix: "geral",
  },
  cadastro: {
    title: "Cadastro",
    description: "Usuários, clientes, fornecedores e perfis de acesso.",
    hrefSuffix: "cadastro",
  },
  financeiro: {
    title: "Financeiro",
    description: "Cadastro da empresa, reembolsos, centros de custo e classificações.",
    hrefSuffix: "financeiro",
  },
};

export function getConfiguracoesItems(basePath: "/admin" | "/gestor" | "/consultor"): ConfiguracaoItem[] {
  const items: ConfiguracaoItem[] = [
    {
      permission: "configuracoes.emails",
      href: `${basePath}/configuracoes/emails`,
      title: "E-mails",
      description: "Regras de notificação por e-mail do sistema.",
      icon: Mail,
      section: "geral",
    },
    {
      permission: "configuracoes.feriados",
      href: `${basePath}/configuracoes/feriados`,
      title: "Feriados",
      description: "Calendário de feriados para cálculo de horas e prazos.",
      icon: CalendarDays,
      section: "geral",
    },
    {
      permission: "configuracoes.sharepoint",
      href: `${basePath}/configuracoes/sharepoint`,
      title: "Integrações",
      description: "SharePoint, Teams e sincronização de arquivos com projetos.",
      icon: Plug,
      section: "geral",
    },
    {
      permission: "configuracoes.atividades",
      href: `${basePath}/configuracoes/atividades`,
      title: "Atividades",
      description: "Tipos de atividade usados no apontamento de horas.",
      icon: ListChecks,
      section: "geral",
    },
    {
      permission: "configuracoes.usuarios",
      href: `${basePath}/usuarios`,
      title: "Usuários",
      description: "Gerencie usuários, perfis e acessos da revenda.",
      icon: Users,
      section: "cadastro",
    },
    {
      permission: "configuracoes.clientes",
      href: `${basePath}/clientes`,
      title: "Clientes",
      description: "Cadastro de clientes e vínculos com projetos.",
      icon: Building2,
      section: "cadastro",
    },
    {
      permission: "financeiro.fornecedores",
      financeGated: true,
      href: `${basePath}/fornecedores`,
      title: "Fornecedores",
      description: "Cadastro e gestão de fornecedores PJ e PF.",
      icon: Truck,
      section: "cadastro",
    },
    {
      permission: "configuracoes.gestaoPerfis",
      href: `${basePath}/gestao-perfis`,
      title: "Gestão de perfis",
      description: "Controle quais telas e ações cada perfil pode acessar.",
      icon: UserCog,
      section: "cadastro",
    },
    {
      permission: "configuracoes.reembolso",
      href: `${basePath}/configuracoes/reembolsos`,
      title: "Reembolsos",
      description: "Parâmetros e fluxo de solicitações de reembolso.",
      icon: Receipt,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.empresa",
      href: `${basePath}/configuracoes/financeiro/empresa`,
      title: "Cadastro da empresa",
      description: "Dados da empresa, fiscais, endereço e conta bancária para notas de débito e invoices.",
      icon: Building2,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.categorias",
      href: `${basePath}/configuracoes/financeiro/categorias`,
      title: "Categorias de fornecedor",
      description: "Classificação de fornecedores e parceiros.",
      icon: Tags,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.centrosCusto",
      href: `${basePath}/configuracoes/financeiro/centros-custo`,
      title: "Centros de custo",
      description: "Áreas da empresa para alocação financeira.",
      icon: Layers,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.planoContas",
      href: `${basePath}/configuracoes/financeiro/plano-contas`,
      title: "Plano de contas",
      description: "Estrutura de receitas e despesas da revenda.",
      icon: ListTree,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.tiposCobranca",
      href: `${basePath}/configuracoes/financeiro/tipos-cobranca`,
      title: "Tipos de cobrança",
      description: "Formas de cobrança usadas nas receitas de projetos.",
      icon: Wallet,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.tiposContrato",
      href: `${basePath}/configuracoes/financeiro/tipos-contrato`,
      title: "Tipos de contrato",
      description: "Classificação dos contratos vinculados aos projetos.",
      icon: FileText,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.tiposDespesa",
      href: `${basePath}/configuracoes/financeiro/tipos-despesa`,
      title: "Tipos de despesas",
      description: "Infraestrutura, software, marketing, viagens e demais despesas.",
      icon: ReceiptText,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.tiposReceita",
      href: `${basePath}/configuracoes/financeiro/tipos-receita`,
      title: "Tipos de receita",
      description: "Projeto fechado, T&M, suporte AMS, consultoria e desenvolvimento.",
      icon: TrendingUp,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.impostos",
      href: `${basePath}/configuracoes/financeiro/impostos`,
      title: "Impostos",
      description: "Tipos de impostos e alíquotas usados nos cálculos financeiros.",
      icon: Percent,
      section: "financeiro",
    },
    {
      permission: "configuracoes.financeiro.focusNfe",
      href: `${basePath}/configuracoes/financeiro/focus-nfe`,
      title: "Focus NFe",
      description: "Tokens e dados do prestador para emitir NFSe Nacional no Contas a receber.",
      icon: Plug,
      section: "financeiro",
    },
  ];
  if (!isFinanceiroModuleEnabled()) {
    return items.filter(
      (item) =>
        !item.permission.startsWith("configuracoes.financeiro.") && !item.financeGated,
    );
  }
  return items;
}

export function getConfiguracoesItemsBySection(
  basePath: "/admin" | "/gestor" | "/consultor",
  section: ConfiguracaoSection,
): ConfiguracaoItem[] {
  return getConfiguracoesItems(basePath).filter((item) => item.section === section);
}

const SECTION_HUB_PERMISSION: Record<ConfiguracaoSection, string> = {
  geral: "configuracoes.geral",
  cadastro: "configuracoes.cadastro",
  financeiro: "configuracoes.financeiro",
};

/** Hub da seção ou qualquer card/dado visível nela. */
export function canSeeConfiguracoesSection(
  can: (featureId: string) => boolean,
  section: ConfiguracaoSection,
  basePath: "/admin" | "/gestor" | "/consultor" = "/admin",
): boolean {
  if (can(SECTION_HUB_PERMISSION[section])) {
    if (section === "financeiro" && !isFinanceiroModuleEnabled()) {
      return can("configuracoes.reembolso");
    }
    return true;
  }
  if (section === "cadastro" && canFinanceFeature(can, "financeiro.clientesFinanceiros")) {
    return true;
  }
  const items = getConfiguracoesItemsBySection(basePath, section);
  return items.some((item) =>
    item.financeGated ? canFinanceFeature(can, item.permission) : can(item.permission),
  );
}
