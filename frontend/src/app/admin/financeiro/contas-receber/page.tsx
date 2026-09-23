"use client";

import dynamic from "next/dynamic";

const ReceivablesPageContent = dynamic(
  () =>
    import("@/components/finance/ReceivablesPageContent").then((m) => ({
      default: m.ReceivablesPageContent,
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

export default function AdminContasReceberPage() {
  return <ReceivablesPageContent />;
}
