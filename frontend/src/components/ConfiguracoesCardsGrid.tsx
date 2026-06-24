"use client";

import { Link } from "@/components/Link";
import { getConfiguracoesItems } from "@/lib/configuracoesItems";

type ConfiguracoesCardsGridProps = {
  basePath: "/admin" | "/gestor" | "/consultor";
  can: (featureId: string) => boolean;
};

export function ConfiguracoesCardsGrid({ basePath, can }: ConfiguracoesCardsGridProps) {
  const items = getConfiguracoesItems(basePath).filter((item) => can(item.permission));

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Nenhuma configuração disponível para o seu perfil.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-400 hover:shadow-md min-h-[7.5rem]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-slate-900">{item.title}</span>
              <span className="mt-1 block text-sm leading-snug text-slate-500">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
