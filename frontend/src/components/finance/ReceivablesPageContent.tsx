"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Loader2, Pencil, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type Option = { id: string; name: string };
type ProjectOption = Option & {
  clientId?: string | null;
  client?: { id?: string | null } | null;
};

type ReceivableRow = {
  id: string;
  listRowId?: string;
  installmentId?: string | null;
  installmentNumber?: number | null;
  description: string;
  totalAmountCents: number;
  totalAmountFormatted: string;
  competenceDate: string | null;
  competenceMonthLabel: string | null;
  kind: string;
  status: string;
  clientId?: string;
  clientName: string;
  projectId?: string | null;
  projectName: string | null;
  contractTitle: string | null;
  financialAccountId?: string;
  financialAccountName: string;
  nfNumber: string | null;
  nfEmissionDate: string | null;
  nextDueDate: string | null;
  nextInstallmentId?: string | null;
  paid: boolean;
  incomplete: boolean;
  installmentCount: number;
};

type ReceivableDetail = ReceivableRow & {
  notes: string | null;
  netAmountCents: number | null;
  taxAmountCents: number | null;
  retentionAmountCents: number | null;
  invoice: {
    nfNumber: string;
    nfSeries: string | null;
    emissionDate: string;
    grossAmountCents: number;
    netAmountCents: number;
    taxAmountCents: number;
    retentionAmountCents: number;
  } | null;
  installments: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    amountCents: number;
    status: string;
    receivedAt: string | null;
  }[];
  allocations: {
    costCenterId?: string;
    costCenterName: string;
    projectId?: string | null;
    projectName: string | null;
    amountCents: number;
  }[];
};

type AgingSummary = {
  buckets: Record<string, { count: number; totalCents: number }>;
  overdueTotalCents: number;
  overdueCount: number;
};

const STATUS_LABELS: Record<string, string> = {
  PREVISTO: "Previsto",
  FATURADO: "Faturado",
  RECEBIDO: "Faturado",
  ATRASADO: "Previsto",
  CANCELADO: "Cancelado",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  FATURADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELADO: "bg-red-100 text-red-800 border-red-200",
  PREVISTO: "bg-slate-100 text-slate-700 border-slate-200",
  RECEBIDO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ATRASADO: "bg-slate-100 text-slate-700 border-slate-200",
};

function displayReceivableStatus(status: string, nfNumber?: string | null): string {
  if (status === "CANCELADO") return "CANCELADO";
  if (status === "FATURADO" || status === "RECEBIDO" || nfNumber) return "FATURADO";
  return "PREVISTO";
}

function StatusBadge({ status, nfNumber }: { status: string; nfNumber?: string | null }) {
  const display = displayReceivableStatus(status, nfNumber);
  const label = STATUS_LABELS[display] ?? display;
  const cls = STATUS_BADGE_CLASS[display] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

const BUCKET_LABELS: Record<string, string> = {
  A_VENCER: "A vencer",
  "1_30": "1–30 dias",
  "31_60": "31–60 dias",
  "61_90": "61–90 dias",
  "90_PLUS": "90+ dias",
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

function dash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

export function ReceivablesPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.contasReceber"), [can]);

  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [competenceMonth, setCompetenceMonth] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [markingReceivedId, setMarkingReceivedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    nfNumber: "",
    nfSeries: "",
    emissionDate: new Date().toISOString().slice(0, 10),
    grossAmount: "",
    netAmount: "",
    taxAmount: "",
    retentionAmount: "",
  });

  const [form, setForm] = useState({
    description: "",
    clientId: "",
    financialAccountId: "",
    amount: "",
    competenceDate: "",
    dueDate: new Date().toISOString().slice(0, 10),
    installmentCount: "1",
    costCenterId: "",
    projectId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (competenceMonth) params.set("competenceMonth", competenceMonth);
    const [rRes, cRes, pRes, ccRes, accRes, agingRes] = await Promise.all([
      apiFetch(`/api/receivables?${params.toString()}`),
      apiFetch("/api/clients"),
      apiFetch("/api/projects?light=true"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-accounts"),
      apiFetch("/api/receivables/aging"),
    ]);
    const rBody = await rRes.json().catch(() => null);
    if (!rRes.ok) {
      setError(typeof rBody?.error === "string" ? rBody.error : "Erro ao carregar contas.");
      setLoading(false);
      return;
    }
    setRows(Array.isArray(rBody) ? rBody : []);
    const cBody = await cRes.json().catch(() => null);
    setClients(cRes.ok && Array.isArray(cBody) ? cBody.map((c: Option) => ({ id: c.id, name: c.name })) : []);
    const pBody = await pRes.json().catch(() => null);
    setProjects(
      pRes.ok && Array.isArray(pBody)
        ? pBody.map((p: ProjectOption) => ({
            id: p.id,
            name: p.name,
            clientId: p.clientId ?? p.client?.id ?? null,
          }))
        : [],
    );
    const ccBody = await ccRes.json().catch(() => null);
    setCostCenters(ccRes.ok && Array.isArray(ccBody) ? ccBody.filter((c: Option & { isActive?: boolean }) => c.isActive !== false) : []);
    const accBody = await accRes.json().catch(() => null);
    setAccounts(
      accRes.ok && Array.isArray(accBody)
        ? accBody.filter((a: Option & { type: string; isActive?: boolean }) => a.type === "RECEITA" && a.isActive !== false)
        : [],
    );
    const agingBody = await agingRes.json().catch(() => null);
    setAging(agingRes.ok ? (agingBody as AgingSummary) : null);
    setLoading(false);
  }, [filterStatus, competenceMonth]);

  const projectsForClient = useMemo(() => {
    if (!form.clientId) return [];
    return projects.filter((p) => p.clientId === form.clientId);
  }, [projects, form.clientId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  async function openDetail(id: string) {
    setDetailId(id);
    setInvoiceOpen(false);
    const r = await apiFetch(`/api/receivables/${id}`);
    const body = await r.json().catch(() => null);
    const d = r.ok ? (body as ReceivableDetail) : null;
    setDetail(d);
    if (d) {
      setInvoiceForm({
        nfNumber: d.invoice?.nfNumber ?? "",
        nfSeries: d.invoice?.nfSeries ?? "",
        emissionDate: d.invoice?.emissionDate ?? new Date().toISOString().slice(0, 10),
        grossAmount: d.invoice ? String(d.invoice.grossAmountCents / 100) : String(d.totalAmountFormatted ? "" : ""),
        netAmount: d.invoice ? String(d.invoice.netAmountCents / 100) : "",
        taxAmount: d.invoice ? String(d.invoice.taxAmountCents / 100) : "",
        retentionAmount: d.invoice ? String(d.invoice.retentionAmountCents / 100) : "",
      });
    }
  }

  async function saveReceivable() {
    setSaving(true);
    setError(null);
    const amountCents = moedaParaCentavos(form.amount);
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      clientId: form.clientId,
      financialAccountId: form.financialAccountId,
      amount: form.amount,
      totalAmountCents: amountCents,
      competenceDate: form.competenceDate || null,
      dueDate: form.dueDate,
      installmentCount: Number(form.installmentCount) || 1,
      projectId: form.projectId || null,
      allocations: [
        {
          costCenterId: form.costCenterId,
          projectId: form.projectId || null,
          percentBps: 10000,
        },
      ],
    };
    const r = await apiFetch(editingId ? `/api/receivables/${editingId}` : "/api/receivables", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    await load();
  }

  function openCreateModal() {
    setEditingId(null);
    setCancelConfirmOpen(false);
    setForm({
      description: "",
      clientId: "",
      financialAccountId: "",
      amount: "",
      competenceDate: "",
      dueDate: new Date().toISOString().slice(0, 10),
      installmentCount: "1",
      costCenterId: "",
      projectId: "",
    });
    setModalOpen(true);
  }

  async function openEditReceivable(id: string) {
    setError(null);
    const r = await apiFetch(`/api/receivables/${id}`);
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar conta.");
      return;
    }
    const d = body as ReceivableDetail & {
      clientId?: string;
      financialAccountId?: string;
      allocations?: { costCenterId: string; projectId?: string | null }[];
    };
    setEditingId(id);
    setForm({
      description: d.description ?? "",
      clientId: d.clientId ?? "",
      financialAccountId: d.financialAccountId ?? "",
      amount: String((d.totalAmountCents ?? 0) / 100),
      competenceDate: d.competenceDate ?? "",
      dueDate: d.nextDueDate ?? new Date().toISOString().slice(0, 10),
      installmentCount: String(d.installmentCount || 1),
      costCenterId: d.allocations?.[0]?.costCenterId ?? "",
      projectId: d.projectId ?? d.allocations?.[0]?.projectId ?? "",
    });
    setCancelConfirmOpen(false);
    setModalOpen(true);
  }

  async function confirmCancelReceivable() {
    if (!editingId) return;
    const id = editingId;
    setSaving(true);
    setError(null);
    const r = await apiFetch(`/api/receivables/${id}/cancel`, { method: "PATCH" });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    setCancelConfirmOpen(false);
    setModalOpen(false);
    setEditingId(null);
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
    }
    await load();
  }

  async function receiveInstallment(installmentId: string) {
    if (!detailId) return;
    const r = await apiFetch(`/api/receivables/${detailId}/installments/${installmentId}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receivedAt: new Date().toISOString().slice(0, 10) }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao registrar recebimento.");
      return;
    }
    await openDetail(detailId);
    await load();
  }

  async function markAsReceived(row: ReceivableRow) {
    const markKey = row.listRowId ?? row.id;
    if (markingReceivedId) return;
    setMarkingReceivedId(markKey);
    setError(null);
    try {
      const installmentId = row.installmentId ?? row.nextInstallmentId ?? null;
      const r = installmentId
        ? await apiFetch(`/api/receivables/${row.id}/installments/${installmentId}/receive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receivedAt: new Date().toISOString().slice(0, 10) }),
          })
        : await apiFetch(`/api/receivables/${row.id}/mark-received`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receivedAt: new Date().toISOString().slice(0, 10) }),
          });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao marcar como recebido.");
        return;
      }
      await load();
      if (detailId === row.id) await openDetail(row.id);
    } finally {
      setMarkingReceivedId(null);
    }
  }

  async function unmarkAsReceived(row: ReceivableRow) {
    const markKey = row.listRowId ?? row.id;
    if (markingReceivedId) return;
    setMarkingReceivedId(markKey);
    setError(null);
    try {
      const installmentId = row.installmentId ?? row.nextInstallmentId ?? null;
      const r = installmentId
        ? await apiFetch(`/api/receivables/${row.id}/installments/${installmentId}/unreceive`, {
            method: "POST",
          })
        : await apiFetch(`/api/receivables/${row.id}/unmark-received`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao desmarcar recebimento.");
        return;
      }
      await load();
      if (detailId === row.id) await openDetail(row.id);
    } finally {
      setMarkingReceivedId(null);
    }
  }

  async function saveInvoice() {
    if (!detailId) return;
    setSaving(true);
    const r = await apiFetch(`/api/receivables/${detailId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nfNumber: invoiceForm.nfNumber.trim(),
        nfSeries: invoiceForm.nfSeries.trim() || null,
        emissionDate: invoiceForm.emissionDate,
        grossAmount: invoiceForm.grossAmount,
        netAmount: invoiceForm.netAmount,
        taxAmount: invoiceForm.taxAmount || 0,
        retentionAmount: invoiceForm.retentionAmount || 0,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao faturar.");
      return;
    }
    setInvoiceOpen(false);
    await openDetail(detailId);
    await load();
  }

  async function cancelReceivable() {
    if (!detailId || !window.confirm("Cancelar esta conta a receber?")) return;
    const r = await apiFetch(`/api/receivables/${detailId}/cancel`, { method: "PATCH" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    setDetailId(null);
    await load();
  }

  async function sendAlerts() {
    setSendingAlerts(true);
    const r = await apiFetch("/api/receivables/alerts/send", { method: "POST" });
    const body = await r.json().catch(() => null);
    setSendingAlerts(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao enviar alertas.");
      return;
    }
    alert(`Alertas enviados: ${body?.sent ?? 0}`);
  }

  if (!permissionsReady) return null;
  if (!canAccess) return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a receber</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Faturamento e reembolsos a cobrar — acompanhe NF, previsão de pagamento e status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sendingAlerts}
            onClick={() => void sendAlerts()}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {sendingAlerts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Enviar alertas
          </button>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" /> Nova conta
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {aging && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold">Aging financeiro</h2>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            {aging.overdueCount} parcela(s) em atraso — total {formatarMoeda(aging.overdueTotalCents / 100)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(BUCKET_LABELS).map(([key, label]) => {
              const b = aging.buckets[key];
              return (
                <div key={key} className="rounded-lg bg-black/5 p-2 text-center">
                  <div className="text-xs text-[color:var(--muted-foreground)]">{label}</div>
                  <div className="text-sm font-semibold">{formatarMoeda((b?.totalCents ?? 0) / 100)}</div>
                  <div className="text-xs">{b?.count ?? 0} título(s)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select className={inputClass + " max-w-xs"} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="PREVISTO">Previsto</option>
          <option value="FATURADO">Faturado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <input
          type="month"
          className={inputClass + " max-w-xs"}
          value={competenceMonth}
          onChange={(e) => setCompetenceMonth(e.target.value)}
          title="Competência"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma conta a receber.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#1e3a5f] text-white">
              <tr>
                <th className="px-2 py-2 text-left whitespace-nowrap font-semibold">Cliente</th>
                <th className="px-2 py-2 text-left whitespace-nowrap font-semibold">Projeto</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Contrato</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Data</th>
                <th className="px-2 py-2 text-right whitespace-nowrap font-semibold">Valor</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Dt Emissão NF</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Nro NF</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Prev pagamento</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Pago?</th>
                <th className="px-2 py-2 text-left whitespace-nowrap font-semibold">Status</th>
                <th className="px-2 py-2 text-center whitespace-nowrap font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = row.listRowId ?? row.id;
                const isPaid = row.paid || row.status === "RECEBIDO";
                const canToggleReceived =
                  row.status === "PREVISTO" ||
                  row.status === "FATURADO" ||
                  row.status === "ATRASADO" ||
                  row.status === "RECEBIDO";
                const projectLabel = row.projectName || row.description;
                return (
                  <tr
                    key={rowKey}
                    className={`border-t cursor-pointer ${row.incomplete ? "bg-amber-100 hover:bg-amber-200/80" : "hover:bg-black/5"}`}
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => void openDetail(row.id)}
                  >
                    <td className="px-2 py-2 whitespace-nowrap font-medium">{row.clientName}</td>
                    <td className="px-2 py-2 max-w-[280px]">
                      <span className="line-clamp-2" title={projectLabel}>
                        {projectLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{dash(row.contractTitle)}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">
                      {dash(row.competenceMonthLabel)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {row.totalAmountCents <= 0 ? "—" : row.totalAmountFormatted}
                    </td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">
                      {formatarData(row.nfEmissionDate)}
                    </td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{dash(row.nfNumber)}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">
                      {formatarData(row.nextDueDate)}
                    </td>
                    <td
                      className="px-2 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[color:var(--primary)] cursor-pointer disabled:cursor-not-allowed"
                        checked={isPaid}
                        disabled={!canToggleReceived || markingReceivedId === rowKey}
                        title={
                          isPaid
                            ? "Desmarcar recebimento"
                            : canToggleReceived
                              ? "Marcar como recebido"
                              : "Não disponível"
                        }
                        aria-label={isPaid ? "Desmarcar recebimento" : "Marcar como recebido"}
                        onChange={(e) => {
                          if (e.target.checked) void markAsReceived(row);
                          else void unmarkAsReceived(row);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <StatusBadge status={row.status} nfNumber={row.nfNumber} />
                    </td>
                    <td
                      className="px-2 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => void openEditReceivable(row.id)}
                      >
                        <Pencil className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">{editingId ? "Editar conta a receber" : "Nova conta a receber"}</h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingId(null);
                  setCancelConfirmOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input className={formModalInputClass()} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Cliente</label>
                <select
                  className={formModalInputClass()}
                  value={form.clientId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientId: e.target.value, projectId: "" }))
                  }
                >
                  <option value="">—</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Projeto</label>
                <select
                  className={formModalInputClass()}
                  value={form.projectId}
                  disabled={!form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                >
                  <option value="">
                    {!form.clientId
                      ? "Selecione o cliente primeiro"
                      : projectsForClient.length === 0
                        ? "Nenhum projeto deste cliente"
                        : "—"}
                  </option>
                  {projectsForClient.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Conta financeira (receita)</label>
                <select className={formModalInputClass()} value={form.financialAccountId} onChange={(e) => setForm((f) => ({ ...f, financialAccountId: e.target.value }))}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Valor (R$)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(form.amount)}
                    placeholder="R$ 0,00"
                    onChange={(e) => setForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Parcelas</label>
                  <input type="number" min={1} className={formModalInputClass()} value={form.installmentCount} onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Competência</label>
                  <input type="date" className={formModalInputClass()} value={form.competenceDate} onChange={(e) => setForm((f) => ({ ...f, competenceDate: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>1º vencimento</label>
                  <input type="date" className={formModalInputClass()} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Centro de custo (rateio)</label>
                <select className={formModalInputClass()} value={form.costCenterId} onChange={(e) => setForm((f) => ({ ...f, costCenterId: e.target.value }))}>
                  <option value="">—</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => setCancelConfirmOpen(true)}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Cancelar conta
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingId(null);
                    setCancelConfirmOpen(false);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Fechar
                </button>
                <button type="button" disabled={saving} onClick={() => void saveReceivable()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                  {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-[color:var(--surface)] p-5">
            <h3 className="font-semibold">Cancelar conta a receber?</h3>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Essa ação marca a conta como cancelada. Deseja continuar?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelConfirmOpen(false)} className="rounded-lg border px-4 py-2 text-sm">
                Voltar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmCancelReceivable()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {detailId && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">{detail.description}</h3>
              <button type="button" onClick={() => { setDetailId(null); setDetail(null); }}><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              {detail.clientName}
              {detail.projectName ? ` · ${detail.projectName}` : ""}
              {detail.contractTitle ? ` · Contrato ${detail.contractTitle}` : ""}
              {" · "}
              {detail.totalAmountFormatted}
              {" · "}
              <StatusBadge status={detail.status} nfNumber={detail.nfNumber ?? detail.invoice?.nfNumber} />
            </p>
            {detail.invoice ? (
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                NF {detail.invoice.nfNumber} — emissão {formatarData(detail.invoice.emissionDate)} — líquido {formatarMoeda(detail.invoice.netAmountCents / 100)}
              </p>
            ) : detail.status !== "CANCELADO" && detail.status !== "RECEBIDO" ? (
              <button type="button" onClick={() => setInvoiceOpen((v) => !v)} className="mt-2 text-xs text-[color:var(--primary)] hover:underline">
                {invoiceOpen ? "Fechar faturamento" : "Registrar nota fiscal"}
              </button>
            ) : null}
            {invoiceOpen && !detail.invoice && (
              <div className="mt-3 space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={formModalLabelClass}>Número NF</label>
                    <input className={formModalInputClass()} value={invoiceForm.nfNumber} onChange={(e) => setInvoiceForm((f) => ({ ...f, nfNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Série</label>
                    <input className={formModalInputClass()} value={invoiceForm.nfSeries} onChange={(e) => setInvoiceForm((f) => ({ ...f, nfSeries: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className={formModalLabelClass}>Data emissão</label>
                  <input type="date" className={formModalInputClass()} value={invoiceForm.emissionDate} onChange={(e) => setInvoiceForm((f) => ({ ...f, emissionDate: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={formModalLabelClass}>Valor bruto</label>
                    <input type="number" step="0.01" className={formModalInputClass()} value={invoiceForm.grossAmount} onChange={(e) => setInvoiceForm((f) => ({ ...f, grossAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Valor líquido</label>
                    <input type="number" step="0.01" className={formModalInputClass()} value={invoiceForm.netAmount} onChange={(e) => setInvoiceForm((f) => ({ ...f, netAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Impostos</label>
                    <input type="number" step="0.01" className={formModalInputClass()} value={invoiceForm.taxAmount} onChange={(e) => setInvoiceForm((f) => ({ ...f, taxAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Retenção</label>
                    <input type="number" step="0.01" className={formModalInputClass()} value={invoiceForm.retentionAmount} onChange={(e) => setInvoiceForm((f) => ({ ...f, retentionAmount: e.target.value }))} />
                  </div>
                </div>
                <button type="button" disabled={saving} onClick={() => void saveInvoice()} className="rounded-lg bg-[color:var(--primary)] px-3 py-1.5 text-xs text-white">
                  Confirmar faturamento
                </button>
              </div>
            )}
            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Parcelas</h4>
            <ul className="mt-2 space-y-2">
              {detail.installments.map((inst) => (
                <li key={inst.id} className="flex items-center justify-between rounded-lg border p-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span>
                    #{inst.installmentNumber} · {formatarData(inst.dueDate)} · {formatarMoeda(inst.amountCents / 100)} · {STATUS_LABELS[inst.status] ?? inst.status}
                  </span>
                  {(inst.status === "PREVISTO" || inst.status === "FATURADO" || inst.status === "ATRASADO") && (
                    <button type="button" onClick={() => void receiveInstallment(inst.id)} className="text-xs text-[color:var(--primary)] hover:underline">
                      Registrar recebimento
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {detail.status !== "RECEBIDO" && detail.status !== "CANCELADO" && (
              <button type="button" onClick={() => void cancelReceivable()} className="mt-4 text-xs text-red-600 hover:underline">
                Cancelar conta
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
