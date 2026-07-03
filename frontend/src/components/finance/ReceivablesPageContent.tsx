"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Loader2, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type Option = { id: string; name: string };

type ReceivableRow = {
  id: string;
  description: string;
  totalAmountFormatted: string;
  competenceDate: string | null;
  kind: string;
  status: string;
  clientName: string;
  projectName: string | null;
  financialAccountName: string;
  nfNumber: string | null;
  nextDueDate: string | null;
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
    costCenterName: string;
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
  RECEBIDO: "Recebido",
  ATRASADO: "Atrasado",
  CANCELADO: "Cancelado",
};

const BUCKET_LABELS: Record<string, string> = {
  A_VENCER: "A vencer",
  "1_30": "1–30 dias",
  "31_60": "31–60 dias",
  "61_90": "61–90 dias",
  "90_PLUS": "90+ dias",
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

export function ReceivablesPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => can("financeiro.contasReceber"), [can]);

  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
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
    const [rRes, cRes, ccRes, accRes, agingRes] = await Promise.all([
      apiFetch(`/api/receivables?${params.toString()}`),
      apiFetch("/api/clients"),
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
    const payload = {
      description: form.description.trim(),
      clientId: form.clientId,
      financialAccountId: form.financialAccountId,
      amount: form.amount,
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
    const r = await apiFetch("/api/receivables", {
      method: "POST",
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a receber</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Receitas, faturamento, parcelas, recorrência e inadimplência.
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
            onClick={() => setModalOpen(true)}
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
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
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
            <thead className="bg-black/5">
              <tr>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">NF</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-left">Vencimento</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t cursor-pointer hover:bg-black/5"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => void openDetail(row.id)}
                >
                  <td className="px-3 py-2 font-medium">{row.description}</td>
                  <td className="px-3 py-2">{row.clientName}</td>
                  <td className="px-3 py-2">{row.nfNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{row.totalAmountFormatted}</td>
                  <td className="px-3 py-2">{formatarData(row.nextDueDate)}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[row.status] ?? row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">Nova conta a receber</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input className={formModalInputClass()} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Cliente</label>
                <select className={formModalInputClass()} value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
                  <option value="">—</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                  <input type="number" step="0.01" className={formModalInputClass()} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
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
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveReceivable()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Salvar
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
              {detail.clientName} · {detail.totalAmountFormatted} · {STATUS_LABELS[detail.status] ?? detail.status}
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
