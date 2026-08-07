"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  FinanceCollapsibleFilters,
  FinancePageHeader,
} from "@/components/finance/FinancePageHeader";

type ReimbursementRequest = {
  id: string;
  description: string;
  amountCents: number;
  status: string;
  paymentTo?: string | null;
  createdAt: string;
  rejectionReason?: string | null;
  user: { id?: string; name: string; email: string };
  project: { id?: string; name: string };
  type: { name: string };
};

type SelectOption = { value: string; label: string };

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
  if (status === "CANCELLED") {
    return {
      label: "Cancelado",
      className: "bg-zinc-100 text-zinc-800 border-zinc-200",
      card: "border-zinc-200 bg-zinc-50/40",
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
  const [paymentToFilter, setPaymentToFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [userOptions, setUserOptions] = useState<SelectOption[]>([{ value: "", label: "Todos" }]);
  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([{ value: "", label: "Todos" }]);
  const [rejectTarget, setRejectTarget] = useState<ReimbursementRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    let cancelled = false;
    void (async () => {
      const [usersRes, projectsRes] = await Promise.all([
        apiFetch("/api/users/for-select?scope=relatorios&status=ativos"),
        apiFetch("/api/projects?light=true"),
      ]);
      if (cancelled) return;
      const usersBody = await usersRes.json().catch(() => null);
      const projectsBody = await projectsRes.json().catch(() => null);
      if (usersRes.ok && Array.isArray(usersBody)) {
        setUserOptions([
          { value: "", label: "Todos" },
          ...usersBody
            .map((u: { id?: string; name?: string }) => ({
              value: String(u.id ?? ""),
              label: String(u.name ?? "").trim() || "Usuário",
            }))
            .filter((o: SelectOption) => o.value)
            .sort((a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, "pt-BR")),
        ]);
      }
      const projectsList = Array.isArray(projectsBody)
        ? projectsBody
        : Array.isArray(projectsBody?.projects)
          ? projectsBody.projects
          : [];
      if (projectsRes.ok) {
        setProjectOptions([
          { value: "", label: "Todos" },
          ...projectsList
            .map((p: { id?: string; name?: string }) => ({
              value: String(p.id ?? ""),
              label: String(p.name ?? "").trim() || "Projeto",
            }))
            .filter((o: SelectOption) => o.value)
            .sort((a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, "pt-BR")),
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionsReady, canAccess]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    if (paymentToFilter) params.set("paymentTo", paymentToFilter);
    if (userFilter) params.set("userId", userFilter);
    if (projectFilter) params.set("projectId", projectFilter);
    const r = await apiFetch(`/api/reimbursements/admin/requests?${params.toString()}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar solicitações.");
      setRows([]);
    } else {
      setError(null);
      setRows(Array.isArray(body) ? body : []);
    }
    setLoading(false);
  }, [filter, paymentToFilter, userFilter, projectFilter]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  async function updateStatus(
    id: string,
    status: "APPROVED" | "REJECTED" | "IN_PROGRESS",
    rejectionReason?: string,
  ) {
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

  async function approveRequest(id: string) {
    if (approvingId || rejectSaving || revertingId) return;
    setApprovingId(id);
    setError(null);
    try {
      await updateStatus(id, "APPROVED");
    } finally {
      setApprovingId(null);
    }
  }

  async function revertRequest(id: string) {
    if (approvingId || rejectSaving || revertingId) return;
    setRevertingId(id);
    setError(null);
    try {
      await updateStatus(id, "IN_PROGRESS");
    } finally {
      setRevertingId(null);
    }
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

  const busy = approvingId !== null || rejectSaving || revertingId !== null;
  const canRevertStatus = (status: string) =>
    status === "APPROVED" || status === "CANCELLED";

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter !== "IN_PROGRESS") n += 1;
    if (paymentToFilter) n += 1;
    if (userFilter) n += 1;
    if (projectFilter) n += 1;
    return n;
  }, [filter, paymentToFilter, userFilter, projectFilter]);

  function clearFilters() {
    setFilter("IN_PROGRESS");
    setPaymentToFilter("");
    setUserFilter("");
    setProjectFilter("");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <FinancePageHeader
        title="Aprovação de reembolsos"
        subtitle='Ao aprovar, o status fica "Aprovado" e as contas financeiras são geradas automaticamente (receber e/ou pagar, conforme "Pagamento para"). O status só muda para "Pago" quando a liquidação for marcada em Contas a pagar / Contas a receber. Ao cancelar a conta no financeiro, o reembolso fica "Cancelado" e pode ser revertido para aguardar nova aprovação. Ao rejeitar, o motivo é obrigatório e fica visível para o solicitante.'
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <FinanceCollapsibleFilters activeCount={activeFilterCount} onClear={clearFilters}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Status</label>
            <PopoverSelect
              id="reimbursement-filter-status"
              value={filter}
              onChange={setFilter}
              placeholder="Status"
              checklist={false}
              options={[
                { value: "IN_PROGRESS", label: "Aguardando aprovação" },
                { value: "APPROVED", label: "Aprovados" },
                { value: "PAID", label: "Pagos" },
                { value: "CANCELLED", label: "Cancelados" },
                { value: "REJECTED", label: "Rejeitados" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Pagamento para
            </label>
            <PopoverSelect
              id="reimbursement-filter-payment-to"
              value={paymentToFilter}
              onChange={setPaymentToFilter}
              placeholder="Todos"
              checklist={false}
              options={[
                { value: "", label: "Todos" },
                { value: "CONSULTOR", label: "Consultor" },
                { value: "EMPRESA", label: "Empresa" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Usuário</label>
            <PopoverSelect
              id="reimbursement-filter-user"
              value={userFilter}
              onChange={setUserFilter}
              placeholder="Todos"
              checklist={false}
              options={userOptions}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Projeto</label>
            <PopoverSelect
              id="reimbursement-filter-project"
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="Todos"
              checklist={false}
              options={projectOptions}
            />
          </div>
        </div>
      </FinanceCollapsibleFilters>

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
                      disabled={busy}
                      onClick={() => void approveRequest(row.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
                    >
                      {approvingId === row.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        setRejectReason("");
                        setRejectTarget(row);
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs text-red-600 disabled:opacity-60"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
                {canRevertStatus(row.status) && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revertRequest(row.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
                      style={{ borderColor: "var(--border)" }}
                      title="Voltar para Aguardando aprovação"
                    >
                      {revertingId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Reverter
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
