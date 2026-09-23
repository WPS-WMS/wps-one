"use client";

import dynamic from "next/dynamic";

const PayablesPageContent = dynamic(
  () =>
    import("@/components/finance/PayablesPageContent").then((m) => ({
      default: m.PayablesPageContent,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[color:var(--muted-foreground)]">
        Carregando…
      </div>
    ),
  },
);

export default function AdminContasPagarPage() {
  return <PayablesPageContent />;
}
