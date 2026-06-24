import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  Cloud,
  ListChecks,
  Mail,
  Plug,
  Receipt,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

export type ConfiguracaoItem = {
  permission: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function getConfiguracoesItems(basePath: "/admin" | "/gestor" | "/consultor"): ConfiguracaoItem[] {
  return [
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
  ];
}
