"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

type ReimbursementRequest = {
  id: string;
  description: string;
  amountCents: number;
  status: string;
  paymentTo?: string | null;
  createdAt: string;
  rejectionReason?: string | null;
  user: { name: string; email: string };
  project: { name: string };
  type: { name: string };
};

function statusBadge(status: string) {
  if (status === "IN_PROGRESS") {
    return {
      label: "Aguardando aprovação",
      className: "bg-amber-100 text-amber-800 border-amber-200",
      card: "border-amber-200 bg-amber-50/40",
    };
  }
  if (status === "REJECTED") {
    return {
      label: "Rejeitado",
      className: "bg-red-100 text-red-800 border-red-200",
      card: "border-red-200 bg-red-50/40",
    };
  }
  if (status === "APPROVED") {
    return {
      label: "Aprovado",
      className: "bg-sky-100 text-sky-800 border-sky-200",
      card: "border-sky-200 bg-sky-50/40",
    };
  }
  return {
    label: "Pago",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    card: "border-emerald-200 bg-emerald-50/40",
  };
}

function paymentToLabel(value: string | null | undefined): string {
  if (value === "EMPRESA") return "Empresa";
  if (value === "CONSULTOR") return "Consultor";
  return "—";
}

export function ReimbursementApprovalPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => can("configuracoes.reembolso"), [can]);

  const [rows, setRows] = useState<ReimbursementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("IN_PROGRESS");
  const [rejectTarget, setRejectTarget] = useState<ReimbursementRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/api/reimbursements/admin/requests?status=${encodeURIComponent(filter)}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar solicitações.");
      setRows([]);
    } else {
      setError(null);
      setRows(Array.isArray(body) ? body : []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load, filter]);

  async function updateStatus(id: string, status: "APPROVED" | "REJECTED", rejectionReason?: string) {
    const r = await apiFetch(`/api/reimbursements/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao atualizar.");
      return false;
    }
    await load();
    return true;
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError("Informe o motivo da recusa.");
      return;
    }
    setRejectSaving(true);
    setError(null);
    const ok = await updateStatus(rejectTarget.id, "REJECTED", reason);
    setRejectSaving(false);
    if (ok) {
      setRejectTarget(null);
      setRejectReason("");
    }
  }

  if (!permissionsReady) return null;
  if (!canAccess) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Sem permissão.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Aprovação de reembolsos</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Ao aprovar, o status fica &quot;Aprovado&quot; e as contas financeiras são geradas automaticamente
          (receber e/ou pagar, conforme &quot;Pagamento para&quot;). O status só muda para &quot;Pago&quot; quando a
          liquidação for marcada em Contas a pagar / Contas a receber. Ao rejeitar, o motivo é
          obrigatório e fica visível para o solicitante.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <PopoverSelect
        id="reimbursement-filter-status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "IN_PROGRESS", label: "Aguardando aprovação" },
          { value: "APPROVED", label: "Aprovados" },
          { value: "PAID", label: "Pagos" },
          { value: "REJECTED", label: "Rejeitados" },
        ]}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma solicitação neste filtro.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const badge = statusBadge(row.status);
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-4 ${badge.card}`}
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {row.type.name} • {formatarMoeda(row.amountCents / 100)}
                    </p>
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      {row.user.name} — {row.project.name}
                    </p>
                    <p className="mt-1 text-sm">{row.description}</p>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      Pagamento para: {paymentToLabel(row.paymentTo)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      {formatarData(row.createdAt.slice(0, 10))}
                    </p>
                  </div>
                </div>
                {row.status === "REJECTED" && row.rejectionReason && (
                  <p className="mt-2 text-xs text-red-700">Motivo: {row.rejectionReason}</p>
                )}
                {row.status === "IN_PROGRESS" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void updateStatus(row.id, "APPROVED")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRejectReason("");
                        setRejectTarget(row);
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs text-red-600"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Motivo da recusa</h3>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  O solicitante verá este motivo em Minhas solicitações.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (rejectSaving) return;
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className="rounded-lg p-1 hover:bg-black/5"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm">
              {rejectTarget.user.name} — {formatarMoeda(rejectTarget.amountCents / 100)}
            </p>
            <textarea
              className="mt-3 w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
              style={{ borderColor: "var(--border)" }}
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Descreva o motivo da recusa..."
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={rejectSaving}
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={rejectSaving}
                onClick={() => void confirmReject()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {rejectSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
