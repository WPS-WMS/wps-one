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
  return {
    label: "Pago",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    card: "border-emerald-200 bg-emerald-50/40",
  };
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

  async function updateStatus(id: string, status: "PAID" | "REJECTED", rejectionReason?: string) {
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
  if (!canAccess) return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Aprovação de reembolsos</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Ao marcar como pago, uma conta a pagar é gerada automaticamente no financeiro. Ao rejeitar, o motivo é
          obrigatório e fica visível para o solicitante.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <PopoverSelect
        id="reimbursement-filter-status"
        value={filter}
        onChange={(v) => setFilter(v)}
        options={[
          { value: "IN_PROGRESS", label: "Aguardando aprovação" },
          { value: "PAID", label: "Pagos" },
          { value: "REJECTED", label: "Rejeitados" },
        ]}
      />
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma solicitação.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const badge = statusBadge(row.status);
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-4 text-sm ${badge.card}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {row.user.name} — {row.project.name}
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-[color:var(--muted-foreground)]">
                  {row.type.name} · {formatarMoeda(row.amountCents / 100)} · {formatarData(row.createdAt)}
                </p>
                <p className="mt-1">{row.description}</p>
                {row.status === "REJECTED" && row.rejectionReason && (
                  <p className="mt-2 text-xs text-red-700">
                    <span className="font-semibold">Motivo da recusa:</span> {row.rejectionReason}
                  </p>
                )}
                {filter === "IN_PROGRESS" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void updateStatus(row.id, "PAID")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white"
                    >
                      Aprovar / Pagar
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
                disabled={rejectSaving || !rejectReason.trim()}
                onClick={() => void confirmReject()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {rejectSaving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
                Confirmar recusa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
