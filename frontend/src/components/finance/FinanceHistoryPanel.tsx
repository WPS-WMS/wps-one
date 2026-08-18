"use client";

import { Loader2 } from "lucide-react";

export type FinanceHistoryRow = {
  id: string;
  action: string;
  field?: string | null;
  fieldLabel?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  details?: string | null;
  createdAt: string;
  user: { id: string; name: string; email?: string };
};

export type FinanceAuditMeta = {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Atualização",
  CANCEL: "Cancelamento",
  APPROVE: "Aprovação",
  PAYMENT: "Pagamento",
  PAYMENT_REVERT: "Estorno de pagamento",
  RECEIPT: "Recebimento",
  RECEIPT_REVERT: "Estorno de recebimento",
  STATUS: "Status",
  INVOICE: "Nota fiscal",
  ATTACHMENT: "Anexo",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export function FinanceHistoryPanel({
  history,
  loading,
  audit,
}: {
  history: FinanceHistoryRow[];
  loading?: boolean;
  audit?: FinanceAuditMeta | null;
}) {
  return (
    <div className="space-y-3">
      {audit ? (
        <div
          className="grid gap-1 rounded-lg border p-3 text-xs text-[color:var(--muted-foreground)] sm:grid-cols-2"
          style={{ borderColor: "var(--border)" }}
        >
          <p>Criado por: {audit.createdByName ?? "—"}</p>
          <p>Criado em: {formatDateTime(audit.createdAt)}</p>
          <p>Alterado por: {audit.updatedByName ?? "—"}</p>
          <p>Alterado em: {formatDateTime(audit.updatedAt)}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--muted-foreground)]">Nenhum registro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-black/5 text-left text-xs uppercase text-[color:var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Alteração</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 whitespace-nowrap text-[color:var(--muted-foreground)]">
                    {formatDateTime(h.createdAt)}
                  </td>
                  <td className="px-3 py-2">{h.user?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div>{h.details || ACTION_LABELS[h.action] || h.action}</div>
                    {(h.field || h.fieldLabel) && (h.oldValue || h.newValue) ? (
                      <div className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                        {h.fieldLabel || h.field}: {h.oldValue ? `${h.oldValue} → ` : ""}
                        {h.newValue ?? "—"}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
