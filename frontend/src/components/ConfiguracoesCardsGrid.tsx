"use client";

import { Link } from "@/components/Link";
import {
  CONFIGURACAO_SECTION_META,
  getConfiguracoesItems,
  getConfiguracoesItemsBySection,
  type ConfiguracaoItem,
  type ConfiguracaoSection,
} from "@/lib/configuracoesItems";
import { canFinanceFeature } from "@/lib/financeiroEnv";

type ConfiguracoesCardsGridProps = {
  basePath: "/admin" | "/gestor" | "/consultor";
  can: (featureId: string) => boolean;
  /** Quando informado, exibe apenas a seção. Sem isso, agrupa todas. */
  section?: ConfiguracaoSection;
};

function filterVisible(
  items: ConfiguracaoItem[],
  can: (featureId: string) => boolean,
): ConfiguracaoItem[] {
  return items.filter((item) =>
    item.financeGated ? canFinanceFeature(can, item.permission) : can(item.permission),
  );
}

function CardsGrid({ items }: { items: ConfiguracaoItem[] }) {
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

export function ConfiguracoesCardsGrid({ basePath, can, section }: ConfiguracoesCardsGridProps) {
  if (section) {
    const items = filterVisible(getConfiguracoesItemsBySection(basePath, section), can);
    if (items.length === 0) {
      return (
        <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">
          Nenhuma configuração disponível para o seu perfil nesta seção.
        </p>
      );
    }
    return <CardsGrid items={items} />;
  }

  const allVisible = filterVisible(getConfiguracoesItems(basePath), can);
  if (allVisible.length === 0) {
    return (
      <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">
        Nenhuma configuração disponível para o seu perfil.
      </p>
    );
  }

  const sections: ConfiguracaoSection[] = ["geral", "cadastro", "financeiro"];
  return (
    <div className="space-y-8">
      {sections.map((sec) => {
        const items = allVisible.filter((item) => item.section === sec);
        if (items.length === 0) return null;
        const meta = CONFIGURACAO_SECTION_META[sec];
        return (
          <section key={sec}>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-[color:var(--foreground)]">{meta.title}</h2>
              <p className="text-sm text-[color:var(--muted-foreground)]">{meta.description}</p>
            </div>
            <CardsGrid items={items} />
          </section>
        );
      })}
    </div>
  );
}
