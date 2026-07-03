"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";

type ReimbursementRequest = {
  id: string;
  description: string;
  amountCents: number;
  status: string;
  createdAt: string;
  user: { name: string; email: string };
  project: { name: string };
  type: { name: string };
};

export function ReimbursementApprovalPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => can("configuracoes.reembolso"), [can]);

  const [rows, setRows] = useState<ReimbursementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("IN_PROGRESS");

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
      return;
    }
    await load();
  }

  if (!permissionsReady) return null;
  if (!canAccess) return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Aprovação de reembolsos</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Ao marcar como pago, uma conta a pagar é gerada automaticamente no financeiro.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <select
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--border)" }}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="IN_PROGRESS">Em análise</option>
        <option value="PAID">Pagos</option>
        <option value="REJECTED">Rejeitados</option>
      </select>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma solicitação.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
              <p className="font-medium">{row.user.name} — {row.project.name}</p>
              <p className="text-[color:var(--muted-foreground)]">{row.type.name} · {formatarMoeda(row.amountCents / 100)} · {formatarData(row.createdAt)}</p>
              <p className="mt-1">{row.description}</p>
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
                      const reason = window.prompt("Motivo da rejeição:");
                      if (reason?.trim()) void updateStatus(row.id, "REJECTED", reason.trim());
                    }}
                    className="rounded-lg border px-3 py-1.5 text-xs text-red-600"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
