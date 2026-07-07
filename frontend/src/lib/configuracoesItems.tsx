import type { LucideIcon } from "lucide-react";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import {
  Building2,
  CalendarDays,
  Cloud,
  ListChecks,
  Layers,
  ListTree,
  Mail,
  Plug,
  Receipt,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  Wallet,
  FileText,
  ReceiptText,
  Truck,
} from "lucide-react";

export type ConfiguracaoItem = {
  permission: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Exige módulo financeiro QA + permissão financeira. */
  financeGated?: boolean;
};

export function getConfiguracoesItems(basePath: "/admin" | "/gestor" | "/consultor"): ConfiguracaoItem[] {
  const items: ConfiguracaoItem[] = [
    {
      permission: "configuracoes.usuarios",
      href: `${basePath}/usuarios`,
      title: "Usuários",
      description: "Gerencie usuários, perfis e acessos da revenda.",
      icon: Users,
    },
    {
      permission: "configuracoes.permissoes",
      href: `${basePath}/permissoes`,
      title: "Permissões",
      description: "Solicitações e aprovações de acesso dos colaboradores.",
      icon: ShieldCheck,
    },
    {
      permission: "configuracoes.clientes",
      href: `${basePath}/clientes`,
      title: "Clientes",
      description: "Cadastro de clientes e vínculos com projetos.",
      icon: Building2,
    },
    {
      permission: "financeiro.fornecedores",
      financeGated: true,
      href: `${basePath}/fornecedores`,
      title: "Fornecedores",
      description: "Cadastro e gestão de fornecedores PJ e PF.",
      icon: Truck,
    },
    {
      permission: "configuracoes.gestaoPerfis",
      href: `${basePath}/gestao-perfis`,
      title: "Gestão de perfis",
      description: "Controle quais telas e ações cada perfil pode acessar.",
      icon: UserCog,
    },
    {
      permission: "configuracoes.atividades",
      href: `${basePath}/configuracoes/atividades`,
      title: "Atividades",
      description: "Tipos de atividade usados no apontamento de horas.",
      icon: ListChecks,
    },
    {
      permission: "configuracoes.emails",
      href: `${basePath}/configuracoes/emails`,
      title: "E-mails",
      description: "Regras de notificação por e-mail do sistema.",
      icon: Mail,
    },
    {
      permission: "configuracoes.feriados",
      href: `${basePath}/configuracoes/feriados`,
      title: "Feriados",
      description: "Calendário de feriados para cálculo de horas e prazos.",
      icon: CalendarDays,
    },
    {
      permission: "configuracoes.sharepoint",
      href: `${basePath}/configuracoes/sharepoint`,
      title: "Integrações",
      description: "SharePoint, Teams e sincronização de arquivos com projetos.",
      icon: Plug,
    },
    {
      permission: "configuracoes.reembolso",
      href: `${basePath}/configuracoes/reembolsos`,
      title: "Reembolsos",
      description: "Parâmetros e fluxo de solicitações de reembolso.",
      icon: Receipt,
    },
    {
      permission: "configuracoes.financeiro.categorias",
      href: `${basePath}/configuracoes/financeiro/categorias`,
      title: "Categorias de fornecedor",
      description: "Classificação de fornecedores e parceiros.",
      icon: Tags,
    },
    {
      permission: "configuracoes.financeiro.centrosCusto",
      href: `${basePath}/configuracoes/financeiro/centros-custo`,
      title: "Centros de custo",
      description: "Áreas da empresa para alocação financeira.",
      icon: Layers,
    },
    {
      permission: "configuracoes.financeiro.planoContas",
      href: `${basePath}/configuracoes/financeiro/plano-contas`,
      title: "Plano de contas",
      description: "Estrutura de receitas e despesas da revenda.",
      icon: ListTree,
    },
    {
      permission: "configuracoes.financeiro.tiposCobranca",
      href: `${basePath}/configuracoes/financeiro/tipos-cobranca`,
      title: "Tipos de cobrança",
      description: "Formas de cobrança usadas nas receitas de projetos.",
      icon: Wallet,
    },
    {
      permission: "configuracoes.financeiro.tiposContrato",
      href: `${basePath}/configuracoes/financeiro/tipos-contrato`,
      title: "Tipos de contrato",
      description: "Classificação dos contratos vinculados aos projetos.",
      icon: FileText,
    },
    {
      permission: "configuracoes.financeiro.tiposDespesa",
      href: `${basePath}/configuracoes/financeiro/tipos-despesa`,
      title: "Tipos de despesa corporativa",
      description: "Infraestrutura, software, marketing, viagens e demais despesas.",
      icon: ReceiptText,
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
