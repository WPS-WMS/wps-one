"use client";

import { Link } from "@/components/Link";
import { getConfiguracoesItems } from "@/lib/configuracoesItems";
import { canFinanceFeature } from "@/lib/financeiroEnv";

type ConfiguracoesCardsGridProps = {
  basePath: "/admin" | "/gestor" | "/consultor";
  can: (featureId: string) => boolean;
};

export function ConfiguracoesCardsGrid({ basePath, can }: ConfiguracoesCardsGridProps) {
  const items = getConfiguracoesItems(basePath).filter((item) =>
    item.financeGated ? canFinanceFeature(can, item.permission) : can(item.permission),
  );

  if (items.length === 0) {
    return (
      <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">
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
            className="group flex items-start gap-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm transition-all hover:border-[color:var(--primary)]/45 hover:shadow-md min-h-[7.5rem]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[color:var(--primary)]/10 text-[color:var(--primary)] transition-colors group-hover:bg-[color:var(--primary)]/15">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-[color:var(--foreground)]">{item.title}</span>
              <span className="mt-1 block text-sm leading-snug text-[color:var(--muted-foreground)]">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
