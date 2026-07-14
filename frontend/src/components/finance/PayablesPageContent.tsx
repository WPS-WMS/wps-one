"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";

type Option = { id: string; name: string };
type SupplierOption = { id: string; nomeApelido: string };
type UserOption = { id: string; name: string; linkedSupplierId?: string | null };
type ProjectOption = { id: string; name: string };
type FinancialCategoryOption = {
  id: string;
  name: string;
  enableHourRate?: boolean;
  enableAmount?: boolean;
  enableBenefit?: boolean;
  enableReimbursement?: boolean;
  enableDiscount?: boolean;
  enableComplementaryHours?: boolean;
  enableInterestFine?: boolean;
};

type AllocationLine = {
  costCenterId: string;
  projectId: string;
  percent: string;
};

type PayableRow = {
  id: string;
  description: string;
  totalAmountCents: number;
  totalAmountFormatted: string;
  computedTotalFormatted: string;
  hourRateFormatted: string | null;
  benefitFormatted: string | null;
  reimbursementFormatted: string | null;
  discountFormatted: string | null;
  complementaryHours: number | null;
  interestFineFormatted: string | null;
  competenceDate: string | null;
  referenceDate: string;
  monthName: string;
  monthNumber: number;
  kind: string;
  status: string;
  payeeDisplayName: string | null;
  financialCategoryName: string | null;
  contractTypeName: string | null;
  primaryCostCenterName: string | null;
  supplierName: string | null;
  financialAccountName: string;
  corporateExpenseTypeName: string | null;
  nextDueDate: string | null;
  nextInstallmentId: string | null;
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

type RecurrenceRule = {
  id: string;
  description: string;
  amountCents: number;
  frequency: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  isActive: boolean;
  supplier: { nomeApelido: string } | null;
  financialAccount: { name: string };
};

type AttachmentRow = {
  id: string;
  filename: string;
  category: string;
  createdAt: string;
  user?: { name: string };
};

const STATUS_LABELS: Record<string, string> = {
  ABERTO: "Aberto",
  PAGO: "Pago",
  VENCIDO: "Atrasado",
  CANCELADO: "Cancelado",
  PENDENTE_APROVACAO: "Pendente aprovação",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PAGO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELADO: "bg-red-100 text-red-800 border-red-200",
  VENCIDO: "bg-amber-100 text-amber-800 border-amber-200",
  ABERTO: "bg-slate-100 text-slate-700 border-slate-200",
  PENDENTE_APROVACAO: "bg-sky-100 text-sky-800 border-sky-200",
};

const PAYABLE_STATUS_OPTIONS = [
  { value: "ABERTO", label: "Aberto" },
  { value: "VENCIDO", label: "Atrasado" },
  { value: "PAGO", label: "Pago" },
  { value: "CANCELADO", label: "Cancelado" },
] as const;

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const cls = STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

const ATTACHMENT_LABELS: Record<string, string> = {
  NOTA_FISCAL: "Nota fiscal",
  BOLETO: "Boleto",
  COMPROVANTE: "Comprovante",
  OUTRO: "Outro",
};

const FREQUENCY_LABELS: Record<string, string> = {
  MENSAL: "Mensal",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

const emptyAllocation = (): AllocationLine => ({ costCenterId: "", projectId: "", percent: "100" });

function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function buildAllocationsPayload(lines: AllocationLine[]) {
  return lines
    .filter((l) => l.costCenterId)
    .map((l) => ({
      costCenterId: l.costCenterId,
      projectId: l.projectId || null,
      percentBps: Math.round(Number(l.percent || "0") * 100),
    }));
}

export function PayablesPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar"),
    [can],
  );
  const canApprove = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar.aprovar"),
    [can],
  );

  const [viewTab, setViewTab] = useState<"contas" | "recorrencia">("contas");
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [recurrenceRules, setRecurrenceRules] = useState<RecurrenceRule[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [professionals, setProfessionals] = useState<UserOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategoryOption[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<Option[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayableDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [payModal, setPayModal] = useState<{ installmentId: string; paidAt: string } | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [editPayableOpen, setEditPayableOpen] = useState(false);
  const [editPayableId, setEditPayableId] = useState<string | null>(null);
  const [editPayableForm, setEditPayableForm] = useState({
    description: "",
    amount: "",
    dueDate: "",
  });
  const [editRecurrenceId, setEditRecurrenceId] = useState<string | null>(null);
  const [editRecForm, setEditRecForm] = useState({
    description: "",
    amount: "",
    frequency: "MENSAL",
    dayOfMonth: "1",
    nextDueDate: "",
    isActive: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    description: "",
    financialCategoryId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    payeeKind: "professional" as "professional" | "supplier",
    professionalUserId: "",
    supplierId: "",
    defaultCostCenterId: "",
    hourRate: "",
    amount: "",
    benefit: "",
    reimbursement: "",
    discount: "",
    complementaryHours: "",
    interestFine: "",
  });
  const [allocations, setAllocations] = useState<AllocationLine[]>([emptyAllocation()]);

  const selectedCategory = useMemo(
    () => financialCategories.find((c) => c.id === form.financialCategoryId) ?? null,
    [financialCategories, form.financialCategoryId],
  );

  const [recForm, setRecForm] = useState({
    description: "",
    supplierId: "",
    financialAccountId: "",
    corporateExpenseTypeId: "",
    amount: "",
    defaultCostCenterId: "",
    projectId: "",
    frequency: "MENSAL",
    dayOfMonth: "1",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });

  const loadOptions = useCallback(async () => {
    const [sRes, uRes, ccRes, fcRes, accRes, etRes, pRes] = await Promise.all([
      apiFetch("/api/suppliers"),
      apiFetch("/api/users/for-select?scope=relatorios&status=ativos"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-categories"),
      apiFetch("/api/financial-accounts"),
      apiFetch("/api/corporate-expense-types"),
      apiFetch("/api/projects?light=true"),
    ]);
    const sBody = await sRes.json().catch(() => null);
    setSuppliers(sRes.ok && Array.isArray(sBody) ? sBody.map((s: SupplierOption) => ({ id: s.id, nomeApelido: s.nomeApelido })) : []);
    const uBody = await uRes.json().catch(() => null);
    setProfessionals(
      uRes.ok && Array.isArray(uBody)
        ? uBody.map((u: UserOption) => ({
            id: u.id,
            name: u.name,
            linkedSupplierId: u.linkedSupplierId ?? null,
          }))
        : [],
    );
    const ccBody = await ccRes.json().catch(() => null);
    setCostCenters(ccRes.ok && Array.isArray(ccBody) ? ccBody.filter((c: Option & { isActive?: boolean }) => c.isActive !== false) : []);
    const fcBody = await fcRes.json().catch(() => null);
    setFinancialCategories(
      fcRes.ok && Array.isArray(fcBody)
        ? fcBody
            .filter((c: FinancialCategoryOption & { isActive?: boolean }) => c.isActive !== false)
            .map((c: FinancialCategoryOption) => ({
              id: c.id,
              name: c.name,
              enableHourRate: Boolean(c.enableHourRate),
              enableAmount: Boolean(c.enableAmount),
              enableBenefit: Boolean(c.enableBenefit),
              enableReimbursement: Boolean(c.enableReimbursement),
              enableDiscount: Boolean(c.enableDiscount),
              enableComplementaryHours: Boolean(c.enableComplementaryHours),
              enableInterestFine: Boolean(c.enableInterestFine),
            }))
        : [],
    );
    const accBody = await accRes.json().catch(() => null);
    setAccounts(
      accRes.ok && Array.isArray(accBody)
        ? accBody.filter((a: Option & { type: string; isActive?: boolean }) => a.type === "DESPESA" && a.isActive !== false)
        : [],
    );
    const etBody = await etRes.json().catch(() => null);
    setExpenseTypes(etRes.ok && Array.isArray(etBody) ? etBody.filter((t: Option & { isActive?: boolean }) => t.isActive !== false) : []);
    const pBody = await pRes.json().catch(() => null);
    setProjects(pRes.ok && Array.isArray(pBody) ? pBody.map((p: ProjectOption) => ({ id: p.id, name: p.name })) : []);
  }, []);

  const loadPayables = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const pRes = await apiFetch(`/api/payables?${params.toString()}`);
    const pBody = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      throw new Error(typeof pBody?.error === "string" ? pBody.error : "Erro ao carregar contas.");
    }
    setRows(Array.isArray(pBody) ? pBody : []);
  }, [filterStatus]);

  const loadRecurrenceRules = useCallback(async () => {
    const r = await apiFetch("/api/payables/recurrence/rules");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar recorrências.");
    }
    setRecurrenceRules(Array.isArray(body) ? body : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadOptions();
      await Promise.all([loadPayables(), loadRecurrenceRules()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [loadOptions, loadPayables, loadRecurrenceRules]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  async function openDetail(id: string) {
    setDetailId(id);
    const [detailRes, attRes] = await Promise.all([
      apiFetch(`/api/payables/${id}`),
      apiFetch(`/api/payables/${id}/attachments`),
    ]);
    const body = await detailRes.json().catch(() => null);
    const attBody = await attRes.json().catch(() => null);
    setDetail(detailRes.ok ? (body as PayableDetail) : null);
    setAttachments(attRes.ok && Array.isArray(attBody) ? attBody : []);
  }

  async function openEditPayable(id: string) {
    setError(null);
    const r = await apiFetch(`/api/payables/${id}`);
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar conta.");
      return;
    }
    const d = body as PayableDetail;
    const amountReais =
      d.totalAmountCents != null ? String(d.totalAmountCents / 100) : "";
    setEditPayableId(id);
    setEditPayableForm({
      description: d.description ?? "",
      amount: amountReais,
      dueDate: d.nextDueDate ?? "",
    });
    setEditPayableOpen(true);
  }

  async function saveEditPayable() {
    if (!editPayableId) return;
    setSaving(true);
    setError(null);
    const amountCents = moneyToCentsPayload(editPayableForm.amount);
    const r = await apiFetch(`/api/payables/${editPayableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editPayableForm.description.trim(),
        totalAmountCents: amountCents,
        dueDate: editPayableForm.dueDate || null,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    setEditPayableOpen(false);
    setEditPayableId(null);
    await load();
  }

  function openEditRecurrence(rule: RecurrenceRule) {
    setEditRecurrenceId(rule.id);
    setEditRecForm({
      description: rule.description,
      amount: String(rule.amountCents / 100),
      frequency: rule.frequency,
      dayOfMonth: String(rule.dayOfMonth),
      nextDueDate: String(rule.nextDueDate).slice(0, 10),
      isActive: rule.isActive,
    });
  }

  async function saveEditRecurrence() {
    if (!editRecurrenceId) return;
    setSaving(true);
    setError(null);
    const amountCents = moneyToCentsPayload(editRecForm.amount);
    if (amountCents == null || amountCents <= 0) {
      setError("Valor inválido.");
      setSaving(false);
      return;
    }
    const r = await apiFetch(`/api/payables/recurrence/rules/${editRecurrenceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editRecForm.description.trim(),
        amountCents,
        frequency: editRecForm.frequency,
        dayOfMonth: Number(editRecForm.dayOfMonth) || 1,
        nextDueDate: editRecForm.nextDueDate,
        isActive: editRecForm.isActive,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar recorrência.");
      return;
    }
    setEditRecurrenceId(null);
    await load();
  }

  function openCreateModal() {
    setForm({
      description: "",
      financialCategoryId: "",
      dueDate: new Date().toISOString().slice(0, 10),
      payeeKind: "professional",
      professionalUserId: "",
      supplierId: "",
      defaultCostCenterId: "",
      hourRate: "",
      amount: "",
      benefit: "",
      reimbursement: "",
      discount: "",
      complementaryHours: "",
      interestFine: "",
    });
    setAllocations([emptyAllocation()]);
    setModalOpen(true);
  }

  function moneyToCentsPayload(raw: string): number | null {
    // raw já vem como decimal (ex.: "50") de parseMoedaInputToString — não remascarar.
    return moedaParaCentavos(raw);
  }

  function setDefaultCostCenter(costCenterId: string) {
    setForm((f) => ({ ...f, defaultCostCenterId: costCenterId }));
    setAllocations((lines) => {
      if (lines.length === 0) return [{ ...emptyAllocation(), costCenterId }];
      return lines.map((line, idx) => (idx === 0 ? { ...line, costCenterId } : line));
    });
  }

  async function savePayable() {
    if (!form.description.trim()) {
      setError("Informe a atividade.");
      return;
    }
    if (!form.financialCategoryId) {
      setError("Selecione a categoria financeira.");
      return;
    }
    if (!form.dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    if (form.payeeKind === "professional" && !form.professionalUserId) {
      setError("Selecione o profissional.");
      return;
    }
    if (form.payeeKind === "supplier" && !form.supplierId) {
      setError("Selecione a empresa/fornecedor.");
      return;
    }
    const allocationPayload = buildAllocationsPayload(allocations);
    if (allocationPayload.length === 0) {
      setError("Informe ao menos uma linha de rateio por centro de custo.");
      return;
    }
    const cat = selectedCategory;
    const amountCents = cat?.enableAmount ? (moneyToCentsPayload(form.amount) ?? 0) : 0;
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      financialCategoryId: form.financialCategoryId,
      totalAmountCents: amountCents ?? 0,
      dueDate: form.dueDate,
      installmentCount: 1,
      professionalUserId: form.payeeKind === "professional" ? form.professionalUserId : null,
      supplierId: form.payeeKind === "supplier" ? form.supplierId : null,
      allocations: allocationPayload,
    };
    if (cat?.enableHourRate) payload.hourRateCents = moneyToCentsPayload(form.hourRate);
    if (cat?.enableBenefit) payload.benefitCents = moneyToCentsPayload(form.benefit);
    if (cat?.enableReimbursement) payload.reimbursementCents = moneyToCentsPayload(form.reimbursement);
    if (cat?.enableDiscount) payload.discountCents = moneyToCentsPayload(form.discount);
    if (cat?.enableInterestFine) payload.interestFineCents = moneyToCentsPayload(form.interestFine);
    if (cat?.enableComplementaryHours) {
      const h = form.complementaryHours.trim() === "" ? null : Number(form.complementaryHours.replace(",", "."));
      if (h != null && (!Number.isFinite(h) || h < 0)) {
        setSaving(false);
        setError("Horas complementares inválidas.");
        return;
      }
      payload.complementaryHours = h;
    }
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
    if (body && typeof body.id === "string") {
      await openDetail(body.id);
    }
  }

  async function saveRecurrence() {
    if (!recForm.defaultCostCenterId || !recForm.financialAccountId || !recForm.amount) {
      setError("Preencha descrição, categoria, valor, início e centro de custo.");
      return;
    }
    setSaving(true);
    setError(null);
    const amountCents = moneyToCentsPayload(recForm.amount);
    if (amountCents == null || amountCents <= 0) {
      setError("Valor inválido.");
      setSaving(false);
      return;
    }
    const r = await apiFetch("/api/payables/recurrence/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: recForm.description.trim(),
        supplierId: recForm.supplierId || null,
        financialAccountId: recForm.financialAccountId,
        corporateExpenseTypeId: recForm.corporateExpenseTypeId || null,
        defaultCostCenterId: recForm.defaultCostCenterId,
        projectId: recForm.projectId || null,
        amountCents,
        frequency: recForm.frequency,
        dayOfMonth: Number(recForm.dayOfMonth) || 1,
        startDate: recForm.startDate,
        endDate: recForm.endDate || null,
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar recorrência.");
      return;
    }
    setRecurrenceModalOpen(false);
    await load();
  }

  async function payInstallment() {
    if (!detailId || !payModal) return;
    const r = await apiFetch(`/api/payables/${detailId}/installments/${payModal.installmentId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidAt: payModal.paidAt }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao registrar pagamento.");
      return;
    }
    setPayModal(null);
    await openDetail(detailId);
    await load();
  }

  async function markAsPaid(payableId: string) {
    setError(null);
    setMarkingPaidId(payableId);
    try {
      const r = await apiFetch(`/api/payables/${payableId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString().slice(0, 10) }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao marcar como pago.");
        return;
      }
      await load();
      if (detailId === payableId) await openDetail(payableId);
    } finally {
      setMarkingPaidId(null);
    }
  }

  async function unmarkAsPaid(payableId: string) {
    setError(null);
    setMarkingPaidId(payableId);
    try {
      const r = await apiFetch(`/api/payables/${payableId}/unmark-paid`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao desmarcar pagamento.");
        return;
      }
      await load();
      if (detailId === payableId) await openDetail(payableId);
    } finally {
      setMarkingPaidId(null);
    }
  }

  async function changePayableStatus(payableId: string, status: string) {
    setError(null);
    const r = await apiFetch(`/api/payables/${payableId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao alterar status.");
      return;
    }
    await load();
    if (detailId === payableId) await openDetail(payableId);
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
    setDetail(null);
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
      return;
    }
    await openDetail(detailId);
  }

  async function downloadAttachment(att: AttachmentRow) {
    if (!detailId) return;
    const res = await apiFetchBlob(`/api/payables/${detailId}/attachments/${att.id}/file`);
    if (!res.ok) {
      setError("Erro ao baixar anexo.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAttachment(attId: string) {
    if (!detailId || !window.confirm("Excluir este anexo?")) return;
    const r = await apiFetch(`/api/payables/${detailId}/attachments/${attId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      setError("Erro ao excluir anexo.");
      return;
    }
    await openDetail(detailId);
  }

  function AllocationEditor({ lines, onChange }: { lines: AllocationLine[]; onChange: (lines: AllocationLine[]) => void }) {
    function patchLine(index: number, patch: Partial<AllocationLine>) {
      onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={formModalLabelClass}>Rateio (centro de custo / projeto)</label>
          <button
            type="button"
            className="text-xs text-[color:var(--primary)] hover:underline"
            onClick={() => onChange([...lines, emptyAllocation()])}
          >
            + Linha
          </button>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-4">
              <select
                className={formModalInputClass()}
                value={line.costCenterId}
                onChange={(e) => patchLine(idx, { costCenterId: e.target.value })}
              >
                <option value="">Centro de custo</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <select
                className={formModalInputClass()}
                value={line.projectId}
                onChange={(e) => patchLine(idx, { projectId: e.target.value })}
              >
                <option value="">Projeto (opcional)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={formModalInputClass()}
                placeholder="%"
                value={line.percent}
                onChange={(e) => patchLine(idx, { percent: e.target.value })}
              />
            </div>
            <div className="col-span-1">
              {lines.length > 1 && (
                <button
                  type="button"
                  className="p-2 text-red-600"
                  onClick={() => onChange(lines.filter((_, i) => i !== idx))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!permissionsReady) return null;
  if (!isFinanceiroModuleEnabled()) return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  if (!canAccess) return <div className="p-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</div>;

  return (
    <div className="mx-auto max-w-[100%] space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contas a pagar</h1>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Visão alinhada à planilha de controle: folha, custos, vencimentos e rateio por centro de custo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {viewTab === "contas" ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> Nova conta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRecurrenceModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white"
            >
              <RefreshCw className="h-4 w-4" /> Nova recorrência
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${viewTab === "contas" ? "border-[color:var(--primary)] text-[color:var(--primary)]" : "border-transparent text-[color:var(--muted-foreground)]"}`}
          onClick={() => setViewTab("contas")}
        >
          Contas
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${viewTab === "recorrencia" ? "border-[color:var(--primary)] text-[color:var(--primary)]" : "border-transparent text-[color:var(--muted-foreground)]"}`}
          onClick={() => setViewTab("recorrencia")}
        >
          Recorrências
        </button>
      </div>

      {error && <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>}

      {viewTab === "contas" && (
        <>
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
              <table className="min-w-[1400px] w-full text-xs">
                <thead className="bg-black/5">
                  <tr>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Mês</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Data</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Tipo</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Vencimento</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Tipo contrato</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Profissional/Empresa</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Atividade</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Centro de custo</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Tx hora</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Valor</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Benefício</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Reembolso</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Descontos</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">H. compl.</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Juros/Multa</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">Total</th>
                    <th className="px-2 py-2 text-center whitespace-nowrap">Pago</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Status</th>
                    <th className="px-2 py-2 text-center whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isPaid = row.status === "PAGO";
                    const canTogglePaid =
                      row.status === "ABERTO" ||
                      row.status === "VENCIDO" ||
                      row.status === "PAGO";
                    return (
                    <tr
                      key={row.id}
                      className="border-t cursor-pointer hover:bg-black/5"
                      style={{ borderColor: "var(--border)" }}
                      onClick={() => void openDetail(row.id)}
                    >
                      <td className="px-2 py-2 whitespace-nowrap">{row.monthName || dash(row.monthNumber)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatarData(row.referenceDate)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{dash(row.financialCategoryName)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatarData(row.nextDueDate)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{dash(row.contractTypeName)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{dash(row.payeeDisplayName ?? row.supplierName)}</td>
                      <td className="px-2 py-2 font-medium">{row.description}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{dash(row.primaryCostCenterName)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.hourRateFormatted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {row.totalAmountFormatted === "R$ 0,00" ? "—" : row.totalAmountFormatted}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.benefitFormatted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.reimbursementFormatted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.discountFormatted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.complementaryHours)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dash(row.interestFineFormatted)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap font-medium">{row.computedTotalFormatted}</td>
                      <td
                        className="px-2 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[color:var(--primary)] cursor-pointer disabled:cursor-not-allowed"
                          checked={isPaid}
                          disabled={!canTogglePaid || markingPaidId === row.id}
                          title={
                            isPaid
                              ? "Desmarcar pagamento"
                              : canTogglePaid
                                ? "Marcar como pago"
                                : "Não disponível"
                          }
                          aria-label={isPaid ? "Desmarcar pagamento" : "Marcar como pago"}
                          onChange={(e) => {
                            if (e.target.checked) void markAsPaid(row.id);
                            else void unmarkAsPaid(row.id);
                          }}
                        />
                      </td>
                      <td
                        className="px-2 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.status === "PENDENTE_APROVACAO" ? (
                          <StatusBadge status={row.status} />
                        ) : (
                          <select
                            className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-xs max-w-[130px]"
                            value={row.status}
                            onChange={(e) => void changePayableStatus(row.id, e.target.value)}
                          >
                            {PAYABLE_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
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
                          onClick={() => void openEditPayable(row.id)}
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
        </>
      )}

      {viewTab === "recorrencia" && (
        loading ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
        ) : recurrenceRules.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma regra de recorrência cadastrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="min-w-full text-sm">
              <thead className="bg-black/5">
                <tr>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Frequência</th>
                  <th className="px-3 py-2 text-left">Próximo venc.</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recurrenceRules.map((rule) => (
                  <tr key={rule.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-medium">{rule.description}</td>
                    <td className="px-3 py-2">{rule.supplier?.nomeApelido ?? "—"}</td>
                    <td className="px-3 py-2">{rule.financialAccount.name}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(rule.amountCents / 100)}</td>
                    <td className="px-3 py-2">{FREQUENCY_LABELS[rule.frequency] ?? rule.frequency}</td>
                    <td className="px-3 py-2">{formatarData(rule.nextDueDate)}</td>
                    <td className="px-3 py-2">{rule.isActive ? "Ativa" : "Inativa"}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                        title="Editar"
                        aria-label="Editar recorrência"
                        onClick={() => openEditRecurrence(rule)}
                      >
                        <Pencil className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">Nova conta a pagar</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Atividade</label>
                <input
                  className={formModalInputClass()}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex.: Desenvolvedor Fullstack, Internet, Limpeza..."
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Categoria financeira</label>
                <select
                  className={formModalInputClass()}
                  value={form.financialCategoryId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      financialCategoryId: e.target.value,
                      hourRate: "",
                      amount: "",
                      benefit: "",
                      reimbursement: "",
                      discount: "",
                      complementaryHours: "",
                      interestFine: "",
                    }))
                  }
                >
                  <option value="">—</option>
                  {financialCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {selectedCategory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  {selectedCategory.enableHourRate && (
                    <div>
                      <label className={formModalLabelClass}>Tx hora</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.hourRate)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, hourRate: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableAmount && (
                    <div>
                      <label className={formModalLabelClass}>Valor</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.amount)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableBenefit && (
                    <div>
                      <label className={formModalLabelClass}>Benefício</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.benefit)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, benefit: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableReimbursement && (
                    <div>
                      <label className={formModalLabelClass}>Reembolso</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.reimbursement)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, reimbursement: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableDiscount && (
                    <div>
                      <label className={formModalLabelClass}>Descontos</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.discount)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, discount: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableComplementaryHours && (
                    <div>
                      <label className={formModalLabelClass}>Horas complementares</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={formModalInputClass()}
                        value={form.complementaryHours}
                        placeholder="0"
                        onChange={(e) => setForm((f) => ({ ...f, complementaryHours: e.target.value }))}
                      />
                    </div>
                  )}
                  {selectedCategory.enableInterestFine && (
                    <div>
                      <label className={formModalLabelClass}>Juros/Multa</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.interestFine)}
                        placeholder="R$ 0,00"
                        onChange={(e) => setForm((f) => ({ ...f, interestFine: parseMoedaInputToString(e.target.value) }))}
                      />
                    </div>
                  )}
                  {!selectedCategory.enableHourRate &&
                    !selectedCategory.enableAmount &&
                    !selectedCategory.enableBenefit &&
                    !selectedCategory.enableReimbursement &&
                    !selectedCategory.enableDiscount &&
                    !selectedCategory.enableComplementaryHours &&
                    !selectedCategory.enableInterestFine && (
                      <p className="sm:col-span-2 text-xs text-[color:var(--muted-foreground)]">
                        Nenhum campo de valor habilitado para este tipo. Configure em Configurações → Financeiro → Categorias financeiras.
                      </p>
                    )}
                </div>
              )}
              <div>
                <label className={formModalLabelClass}>Data de vencimento</label>
                <input
                  type="date"
                  className={formModalInputClass()}
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Profissional/Empresa</label>
                <div className="mb-2 flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="payeeKind"
                      checked={form.payeeKind === "professional"}
                      onChange={() => setForm((f) => ({ ...f, payeeKind: "professional", supplierId: "" }))}
                    />
                    Profissional
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="payeeKind"
                      checked={form.payeeKind === "supplier"}
                      onChange={() => setForm((f) => ({ ...f, payeeKind: "supplier", professionalUserId: "" }))}
                    />
                    Empresa
                  </label>
                </div>
                {form.payeeKind === "professional" ? (
                  <>
                    <select
                      className={formModalInputClass()}
                      value={form.professionalUserId}
                      onChange={(e) => setForm((f) => ({ ...f, professionalUserId: e.target.value }))}
                    >
                      <option value="">Selecione o profissional</option>
                      {professionals.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    {form.professionalUserId &&
                      !professionals.find((u) => u.id === form.professionalUserId)?.linkedSupplierId && (
                        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          Este profissional não tem fornecedor vinculado. Cadastre o vínculo em Fornecedores para pagamento e emissão de NF.
                        </p>
                      )}
                  </>
                ) : (
                  <select
                    className={formModalInputClass()}
                    value={form.supplierId}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                  >
                    <option value="">Selecione a empresa/fornecedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.nomeApelido}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={formModalLabelClass}>Centro de custo</label>
                <select
                  className={formModalInputClass()}
                  value={form.defaultCostCenterId}
                  onChange={(e) => setDefaultCostCenter(e.target.value)}
                >
                  <option value="">—</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <AllocationEditor lines={allocations} onChange={setAllocations} />
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

      {recurrenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">Nova recorrência</h3>
              <button type="button" onClick={() => setRecurrenceModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input className={formModalInputClass()} value={recForm.description} onChange={(e) => setRecForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Fornecedor</label>
                <select className={formModalInputClass()} value={recForm.supplierId} onChange={(e) => setRecForm((f) => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nomeApelido}</option>)}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Categoria financeira</label>
                <select className={formModalInputClass()} value={recForm.financialAccountId} onChange={(e) => setRecForm((f) => ({ ...f, financialAccountId: e.target.value }))}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Valor</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(recForm.amount)}
                    placeholder="R$ 0,00"
                    onChange={(e) =>
                      setRecForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Dia do mês</label>
                  <input type="number" min={1} max={28} className={formModalInputClass()} value={recForm.dayOfMonth} onChange={(e) => setRecForm((f) => ({ ...f, dayOfMonth: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Frequência</label>
                <select className={formModalInputClass()} value={recForm.frequency} onChange={(e) => setRecForm((f) => ({ ...f, frequency: e.target.value }))}>
                  {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Início</label>
                  <input type="date" className={formModalInputClass()} value={recForm.startDate} onChange={(e) => setRecForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className={formModalLabelClass}>Término (opcional)</label>
                  <input type="date" className={formModalInputClass()} value={recForm.endDate} onChange={(e) => setRecForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Centro de custo padrão</label>
                <select className={formModalInputClass()} value={recForm.defaultCostCenterId} onChange={(e) => setRecForm((f) => ({ ...f, defaultCostCenterId: e.target.value }))}>
                  <option value="">—</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Projeto (opcional)</label>
                <select className={formModalInputClass()} value={recForm.projectId} onChange={(e) => setRecForm((f) => ({ ...f, projectId: e.target.value }))}>
                  <option value="">—</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRecurrenceModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveRecurrence()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editPayableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">Editar conta a pagar</h3>
              <button type="button" onClick={() => setEditPayableOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Atividade</label>
                <input
                  className={formModalInputClass()}
                  value={editPayableForm.description}
                  onChange={(e) => setEditPayableForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Valor</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(editPayableForm.amount)}
                    onChange={(e) =>
                      setEditPayableForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Vencimento</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={editPayableForm.dueDate}
                    onChange={(e) => setEditPayableForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditPayableOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveEditPayable()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editRecurrenceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">Editar recorrência</h3>
              <button type="button" onClick={() => setEditRecurrenceId(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input
                  className={formModalInputClass()}
                  value={editRecForm.description}
                  onChange={(e) => setEditRecForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Valor</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(editRecForm.amount)}
                    onChange={(e) =>
                      setEditRecForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Dia do mês</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className={formModalInputClass()}
                    value={editRecForm.dayOfMonth}
                    onChange={(e) => setEditRecForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Frequência</label>
                <select
                  className={formModalInputClass()}
                  value={editRecForm.frequency}
                  onChange={(e) => setEditRecForm((f) => ({ ...f, frequency: e.target.value }))}
                >
                  {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formModalLabelClass}>Próximo vencimento</label>
                <input
                  type="date"
                  className={formModalInputClass()}
                  value={editRecForm.nextDueDate}
                  onChange={(e) => setEditRecForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editRecForm.isActive}
                  onChange={(e) => setEditRecForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Recorrência ativa
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditRecurrenceId(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveEditRecurrence()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
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
              <button type="button" onClick={() => { setDetailId(null); setDetail(null); setAttachments([]); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid gap-1 text-sm text-[color:var(--muted-foreground)] sm:grid-cols-2">
              <p>Profissional/Empresa: {dash(detail.payeeDisplayName ?? detail.supplierName)}</p>
              <p>Categoria financeira: {dash(detail.financialCategoryName)}</p>
              <p>Tipo contrato: {dash(detail.contractTypeName)}</p>
              <p>Centro de custo: {dash(detail.primaryCostCenterName)}</p>
              <p>Vencimento: {formatarData(detail.nextDueDate)}</p>
              <p className="flex items-center gap-2">
                Status:{" "}
                {detail.status === "PENDENTE_APROVACAO" ? (
                  <StatusBadge status={detail.status} />
                ) : (
                  <select
                    className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-xs"
                    value={detail.status}
                    onChange={(e) => void changePayableStatus(detail.id, e.target.value)}
                  >
                    {PAYABLE_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </p>
            </div>

            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Valores</h4>
            <div className="mt-2 overflow-x-auto rounded-lg border text-xs" style={{ borderColor: "var(--border)" }}>
              <table className="min-w-full">
                <thead className="bg-black/5">
                  <tr>
                    <th className="px-2 py-1.5 text-right">Tx hora</th>
                    <th className="px-2 py-1.5 text-right">Valor</th>
                    <th className="px-2 py-1.5 text-right">Benefício</th>
                    <th className="px-2 py-1.5 text-right">Reembolso</th>
                    <th className="px-2 py-1.5 text-right">Descontos</th>
                    <th className="px-2 py-1.5 text-right">H. compl.</th>
                    <th className="px-2 py-1.5 text-right">Juros/Multa</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 text-right">{dash(detail.hourRateFormatted)}</td>
                    <td className="px-2 py-2 text-right">
                      {detail.totalAmountFormatted === "R$ 0,00" ? "—" : detail.totalAmountFormatted}
                    </td>
                    <td className="px-2 py-2 text-right">{dash(detail.benefitFormatted)}</td>
                    <td className="px-2 py-2 text-right">{dash(detail.reimbursementFormatted)}</td>
                    <td className="px-2 py-2 text-right">{dash(detail.discountFormatted)}</td>
                    <td className="px-2 py-2 text-right">{dash(detail.complementaryHours)}</td>
                    <td className="px-2 py-2 text-right">{dash(detail.interestFineFormatted)}</td>
                    <td className="px-2 py-2 text-right font-medium">{detail.computedTotalFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {detail.status === "PENDENTE_APROVACAO" && canApprove && (
              <button type="button" onClick={() => void approvePayable()} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white">
                <Check className="h-3.5 w-3.5" /> Aprovar despesa
              </button>
            )}

            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Parcelas</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[color:var(--muted-foreground)]">
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">Vencimento</th>
                    <th className="py-1 pr-3">Pagamento</th>
                    <th className="py-1 pr-3 text-right">Valor</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {detail.installments.map((inst) => (
                    <tr key={inst.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-3">{inst.installmentNumber}</td>
                      <td className="py-2 pr-3">{formatarData(inst.dueDate)}</td>
                      <td className="py-2 pr-3">{formatarData(inst.paidAt)}</td>
                      <td className="py-2 pr-3 text-right">{formatarMoeda(inst.amountCents / 100)}</td>
                      <td className="py-2 pr-3"><StatusBadge status={inst.status} /></td>
                      <td className="py-2">
                        {(inst.status === "ABERTO" || inst.status === "VENCIDO") && detail.status !== "PENDENTE_APROVACAO" && (
                          <button
                            type="button"
                            onClick={() => setPayModal({ installmentId: inst.id, paidAt: new Date().toISOString().slice(0, 10) })}
                            className="text-[color:var(--primary)] hover:underline"
                          >
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">Rateio</h4>
            <ul className="mt-2 text-sm space-y-1">
              {detail.allocations.map((a, i) => (
                <li key={i}>
                  {a.costCenterName}
                  {a.projectName ? ` · ${a.projectName}` : ""}
                  {" — "}
                  {formatarMoeda(a.amountCents / 100)}
                  {a.percentBps ? ` (${(a.percentBps / 100).toLocaleString("pt-BR")}%)` : ""}
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <h4 className="text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">
                Anexos
              </h4>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Anexe nota fiscal, boleto ou comprovante. Os arquivos ficam salvos no banco e permanecem disponíveis.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    const cat = (e.target as HTMLInputElement).dataset.category ?? "OUTRO";
                    if (f) void uploadAttachment(f, cat);
                    e.target.value = "";
                  }}
                />
                {(["NOTA_FISCAL", "BOLETO", "COMPROVANTE"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-black/5"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.dataset.category = cat;
                        fileInputRef.current.click();
                      }
                    }}
                  >
                    <Upload className="h-3.5 w-3.5" /> {ATTACHMENT_LABELS[cat]}
                  </button>
                ))}
              </div>
              {attachments.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs bg-black/[0.02]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span>
                        <span className="font-medium">{ATTACHMENT_LABELS[att.category] ?? att.category}</span>
                        {" · "}
                        {att.filename}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadAttachment(att)}
                          className="text-[color:var(--primary)]"
                          title="Baixar"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAttachment(att.id)}
                          className="text-red-600"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">Nenhum anexo ainda.</p>
              )}
            </div>

            {detail.status !== "PAGO" && detail.status !== "CANCELADO" && (
              <button type="button" onClick={() => void cancelPayable()} className="mt-4 text-xs text-red-600 hover:underline">
                Cancelar conta
              </button>
            )}
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-[color:var(--surface)] p-5">
            <h3 className="font-semibold text-sm">Registrar pagamento</h3>
            <div className="mt-3">
              <label className={formModalLabelClass}>Data de pagamento</label>
              <input
                type="date"
                className={formModalInputClass()}
                value={payModal.paidAt}
                onChange={(e) => setPayModal((p) => (p ? { ...p, paidAt: e.target.value } : p))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPayModal(null)} className="rounded-lg border px-3 py-1.5 text-sm">Cancelar</button>
              <button type="button" onClick={() => void payInstallment()} className="rounded-lg bg-[color:var(--primary)] px-3 py-1.5 text-sm text-white">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
