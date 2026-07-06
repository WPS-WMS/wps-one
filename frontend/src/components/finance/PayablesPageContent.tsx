"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, Plus, Upload, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";

type Option = { id: string; name: string };
type SupplierOption = { id: string; nomeApelido: string };

type PayableRow = {
  id: string;
  description: string;
  totalAmountFormatted: string;
  competenceDate: string | null;
  kind: string;
  status: string;
  supplierName: string | null;
  financialAccountName: string;
  corporateExpenseTypeName: string | null;
  nextDueDate: string | null;
  installmentCount: number;
};

type PayableDetail = PayableRow & {
  notes: string | null;
  requiresApproval: boolean;
  installments: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    amountCents: number;
    status: string;
    paidAt: string | null;
  }[];
  allocations: {
    costCenterName: string;
    projectName: string | null;
    amountCents: number;
    percentBps: number;
  }[];
};

const STATUS_LABELS: Record<string, string> = {
  ABERTO: "Aberto",
  PAGO: "Pago",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
  PENDENTE_APROVACAO: "Pendente aprovação",
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

export function PayablesPageContent() {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor") ? "/gestor" : pathname.startsWith("/consultor") ? "/consultor" : "/admin";
  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar"),
    [can],
  );
  const canApprove = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar.aprovar"),
    [can],
  );

  const [rows, setRows] = useState<PayableRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayableDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    description: "",
    supplierId: "",
    financialAccountId: "",
    corporateExpenseTypeId: "",
    amount: "",
    competenceDate: "",
    dueDate: new Date().toISOString().slice(0, 10),
    installmentCount: "1",
    costCenterId: "",
    projectId: "",
    isCorporate: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const [pRes, sRes, ccRes, accRes, etRes] = await Promise.all([
      apiFetch(`/api/payables?${params.toString()}`),
      apiFetch("/api/suppliers"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-accounts"),
      apiFetch("/api/corporate-expense-types"),
    ]);
    const pBody = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      setError(typeof pBody?.error === "string" ? pBody.error : "Erro ao carregar contas.");
      setLoading(false);
      return;
    }
    setRows(Array.isArray(pBody) ? pBody : []);
    const sBody = await sRes.json().catch(() => null);
    setSuppliers(sRes.ok && Array.isArray(sBody) ? sBody.map((s: SupplierOption) => ({ id: s.id, nomeApelido: s.nomeApelido })) : []);
    const ccBody = await ccRes.json().catch(() => null);
    setCostCenters(ccRes.ok && Array.isArray(ccBody) ? ccBody.filter((c: Option & { isActive?: boolean }) => c.isActive !== false) : []);
    const accBody = await accRes.json().catch(() => null);
    setAccounts(
      accRes.ok && Array.isArray(accBody)
        ? accBody.filter((a: Option & { type: string; isActive?: boolean }) => a.type === "DESPESA" && a.isActive !== false)
        : [],
    );
    const etBody = await etRes.json().catch(() => null);
    setExpenseTypes(etRes.ok && Array.isArray(etBody) ? etBody.filter((t: Option & { isActive?: boolean }) => t.isActive !== false) : []);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  async function openDetail(id: string) {
    setDetailId(id);
    const r = await apiFetch(`/api/payables/${id}`);
    const body = await r.json().catch(() => null);
    setDetail(r.ok ? (body as PayableDetail) : null);
  }

  async function savePayable() {
    setSaving(true);
    setError(null);
    const payload = {
      description: form.description.trim(),
      supplierId: form.supplierId || null,
      financialAccountId: form.financialAccountId,
      corporateExpenseTypeId: form.corporateExpenseTypeId || null,
      amount: form.amount,
      competenceDate: form.competenceDate || null,
      dueDate: form.dueDate,
      installmentCount: Number(form.installmentCount) || 1,
      isCorporate: form.isCorporate,
      allocations: [
        {
          costCenterId: form.costCenterId,
          projectId: form.projectId || null,
          percentBps: 10000,
        },
      ],
    };
    const r = await apiFetch("/api/payables", {
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

  async function payInstallment(installmentId: string) {
    if (!detailId) return;
    const r = await apiFetch(`/api/payables/${detailId}/installments/${installmentId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidAt: new Date().toISOString().slice(0, 10) }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao registrar pagamento.");
      return;
    }
    await openDetail(detailId);
    await load();
  }

  async function approvePayable() {
    if (!detailId) return;
    const r = await apiFetch(`/api/payables/${detailId}/approve`, { method: "PATCH" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao aprovar.");
      return;
    }
    await openDetail(detailId);
    await load();
  }

  async function cancelPayable() {
    if (!detailId || !window.confirm("Cancelar esta conta a pagar?")) return;
    const r = await apiFetch(`/api/payables/${detailId}/cancel`, { method: "PATCH" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    setDetailId(null);
    await load();
  }

  async function uploadAttachment(file: File, category: string) {
    if (!detailId) return;
    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
      reader.readAsDataURL(file);
    });
    const r = await apiFetch(`/api/payables/${detailId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileData, fileType: file.type, fileSize: file.size, category }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro no upload.");
    }
  }

  if (!permissionsReady) return null;
  if (!isFinanceiroModuleEnabled()) return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  if (!canAccess) return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a pagar</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Despesas, parcelamentos, rateio e integração com reembolsos.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white">
          <Plus className="h-4 w-4" /> Nova conta
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <select className={inputClass + " max-w-xs"} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma conta a pagar.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-full text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-left">Fornecedor</th>
                <th className="px-3 py-2 text-left">Conta</th>
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
                  <td className="px-3 py-2">{row.supplierName ?? "—"}</td>
                  <td className="px-3 py-2">{row.financialAccountName}</td>
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
              <h3 className="font-semibold">Nova conta a pagar</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input className={formModalInputClass()} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Fornecedor</label>
                <select className={formModalInputClass()} value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nomeApelido}</option>)}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Conta financeira (despesa)</label>
                <select className={formModalInputClass()} value={form.financialAccountId} onChange={(e) => setForm((f) => ({ ...f, financialAccountId: e.target.value }))}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Tipo despesa corporativa</label>
                <select className={formModalInputClass()} value={form.corporateExpenseTypeId} onChange={(e) => setForm((f) => ({ ...f, corporateExpenseTypeId: e.target.value }))}>
                  <option value="">—</option>
                  {expenseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isCorporate} onChange={(e) => setForm((f) => ({ ...f, isCorporate: e.target.checked }))} />
                Despesa corporativa (requer aprovação)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void savePayable()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
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
              {detail.totalAmountFormatted} · {STATUS_LABELS[detail.status] ?? detail.status}
            </p>
            {detail.status === "PENDENTE_APROVACAO" && canApprove && (
              <button type="button" onClick={() => void approvePayable()} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white">
                <Check className="h-3.5 w-3.5" /> Aprovar despesa
              </button>
            )}
            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Parcelas</h4>
            <ul className="mt-2 space-y-2">
              {detail.installments.map((inst) => (
                <li key={inst.id} className="flex items-center justify-between rounded-lg border p-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span>#{inst.installmentNumber} · {formatarData(inst.dueDate)} · {formatarMoeda(inst.amountCents / 100)} · {STATUS_LABELS[inst.status] ?? inst.status}</span>
                  {inst.status === "ABERTO" || inst.status === "VENCIDO" ? (
                    detail.status !== "PENDENTE_APROVACAO" && (
                      <button type="button" onClick={() => void payInstallment(inst.id)} className="text-xs text-[color:var(--primary)] hover:underline">Registrar pagamento</button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Rateio</h4>
            <ul className="mt-2 text-sm space-y-1">
              {detail.allocations.map((a, i) => (
                <li key={i}>{a.costCenterName}{a.projectName ? ` / ${a.projectName}` : ""} — {formatarMoeda(a.amountCents / 100)}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                const cat = (e.target as HTMLInputElement).dataset.category ?? "OUTRO";
                if (f) void uploadAttachment(f, cat);
                e.target.value = "";
              }} />
              {(["NOTA_FISCAL", "BOLETO", "COMPROVANTE"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.dataset.category = cat;
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <Upload className="h-3 w-3" /> {cat.replace("_", " ")}
                </button>
              ))}
              {detail.status !== "PAGO" && detail.status !== "CANCELADO" && (
                <button type="button" onClick={() => void cancelPayable()} className="text-xs text-red-600 hover:underline ml-auto">Cancelar conta</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
