"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

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
  financialCategoryId?: string | null;
  financialCategoryName: string | null;
  contractTypeName: string | null;
  primaryCostCenterId?: string | null;
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
  hourRateCents?: number | null;
  benefitCents?: number | null;
  reimbursementCents?: number | null;
  discountCents?: number | null;
  interestFineCents?: number | null;
  financialCategoryId?: string | null;
  professionalUserId?: string | null;
  supplierId?: string | null;
  installments: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    amountCents: number;
    status: string;
    paidAt: string | null;
  }[];
  allocations: {
    id?: string;
    costCenterId: string;
    costCenterName: string;
    projectId: string | null;
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
  supplierId?: string | null;
  financialAccountId?: string;
  corporateExpenseTypeId?: string | null;
  defaultCostCenterId?: string | null;
  projectId?: string | null;
  supplier: { id?: string; nomeApelido: string } | null;
  financialAccount: { id?: string; name: string };
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

function centsToFormValue(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(cents / 100);
}

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

const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

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
  const [filterMonth, setFilterMonth] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterPayeeQ, setFilterPayeeQ] = useState("");
  const [filterActivityQ, setFilterActivityQ] = useState("");
  const [filterCostCenterId, setFilterCostCenterId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayableDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [payModal, setPayModal] = useState<{ installmentId: string; paidAt: string } | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [updatingCostCenterId, setUpdatingCostCenterId] = useState<string | null>(null);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importCsvFile, setImportCsvFile] = useState<File | null>(null);
  const [importDueDate, setImportDueDate] = useState("");
  const [importSupplierId, setImportSupplierId] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [editingPayableId, setEditingPayableId] = useState<string | null>(null);
  const [editingRecurrenceId, setEditingRecurrenceId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
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
    const pRes = await apiFetch("/api/payables");
    const pBody = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      throw new Error(typeof pBody?.error === "string" ? pBody.error : "Erro ao carregar contas.");
    }
    setRows(Array.isArray(pBody) ? pBody : []);
  }, []);

  const filteredRows = useMemo(() => {
    const payeeQ = filterPayeeQ.trim().toLowerCase();
    const activityQ = filterActivityQ.trim().toLowerCase();
    const selectedCostCenterName =
      costCenters.find((c) => c.id === filterCostCenterId)?.name?.toLowerCase() ?? "";

    return rows.filter((row) => {
      if (filterStatus && row.status !== filterStatus) return false;
      if (filterMonth && row.monthNumber !== Number(filterMonth)) return false;
      const dateRef = row.referenceDate || row.competenceDate || row.nextDueDate;
      if (filterDateFrom && (!dateRef || dateRef < filterDateFrom)) return false;
      if (filterDateTo && (!dateRef || dateRef > filterDateTo)) return false;
      if (filterCategoryId && row.financialCategoryId !== filterCategoryId) return false;
      if (payeeQ) {
        const label = `${row.payeeDisplayName ?? ""} ${row.supplierName ?? ""}`.toLowerCase();
        if (!label.includes(payeeQ)) return false;
      }
      if (activityQ && !row.description.toLowerCase().includes(activityQ)) return false;
      if (filterCostCenterId) {
        const cc = (row.primaryCostCenterName ?? "").toLowerCase();
        if (!cc || cc !== selectedCostCenterName) return false;
      }
      return true;
    });
  }, [
    rows,
    costCenters,
    filterStatus,
    filterMonth,
    filterDateFrom,
    filterDateTo,
    filterCategoryId,
    filterPayeeQ,
    filterActivityQ,
    filterCostCenterId,
  ]);

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
    const primaryCc = d.allocations?.[0]?.costCenterId ?? "";
    setEditingPayableId(id);
    setForm({
      description: d.description ?? "",
      financialCategoryId: d.financialCategoryId ?? "",
      dueDate: d.nextDueDate ?? new Date().toISOString().slice(0, 10),
      payeeKind: d.professionalUserId ? "professional" : "supplier",
      professionalUserId: d.professionalUserId ?? "",
      supplierId: d.supplierId ?? "",
      defaultCostCenterId: primaryCc,
      hourRate: centsToFormValue(d.hourRateCents),
      amount: centsToFormValue(d.totalAmountCents),
      benefit: centsToFormValue(d.benefitCents),
      reimbursement: centsToFormValue(d.reimbursementCents),
      discount: centsToFormValue(d.discountCents),
      complementaryHours: d.complementaryHours != null ? String(d.complementaryHours) : "",
      interestFine: centsToFormValue(d.interestFineCents),
    });
    setAllocations(
      d.allocations?.length
        ? d.allocations.map((a) => ({
            costCenterId: a.costCenterId,
            projectId: a.projectId ?? "",
            percent: String((a.percentBps ?? 10000) / 100),
          }))
        : [emptyAllocation()],
    );
    setCancelConfirmOpen(false);
    setModalOpen(true);
  }

  function openEditRecurrence(rule: RecurrenceRule) {
    setEditingRecurrenceId(rule.id);
    setRecForm({
      description: rule.description,
      supplierId: rule.supplierId ?? rule.supplier?.id ?? "",
      financialAccountId: rule.financialAccountId ?? rule.financialAccount?.id ?? "",
      corporateExpenseTypeId: rule.corporateExpenseTypeId ?? "",
      amount: centsToFormValue(rule.amountCents),
      defaultCostCenterId: rule.defaultCostCenterId ?? "",
      projectId: rule.projectId ?? "",
      frequency: rule.frequency || "MENSAL",
      dayOfMonth: String(rule.dayOfMonth || 1),
      startDate: String(rule.startDate).slice(0, 10),
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : "",
    });
    setRecurrenceModalOpen(true);
  }

  function openCreateModal() {
    setEditingPayableId(null);
    setCancelConfirmOpen(false);
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

  function openCreateRecurrenceModal() {
    setEditingRecurrenceId(null);
    setRecForm({
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
    setRecurrenceModalOpen(true);
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
    const r = await apiFetch(editingPayableId ? `/api/payables/${editingPayableId}` : "/api/payables", {
      method: editingPayableId ? "PATCH" : "POST",
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
    setEditingPayableId(null);
    await load();
    if (!editingPayableId && body && typeof body.id === "string") {
      await openDetail(body.id);
    }
  }

  async function saveRecurrence() {
    if (!recForm.description.trim()) {
      setError("Informe a descrição.");
      return;
    }
    if (!recForm.defaultCostCenterId || !recForm.financialAccountId || !recForm.amount) {
      setError("Preencha categoria, valor, início, término e centro de custo.");
      return;
    }
    if (!recForm.startDate) {
      setError("Informe a data de início da recorrência.");
      return;
    }
    if (!recForm.endDate) {
      setError("Informe a data de término da recorrência.");
      return;
    }
    if (recForm.endDate < recForm.startDate) {
      setError("Término deve ser igual ou posterior ao início.");
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
    const payload = {
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
      endDate: recForm.endDate,
    };
    const r = await apiFetch(
      editingRecurrenceId ? `/api/payables/recurrence/rules/${editingRecurrenceId}` : "/api/payables/recurrence/rules",
      {
        method: editingRecurrenceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar recorrência.");
      return;
    }
    setRecurrenceModalOpen(false);
    setEditingRecurrenceId(null);
    await load();
  }

  async function toggleRecurrenceActive(rule: RecurrenceRule) {
    setError(null);
    const nextActive = !rule.isActive;
    const r = await apiFetch(`/api/payables/recurrence/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao alterar status da recorrência.");
      return;
    }
    await load();
  }

  async function deleteRecurrence(rule: RecurrenceRule) {
    if (
      !window.confirm(
        `Excluir a recorrência "${rule.description}"? Contas em aberto geradas por ela serão removidas da listagem.`,
      )
    ) {
      return;
    }
    setError(null);
    const r = await apiFetch(`/api/payables/recurrence/rules/${rule.id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir recorrência.");
      return;
    }
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

  async function updateRowCostCenter(payableId: string, costCenterId: string) {
    setError(null);
    setUpdatingCostCenterId(payableId);
    try {
      const r = await apiFetch(`/api/payables/${payableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: costCenterId ? [{ costCenterId, percentBps: 10000 }] : [],
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao atualizar centro de custo.");
        return;
      }
      const ccName = costCenterId
        ? (costCenters.find((c) => c.id === costCenterId)?.name ?? null)
        : null;
      setRows((prev) =>
        prev.map((row) =>
          row.id === payableId
            ? { ...row, primaryCostCenterId: costCenterId || null, primaryCostCenterName: ccName }
            : row,
        ),
      );
      if (detailId === payableId) await openDetail(payableId);
    } finally {
      setUpdatingCostCenterId(null);
    }
  }

  async function readCsvFileAsText(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    const looksMojibake = /Ã.|Â./.test(text) && !/categoria/i.test(text);
    if (looksMojibake) {
      text = new TextDecoder("windows-1252").decode(buf);
    }
    return text;
  }

  async function submitCsvImport() {
    if (!importCsvFile) {
      setError("Selecione o arquivo CSV da fatura C6.");
      return;
    }
    setImportingCsv(true);
    setError(null);
    setImportResult(null);
    try {
      const csvText = await readCsvFileAsText(importCsvFile);
      const r = await apiFetch("/api/payables/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          dueDate: importDueDate || null,
          supplierId: importSupplierId || null,
          payeeName: "Cartão C6 Bank",
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const firstErr =
          Array.isArray(body?.errors) && body.errors[0]?.message
            ? String(body.errors[0].message)
            : typeof body?.error === "string"
              ? body.error
              : "Erro ao importar CSV.";
        setError(firstErr);
        return;
      }
      const created = Number(body?.created ?? 0);
      const skipped = Number(body?.skipped ?? 0);
      const errCount = Array.isArray(body?.errors) ? body.errors.length : 0;
      setImportResult(
        `Importação concluída: ${created} conta(s) criada(s)` +
          (skipped ? `, ${skipped} linha(s) ignorada(s)` : "") +
          (errCount ? `, ${errCount} com erro` : "") +
          ".",
      );
      await load();
      if (created > 0) {
        setImportCsvFile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler o CSV.");
    } finally {
      setImportingCsv(false);
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

  async function confirmCancelPayable() {
    if (!editingPayableId) return;
    const id = editingPayableId;
    setSaving(true);
    setError(null);
    const r = await apiFetch(`/api/payables/${id}/cancel`, { method: "PATCH" });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    setCancelConfirmOpen(false);
    setModalOpen(false);
    setEditingPayableId(null);
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
    }
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
              <PopoverSelect
                id={`payable-alloc-cc-${idx}`}
                value={line.costCenterId}
                onChange={(v) => patchLine(idx, { costCenterId: v })}
                placeholder="Centro de custo"
                options={[
                  { value: "", label: "Centro de custo" },
                  ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="col-span-4">
              <PopoverSelect
                id={`payable-alloc-project-${idx}`}
                value={line.projectId}
                onChange={(v) => patchLine(idx, { projectId: v })}
                placeholder="Projeto (opcional)"
                options={[
                  { value: "", label: "Projeto (opcional)" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
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
      <div>
        <h1 className="text-xl font-semibold">Contas a pagar</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Visão alinhada à planilha de controle: folha, custos, vencimentos e rateio por centro de custo.
        </p>
      </div>

      {viewTab === "contas" ? (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setImportCsvOpen(true);
              setImportResult(null);
              setImportCsvFile(null);
            }}
            className="inline-flex items-center gap-2 rounded-full border bg-[color:var(--surface)] px-4 py-2.5 text-sm font-medium shadow-lg hover:bg-black/5"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload className="h-4 w-4" /> Importar CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-medium text-white shadow-lg hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Nova conta
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openCreateRecurrenceModal()}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-medium text-white shadow-lg hover:opacity-95"
        >
          <RefreshCw className="h-4 w-4" /> Nova recorrência
        </button>
      )}

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
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold">Filtros</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Mês</label>
                <PopoverSelect
                  id="payables-filter-month"
                  value={filterMonth}
                  onChange={(v) => setFilterMonth(v)}
                  placeholder="Todos"
                  checklist={false}
                  options={[{ value: "", label: "Todos" }, ...MONTH_OPTIONS]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Data de</label>
                <input
                  type="date"
                  className={inputClass}
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Data até</label>
                <input
                  type="date"
                  className={inputClass}
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Categoria financeira</label>
                <PopoverSelect
                  id="payables-filter-category"
                  value={filterCategoryId}
                  onChange={(v) => setFilterCategoryId(v)}
                  placeholder="Todos"
                  checklist={false}
                  options={[
                    { value: "", label: "Todos" },
                    ...financialCategories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Profissional/Empresa</label>
                <input
                  type="search"
                  className={inputClass}
                  value={filterPayeeQ}
                  onChange={(e) => setFilterPayeeQ(e.target.value)}
                  placeholder="Digite o nome..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Atividade</label>
                <input
                  type="search"
                  className={inputClass}
                  value={filterActivityQ}
                  onChange={(e) => setFilterActivityQ(e.target.value)}
                  placeholder="Digite a atividade..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Centro de custo</label>
                <PopoverSelect
                  id="payables-filter-cost-center"
                  value={filterCostCenterId}
                  onChange={(v) => setFilterCostCenterId(v)}
                  placeholder="Todos"
                  checklist={false}
                  options={[
                    { value: "", label: "Todos" },
                    ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Status</label>
                <PopoverSelect
                  id="payables-filter-status"
                  value={filterStatus}
                  onChange={(v) => setFilterStatus(v)}
                  placeholder="Todos os status"
                  checklist={false}
                  options={[
                    { value: "", label: "Todos os status" },
                    ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
                  ]}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma conta a pagar.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="min-w-[1400px] w-full text-xs">
                <thead className="bg-black/5">
                  <tr>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Mês</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Data</th>
                    <th className="px-2 py-2 text-left whitespace-nowrap">Categoria financeira</th>
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
                  {filteredRows.map((row) => {
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
                      <td
                        className="px-2 py-2 whitespace-nowrap min-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PopoverSelect
                          id={`payable-cc-${row.id}`}
                          value={row.primaryCostCenterId ?? ""}
                          onChange={(v) => void updateRowCostCenter(row.id, v)}
                          placeholder="Selecionar..."
                          checklist={false}
                          disabled={
                            updatingCostCenterId === row.id ||
                            row.status === "PAGO" ||
                            row.status === "CANCELADO"
                          }
                          options={[
                            { value: "", label: "Sem centro de custo" },
                            ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                          ]}
                        />
                      </td>
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
                      <td className="px-2 py-2 whitespace-nowrap">
                        <StatusBadge status={row.status} />
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
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          rule.isActive
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {rule.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="mx-auto inline-flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                          title="Editar"
                          aria-label="Editar recorrência"
                          onClick={() => openEditRecurrence(rule)}
                        >
                          <Pencil className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                          title={rule.isActive ? "Inativar" : "Ativar"}
                          aria-label={rule.isActive ? "Inativar recorrência" : "Ativar recorrência"}
                          onClick={() => void toggleRecurrenceActive(rule)}
                        >
                          {rule.isActive ? (
                            <PowerOff className="h-4 w-4 text-amber-700" />
                          ) : (
                            <Power className="h-4 w-4 text-emerald-700" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                          title="Excluir"
                          aria-label="Excluir recorrência"
                          onClick={() => void deleteRecurrence(rule)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {importCsvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5 space-y-4">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">Importar fatura CSV (C6 Bank)</h3>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Cada linha vira uma conta a pagar. Use Data de Compra, Categoria, Descrição e Valor (em R$).
                  Centro de custo fica em branco para preencher na listagem.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 hover:bg-black/5"
                onClick={() => setImportCsvOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Arquivo CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className={inputClass}
                onChange={(e) => {
                  setImportCsvFile(e.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
              />
              {importCsvFile && (
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{importCsvFile.name}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Vencimento da fatura (opcional)
              </label>
              <input
                type="date"
                className={inputClass}
                value={importDueDate}
                onChange={(e) => setImportDueDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                Se vazio, usa a data de compra de cada linha.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Fornecedor (opcional)
              </label>
              <PopoverSelect
                id="import-csv-supplier"
                value={importSupplierId}
                onChange={setImportSupplierId}
                placeholder="Nenhum"
                checklist={false}
                options={[
                  { value: "", label: "Nenhum" },
                  ...suppliers.map((s) => ({ value: s.id, label: s.nomeApelido })),
                ]}
              />
            </div>

            {importResult && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {importResult}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setImportCsvOpen(false)}
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={importingCsv || !importCsvFile}
                onClick={() => void submitCsvImport()}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {importingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">{editingPayableId ? "Editar conta a pagar" : "Nova conta a pagar"}</h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingPayableId(null);
                  setCancelConfirmOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
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
                <PopoverSelect
                  id="payable-form-category"
                  value={form.financialCategoryId}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      financialCategoryId: v,
                      hourRate: "",
                      amount: "",
                      benefit: "",
                      reimbursement: "",
                      discount: "",
                      complementaryHours: "",
                      interestFine: "",
                    }))
                  }
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...financialCategories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
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
                    <PopoverSelect
                      id="payable-form-professional"
                      value={form.professionalUserId}
                      onChange={(v) => setForm((f) => ({ ...f, professionalUserId: v }))}
                      placeholder="Selecione o profissional"
                      options={[
                        { value: "", label: "Selecione o profissional" },
                        ...professionals.map((u) => ({ value: u.id, label: u.name })),
                      ]}
                    />
                    {form.professionalUserId &&
                      !professionals.find((u) => u.id === form.professionalUserId)?.linkedSupplierId && (
                        <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          Este profissional não tem fornecedor vinculado. Cadastre o vínculo em Fornecedores para pagamento e emissão de NF.
                        </p>
                      )}
                  </>
                ) : (
                  <PopoverSelect
                    id="payable-form-supplier"
                    value={form.supplierId}
                    onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
                    placeholder="Selecione a empresa/fornecedor"
                    options={[
                      { value: "", label: "Selecione a empresa/fornecedor" },
                      ...suppliers.map((s) => ({ value: s.id, label: s.nomeApelido })),
                    ]}
                  />
                )}
              </div>
              <div>
                <label className={formModalLabelClass}>Centro de custo</label>
                <PopoverSelect
                  id="payable-form-cost-center"
                  value={form.defaultCostCenterId}
                  onChange={(v) => setDefaultCostCenter(v)}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <AllocationEditor lines={allocations} onChange={setAllocations} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingPayableId && (
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
                    setEditingPayableId(null);
                    setCancelConfirmOpen(false);
                  }}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Fechar
                </button>
                <button type="button" disabled={saving} onClick={() => void savePayable()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
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
            <h3 className="font-semibold">Cancelar conta a pagar?</h3>
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
                onClick={() => void confirmCancelPayable()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {recurrenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between">
              <h3 className="font-semibold">{editingRecurrenceId ? "Editar recorrência" : "Nova recorrência"}</h3>
              <button
                type="button"
                onClick={() => {
                  setRecurrenceModalOpen(false);
                  setEditingRecurrenceId(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Descrição</label>
                <input className={formModalInputClass()} value={recForm.description} onChange={(e) => setRecForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={formModalLabelClass}>Fornecedor</label>
                <PopoverSelect
                  id="recurrence-form-supplier"
                  value={recForm.supplierId}
                  onChange={(v) => setRecForm((f) => ({ ...f, supplierId: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...suppliers.map((s) => ({ value: s.id, label: s.nomeApelido })),
                  ]}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Categoria financeira</label>
                <PopoverSelect
                  id="recurrence-form-financial-account"
                  value={recForm.financialAccountId}
                  onChange={(v) => setRecForm((f) => ({ ...f, financialAccountId: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...accounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
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
                  <label className={formModalLabelClass}>Dia do mês (vencimento)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className={formModalInputClass()}
                    value={recForm.dayOfMonth}
                    onChange={(e) => setRecForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                    title="Dia em que a conta vence a cada período"
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Dia do vencimento de cada conta gerada.
                  </p>
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Frequência</label>
                <PopoverSelect
                  id="recurrence-form-frequency"
                  value={recForm.frequency}
                  onChange={(v) => setRecForm((f) => ({ ...f, frequency: v }))}
                  options={Object.entries(FREQUENCY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Início da recorrência *</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={recForm.startDate}
                    onChange={(e) => setRecForm((f) => ({ ...f, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Término da recorrência *</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={recForm.endDate}
                    onChange={(e) => setRecForm((f) => ({ ...f, endDate: e.target.value }))}
                    required
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Até essa data, cada vencimento entra na listagem de Contas a pagar.
                  </p>
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Centro de custo padrão</label>
                <PopoverSelect
                  id="recurrence-form-cost-center"
                  value={recForm.defaultCostCenterId}
                  onChange={(v) => setRecForm((f) => ({ ...f, defaultCostCenterId: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Projeto (opcional)</label>
                <PopoverSelect
                  id="recurrence-form-project"
                  value={recForm.projectId}
                  onChange={(v) => setRecForm((f) => ({ ...f, projectId: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecurrenceModalOpen(false);
                  setEditingRecurrenceId(null);
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Fechar
              </button>
              <button type="button" disabled={saving} onClick={() => void saveRecurrence()} className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60">
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
              <p className="flex items-center gap-2">Status: <StatusBadge status={detail.status} /></p>
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
