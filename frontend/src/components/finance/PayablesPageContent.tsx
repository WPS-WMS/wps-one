"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Download, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { FinanceHistoryPanel, type FinanceHistoryRow } from "@/components/finance/FinanceHistoryPanel";
import {
  FinanceAgingSummaryCard,
  FinanceCollapsibleFilters,
  FinancePageHeader,
  financeListPageShellClass,
  financeListTheadClass,
  financeListTheadStyle,
  financePrimaryBtnClass,
  financePrimaryBtnStyle,
  financeSecondaryBtnClass,
} from "@/components/finance/FinancePageHeader";
import { canFinanceFeature, isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { monthYearToDueRange, unwrapPaginatedList } from "@/lib/financePaginated";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  PAYABLE_ATTACHMENT_LABELS,
  PAYABLE_ATTACHMENT_UPLOAD_CATEGORIES,
  PAYABLE_FREQUENCY_LABELS,
  PAYABLE_MONTH_OPTIONS,
  PAYABLE_STATUS_BADGE_CLASS,
  PAYABLE_STATUS_LABELS,
} from "@/components/finance/payablesConstants";

type Option = { id: string; name: string };
type SupplierOption = { id: string; nomeApelido: string };
type UserOption = { id: string; name: string; linkedSupplierId?: string | null };
type ProjectOption = { id: string; name: string };
type FinancialCategoryOption = {
  id: string;
  name: string;
  enableHourRate?: boolean;
  enableAmount?: boolean;
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
  computedTotalCents?: number;
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
  yearNumber?: number;
  kind: string;
  status: string;
  paidAt: string | null;
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
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string | null;
  updatedByName?: string | null;
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
  nextDueDate: string | null;
  isActive: boolean;
  hasPaidPayable?: boolean;
  supplierId?: string | null;
  professionalUserId?: string | null;
  financialAccountId?: string;
  financialCategoryId?: string | null;
  corporateExpenseTypeId?: string | null;
  defaultCostCenterId?: string | null;
  projectId?: string | null;
  supplier: { id?: string; nomeApelido: string } | null;
  professional?: { id?: string; name: string; employmentType?: string | null } | null;
  financialAccount?: { id?: string; name: string } | null;
  financialCategory?: { id?: string; name: string } | null;
};

type AttachmentRow = {
  id: string;
  filename: string;
  category: string;
  createdAt: string;
  user?: { name: string };
};

const STATUS_LABELS = PAYABLE_STATUS_LABELS;
const STATUS_BADGE_CLASS = PAYABLE_STATUS_BADGE_CLASS;

function centsToFormValue(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(cents / 100);
}

function calculateHourlyRateFromAmount(rawAmount: string): string {
  const amountCents = moedaParaCentavos(rawAmount);
  if (amountCents == null) return "";
  return centsToFormValue(Math.round(amountCents / 168));
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const cls = STATUS_BADGE_CLASS[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-[11px] ${cls}`}
      title={label}
    >
      {label}
    </span>
  );
}

const ATTACHMENT_LABELS = PAYABLE_ATTACHMENT_LABELS;
const ATTACHMENT_UPLOAD_CATEGORIES = PAYABLE_ATTACHMENT_UPLOAD_CATEGORIES;
const FREQUENCY_LABELS = PAYABLE_FREQUENCY_LABELS;

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

const MONTH_OPTIONS = PAYABLE_MONTH_OPTIONS;

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar"),
    [can],
  );
  const canApprove = useMemo(
    () => canFinanceFeature(can, "financeiro.contasPagar.aprovar"),
    [can],
  );
  const pendingNovaFromGestaoHorasRef = useRef(false);

  const [viewTab, setViewTab] = useState<"contas" | "recorrencia">("contas");
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const listLimit = 50;
  const [recurrenceRules, setRecurrenceRules] = useState<RecurrenceRule[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [professionals, setProfessionals] = useState<UserOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategoryOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aging, setAging] = useState<{
    buckets: Record<string, { count: number; totalCents: number }>;
    overdueTotalCents: number;
    overdueCount: number;
  } | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()));
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
  const [detailTab, setDetailTab] = useState<"dados" | "historico">("dados");
  const [history, setHistory] = useState<FinanceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [payModal, setPayModal] = useState<{ installmentId: string; paidAt: string } | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [bulkMarkingPaid, setBulkMarkingPaid] = useState(false);
  const [updatingCostCenterId, setUpdatingCostCenterId] = useState<string | null>(null);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importCsvFile, setImportCsvFile] = useState<File | null>(null);
  const [importDueDate, setImportDueDate] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [editingPayableId, setEditingPayableId] = useState<string | null>(null);
  const [editingPayableStatus, setEditingPayableStatus] = useState<string | null>(null);
  const [editingRecurrenceId, setEditingRecurrenceId] = useState<string | null>(null);
  const [editingRecurrenceHasPaid, setEditingRecurrenceHasPaid] = useState(false);
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

  useEffect(() => {
    if (!selectedCategory?.enableAmount || !selectedCategory.enableHourRate) return;
    const calculated = calculateHourlyRateFromAmount(form.amount);
    setForm((current) =>
      current.hourRate === calculated ? current : { ...current, hourRate: calculated },
    );
  }, [form.amount, selectedCategory]);

  const [recForm, setRecForm] = useState({
    description: "",
    payeeKind: "supplier" as "professional" | "supplier",
    professionalUserId: "",
    supplierId: "",
    financialCategoryId: "",
    amount: "",
    defaultCostCenterId: "",
    projectId: "",
    frequency: "MENSAL",
    dayOfMonth: "1",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });

  const loadOptions = useCallback(async () => {
    const [sRes, uRes, ccRes, fcRes, pRes] = await Promise.all([
      apiFetch("/api/suppliers/for-select"),
      apiFetch("/api/users/for-select?scope=relatorios&status=ativos"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-categories"),
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
              enableDiscount: Boolean(c.enableDiscount),
              enableComplementaryHours: Boolean(c.enableComplementaryHours),
              enableInterestFine: Boolean(c.enableInterestFine),
            }))
        : [],
    );
    const pBody = await pRes.json().catch(() => null);
    setProjects(pRes.ok && Array.isArray(pBody) ? pBody.map((p: ProjectOption) => ({ id: p.id, name: p.name })) : []);
  }, []);

  const loadPayables = useCallback(async (opts?: { offset?: number; sync?: boolean }) => {
    const offset = opts?.offset ?? 0;
    if (opts?.sync) {
      await apiFetch("/api/payables/sync-recurrence", { method: "POST" }).catch(() => null);
    }

    const params = new URLSearchParams();
    params.set("limit", String(listLimit));
    params.set("offset", String(offset));
    if (filterStatus) params.set("status", filterStatus);
    if (filterCategoryId) params.set("categoryId", filterCategoryId);
    if (filterCostCenterId) params.set("costCenterId", filterCostCenterId);
    if (filterActivityQ.trim()) params.set("q", filterActivityQ.trim());
    if (filterPayeeQ.trim()) params.set("payeeQ", filterPayeeQ.trim());

    if (filterDateFrom || filterDateTo) {
      if (filterDateFrom) params.set("dueFrom", filterDateFrom);
      if (filterDateTo) params.set("dueTo", filterDateTo);
    } else {
      const year = filterYear ? Number(filterYear) : null;
      const month = filterMonth ? Number(filterMonth) : null;
      const range = monthYearToDueRange(year, month);
      if (range.dueFrom) params.set("dueFrom", range.dueFrom);
      if (range.dueTo) params.set("dueTo", range.dueTo);
    }

    const [pRes, agingRes] = await Promise.all([
      apiFetch(`/api/payables?${params.toString()}`),
      apiFetch("/api/payables/aging"),
    ]);
    const pBody = await pRes.json().catch(() => null);
    if (!pRes.ok) {
      throw new Error(typeof pBody?.error === "string" ? pBody.error : "Erro ao carregar contas.");
    }
    const page = unwrapPaginatedList<PayableRow>(pBody);
    setRows(page.items);
    setListTotal(page.total);
    setListOffset(offset);
    const agingBody = await agingRes.json().catch(() => null);
    setAging(agingRes.ok ? agingBody : null);
  }, [
    filterStatus,
    filterCategoryId,
    filterCostCenterId,
    filterActivityQ,
    filterPayeeQ,
    filterDateFrom,
    filterDateTo,
    filterYear,
    filterMonth,
  ]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const options: { value: string; label: string }[] = [];
    for (let y = current + 1; y >= current - 2; y -= 1) {
      options.push({ value: String(y), label: String(y) });
    }
    return options;
  }, []);

  const filteredRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dueA = a.nextDueDate || a.competenceDate || a.referenceDate || "";
      const dueB = b.nextDueDate || b.competenceDate || b.referenceDate || "";
      if (!dueA && !dueB) return 0;
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA.localeCompare(dueB);
    });
  }, [rows]);

  const activeFilterCount = [
    filterStatus,
    filterMonth,
    filterYear,
    filterDateFrom,
    filterDateTo,
    filterCategoryId,
    filterPayeeQ.trim(),
    filterActivityQ.trim(),
    filterCostCenterId,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setFilterStatus("");
    setFilterMonth("");
    setFilterYear(String(new Date().getFullYear()));
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCategoryId("");
    setFilterPayeeQ("");
    setFilterActivityQ("");
    setFilterCostCenterId("");
  }

  const filteredTotalCents = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => sum + (row.computedTotalCents ?? row.totalAmountCents ?? 0),
        0,
      ),
    [filteredRows],
  );

  const filteredUnpaidRows = useMemo(
    () => filteredRows.filter((row) => row.status === "ABERTO" || row.status === "VENCIDO"),
    [filteredRows],
  );

  const loadRecurrenceRules = useCallback(async () => {
    const r = await apiFetch("/api/payables/recurrence/rules");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar recorrências.");
    }
    setRecurrenceRules(Array.isArray(body) ? body : []);
  }, []);

  const refreshLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadPayables({ sync: true, offset: 0 }), loadRecurrenceRules()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [loadPayables, loadRecurrenceRules]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadOptions();
        if (cancelled) return;
        await Promise.all([loadPayables({ sync: true, offset: 0 }), loadRecurrenceRules()]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Carga inicial (opções + sync). Filtros têm efeito próprio abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only for options/sync
  }, [permissionsReady, canAccess]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    if (searchParams.get("nova") !== "1") return;
    pendingNovaFromGestaoHorasRef.current = true;
  }, [permissionsReady, canAccess, searchParams]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    if (!pendingNovaFromGestaoHorasRef.current) return;
    if (financialCategories.length === 0) return;

    const professionalUserId = String(searchParams.get("professionalUserId") ?? "").trim();
    const professionalName = String(searchParams.get("professionalName") ?? "").trim();
    const amountCentsRaw = Number(searchParams.get("amountCents") ?? "");
    const dueDate = String(searchParams.get("dueDate") ?? "").trim();
    const categoryName = String(searchParams.get("categoryName") ?? "Folha").trim() || "Folha";

    pendingNovaFromGestaoHorasRef.current = false;
    router.replace(pathname, { scroll: false });

    if (!professionalUserId || !Number.isFinite(amountCentsRaw) || amountCentsRaw <= 0) {
      openCreateModal();
      return;
    }

    openCreateModalFromGestaoHoras({
      professionalUserId,
      professionalName,
      amountCents: Math.round(amountCentsRaw),
      dueDate,
      categoryName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez após carregar opções
  }, [permissionsReady, canAccess, financialCategories, professionals, searchParams, pathname, router]);

  const filtersBootstrapped = useRef(false);
  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    if (!filtersBootstrapped.current) {
      filtersBootstrapped.current = true;
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await loadPayables({ offset: 0 });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erro ao carregar contas.");
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [
    permissionsReady,
    canAccess,
    filterStatus,
    filterMonth,
    filterYear,
    filterDateFrom,
    filterDateTo,
    filterCategoryId,
    filterPayeeQ,
    filterActivityQ,
    filterCostCenterId,
    loadPayables,
  ]);

  async function loadHistory(id: string) {
    setHistoryLoading(true);
    const r = await apiFetch(`/api/payables/${id}/history`);
    const body = await r.json().catch(() => null);
    setHistory(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailTab("dados");
    setHistory([]);
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
    setEditingPayableStatus(d.status ?? null);
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
    setEditingRecurrenceHasPaid(Boolean(rule.hasPaidPayable));
    const professionalUserId = rule.professionalUserId ?? rule.professional?.id ?? "";
    setRecForm({
      description: rule.description,
      payeeKind: professionalUserId ? "professional" : "supplier",
      professionalUserId,
      supplierId: rule.supplierId ?? rule.supplier?.id ?? "",
      financialCategoryId: rule.financialCategoryId ?? rule.financialCategory?.id ?? "",
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
    setEditingPayableStatus(null);
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

  function openCreateModalFromGestaoHoras(prefill: {
    professionalUserId: string;
    professionalName: string;
    amountCents: number;
    dueDate: string;
    categoryName: string;
  }) {
    const folha =
      financialCategories.find(
        (c) => c.name.trim().toLowerCase() === prefill.categoryName.trim().toLowerCase(),
      ) ?? financialCategories.find((c) => c.name.trim().toLowerCase() === "folha");
    if (
      prefill.professionalUserId &&
      !professionals.some((p) => p.id === prefill.professionalUserId)
    ) {
      setProfessionals((current) => [
        ...current,
        { id: prefill.professionalUserId, name: prefill.professionalName || "Profissional" },
      ]);
    }
    setEditingPayableId(null);
    setEditingPayableStatus(null);
    setCancelConfirmOpen(false);
    setViewTab("contas");
    setForm({
      description: "",
      financialCategoryId: folha?.id ?? "",
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(prefill.dueDate)
        ? prefill.dueDate
        : new Date().toISOString().slice(0, 10),
      payeeKind: "professional",
      professionalUserId: prefill.professionalUserId,
      supplierId: "",
      defaultCostCenterId: "",
      hourRate: "",
      amount: centsToFormValue(prefill.amountCents),
      benefit: "",
      reimbursement: "",
      discount: "",
      complementaryHours: "",
      interestFine: "",
    });
    setAllocations([emptyAllocation()]);
    setModalOpen(true);
    if (!folha) {
      setError(
        `Categoria financeira "${prefill.categoryName}" não encontrada. Selecione a categoria Folha manualmente.`,
      );
    }
  }

  function openCreateRecurrenceModal() {
    setEditingRecurrenceId(null);
    setEditingRecurrenceHasPaid(false);
    setRecForm({
      description: "",
      payeeKind: "professional",
      professionalUserId: "",
      supplierId: "",
      financialCategoryId: "",
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

  async function savePayable() {
    if (!form.description.trim()) {
      setError("Informe a atividade/descrição.");
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
    await refreshLists();
    if (!editingPayableId && body && typeof body.id === "string") {
      await openDetail(body.id);
    }
  }

  async function saveRecurrence() {
    if (!recForm.description.trim()) {
      setError("Informe a atividade/descrição.");
      return;
    }
    if (!recForm.defaultCostCenterId || !recForm.financialCategoryId || !recForm.amount) {
      setError("Preencha categoria financeira, valor, início, término e centro de custo.");
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
    if (recForm.payeeKind === "professional" && !recForm.professionalUserId) {
      setError("Selecione o profissional.");
      return;
    }
    if (recForm.payeeKind === "supplier" && !recForm.supplierId) {
      setError("Selecione o fornecedor.");
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
      professionalUserId: recForm.payeeKind === "professional" ? recForm.professionalUserId || null : null,
      supplierId: recForm.payeeKind === "supplier" ? recForm.supplierId || null : null,
      financialCategoryId: recForm.financialCategoryId,
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
    setEditingRecurrenceHasPaid(false);
    await refreshLists();
  }

  async function toggleRecurrenceActive(rule: RecurrenceRule) {
    setError(null);
    const nextActive = !rule.isActive;
    if (
      !nextActive &&
      !window.confirm(
        rule.hasPaidPayable
          ? `Inativar a recorrência "${rule.description}"?\n\nAs contas futuras em aberto serão removidas. Contas já pagas serão preservadas.`
          : `Inativar a recorrência "${rule.description}"?\n\nAs contas futuras em aberto serão removidas da listagem.`,
      )
    ) {
      return;
    }
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
    await refreshLists();
  }

  async function deleteRecurrence(rule: RecurrenceRule) {
    if (
      !window.confirm(
        rule.hasPaidPayable
          ? `Excluir a recorrência "${rule.description}"?\n\nContas futuras em aberto serão removidas. Contas já pagas permanecerão no histórico de Contas a pagar.`
          : `Excluir a recorrência "${rule.description}"? Contas em aberto geradas por ela serão removidas da listagem.`,
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
    await refreshLists();
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
    await refreshLists();
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
      await refreshLists();
      if (detailId === payableId) await openDetail(payableId);
    } finally {
      setMarkingPaidId(null);
    }
  }

  async function markAllFilteredAsPaid() {
    if (filteredUnpaidRows.length === 0 || bulkMarkingPaid) return;
    const count = filteredUnpaidRows.length;
    const scopeLabel = hasActiveFilters ? "filtrada(s)" : "da lista";
    if (
      !window.confirm(
        `Marcar ${count} conta(s) ${scopeLabel} como paga(s)?\n\nTotal: ${formatarMoeda(filteredUnpaidRows.reduce((s, r) => s + (r.computedTotalCents ?? r.totalAmountCents ?? 0), 0) / 100)}`,
      )
    ) {
      return;
    }
    setBulkMarkingPaid(true);
    setError(null);
    const paidAt = new Date().toISOString().slice(0, 10);
    let ok = 0;
    let fail = 0;
    let firstError: string | null = null;
    try {
      for (const row of filteredUnpaidRows) {
        const r = await apiFetch(`/api/payables/${row.id}/mark-paid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt }),
        });
        if (r.ok) {
          ok += 1;
        } else {
          fail += 1;
          if (!firstError) {
            const body = await r.json().catch(() => null);
            firstError =
              typeof body?.error === "string" ? body.error : "Erro ao marcar como pago.";
          }
        }
      }
      await refreshLists();
      if (fail > 0) {
        setError(
          `Marcação em lote: ${ok} paga(s), ${fail} com erro.${firstError ? ` Ex.: ${firstError}` : ""}`,
        );
      }
    } finally {
      setBulkMarkingPaid(false);
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
      const skippedCredits = Number(body?.skippedCredits ?? 0);
      const errCount = Array.isArray(body?.errors) ? body.errors.length : 0;
      const firstErr =
        errCount > 0 && body.errors[0]?.message ? ` Ex.: linha ${body.errors[0].line}: ${body.errors[0].message}` : "";
      setImportResult(
        `Importação concluída: ${created} conta(s) criada(s)` +
          (skippedCredits ? `, ${skippedCredits} crédito(s)/pagamento(s) ignorado(s)` : "") +
          (skipped > skippedCredits ? `, ${skipped - skippedCredits} linha(s) vazia(s) ignorada(s)` : "") +
          (errCount ? `, ${errCount} com erro` : "") +
          `.${firstErr}`,
      );
      await refreshLists();
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
      await refreshLists();
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
    setEditingPayableStatus(null);
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
    }
    await refreshLists();
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
    await refreshLists();
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
    await refreshLists();
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
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className={`${formModalInputClass()} pr-8`}
                  placeholder="0"
                  value={line.percent}
                  onChange={(e) => patchLine(idx, { percent: e.target.value })}
                  aria-label="Percentual do rateio"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--muted-foreground)]">
                  %
                </span>
              </div>
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
    <div className={financeListPageShellClass}>
      <FinancePageHeader
        title="Contas a pagar"
        subtitle="Visão alinhada à planilha de controle: folha, custos, vencimentos e rateio por centro de custo."
        chip="Saídas"
        tone="default"
        actions={
          viewTab === "contas" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setImportCsvOpen(true);
                  setImportResult(null);
                  setImportCsvFile(null);
                }}
                className={financeSecondaryBtnClass}
                style={{ borderColor: "var(--border)" }}
              >
                <Upload className="h-4 w-4" /> Importar CSV
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className={financePrimaryBtnClass}
                style={financePrimaryBtnStyle}
              >
                <Plus className="h-4 w-4" /> Nova conta
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openCreateRecurrenceModal()}
              className={financePrimaryBtnClass}
              style={financePrimaryBtnStyle}
            >
              <RefreshCw className="h-4 w-4" /> Nova recorrência
            </button>
          )
        }
      />

      <div className="flex gap-1 rounded-lg border p-1 w-fit" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            viewTab === "contas"
              ? "bg-[color:var(--primary)] text-white"
              : "text-[color:var(--muted-foreground)] hover:bg-black/5"
          }`}
          onClick={() => setViewTab("contas")}
        >
          Contas
        </button>
        <button
          type="button"
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            viewTab === "recorrencia"
              ? "bg-[color:var(--primary)] text-white"
              : "text-[color:var(--muted-foreground)] hover:bg-black/5"
          }`}
          onClick={() => setViewTab("recorrencia")}
        >
          Recorrências
        </button>
      </div>

      {error && <div className="wps-finance-alert-error rounded-lg border px-4 py-3 text-sm">{error}</div>}

      {viewTab === "contas" && (
        <>
          {aging && (
            <FinanceAgingSummaryCard
              tone="outflow"
              overdueCount={aging.overdueCount}
              overdueTotalCents={aging.overdueTotalCents}
              buckets={aging.buckets}
            />
          )}
          <FinanceCollapsibleFilters activeCount={activeFilterCount} onClear={clearFilters}>
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
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Ano</label>
                <PopoverSelect
                  id="payables-filter-year"
                  value={filterYear}
                  onChange={(v) => setFilterYear(v)}
                  placeholder="Todos"
                  checklist={false}
                  options={[{ value: "", label: "Todos" }, ...yearOptions]}
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
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  Atividade/Descrição
                </label>
                <input
                  type="search"
                  className={inputClass}
                  value={filterActivityQ}
                  onChange={(e) => setFilterActivityQ(e.target.value)}
                  placeholder="Digite a atividade ou descrição..."
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
          </FinanceCollapsibleFilters>

          {loading ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma conta a pagar.</p>
          ) : (
            <>
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-sm">
                  <span className="text-[color:var(--muted-foreground)]">
                    {hasActiveFilters ? "Total filtrado" : "Total"}
                    {` (${listTotal} conta${listTotal === 1 ? "" : "s"}): `}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatarMoeda(filteredTotalCents / 100)}
                  </span>
                </div>
                {filteredUnpaidRows.length > 0 && (
                  <button
                    type="button"
                    disabled={bulkMarkingPaid}
                    onClick={() => void markAllFilteredAsPaid()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {bulkMarkingPaid ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Marcar {filteredUnpaidRows.length} como paga
                    {filteredUnpaidRows.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            <div
              className="max-h-[min(70vh,calc(100dvh-13rem))] overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth rounded-xl border [scrollbar-gutter:stable]"
              style={{ borderColor: "var(--border)" }}
            >
              <table className="w-full table-fixed border-collapse text-[11px] leading-tight sm:text-xs">
                <colgroup>
                  <col className="w-[4.75rem] sm:w-[5.25rem]" />
                  <col className="w-[6.5rem] sm:w-[7.5rem]" />
                  <col className="w-[4.75rem] sm:w-[5.25rem]" />
                  <col className="w-[5.5rem] sm:w-[6.5rem]" />
                  <col />
                  <col className="w-[14%] sm:w-[16%]" />
                  <col className="w-[7.5rem] sm:w-[8.5rem]" />
                  <col className="w-[4.25rem] sm:w-[5rem]" />
                  <col className="w-[5rem] sm:w-[5.75rem]" />
                  <col className="w-[3.25rem] sm:w-[4.5rem]" />
                  <col className="w-[4.75rem] sm:w-[5.5rem]" />
                  <col className="w-[2.5rem]" />
                </colgroup>
                <thead className={financeListTheadClass} style={financeListTheadStyle}>
                  <tr>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5">Data</th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5" title="Categoria financeira">
                      Ctg Fin.
                    </th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5">Venc.</th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5" title="Tipo contrato">
                      Tipo
                    </th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5" title="Profissional/Empresa">
                      Prof./Emp.
                    </th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5" title="Atividade/Descrição">
                      Atividade
                    </th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5" title="Centro de custo">
                      C. custo
                    </th>
                    <th className="px-1 py-2 text-right sm:px-1.5 sm:py-2.5">Tx hora</th>
                    <th className="px-1 py-2 text-right sm:px-1.5 sm:py-2.5">Total</th>
                    <th className="px-1 py-2 text-center sm:px-1.5 sm:py-2.5">Pago</th>
                    <th className="px-1 py-2 text-left sm:px-1.5 sm:py-2.5">Status</th>
                    <th className="px-1 py-2 text-center sm:px-1.5 sm:py-2.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isPaid = row.status === "PAGO";
                    const canTogglePaid =
                      row.status === "ABERTO" ||
                      row.status === "VENCIDO" ||
                      row.status === "PAGO";
                    const payeeLabel = row.payeeDisplayName ?? row.supplierName;
                    return (
                    <tr
                      key={row.id}
                      className="border-t cursor-pointer hover:bg-black/5"
                      style={{ borderColor: "var(--border)" }}
                      onClick={() => void openDetail(row.id)}
                    >
                      <td className="px-1 py-1.5 tabular-nums sm:px-1.5 sm:py-2" title={formatarData(row.referenceDate)}>
                        <span className="block truncate">{formatarData(row.referenceDate)}</span>
                      </td>
                      <td className="px-1 py-1.5 sm:px-1.5 sm:py-2" title={row.financialCategoryName || undefined}>
                        <span className="block truncate">
                          {dash(row.financialCategoryName)}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 tabular-nums sm:px-1.5 sm:py-2" title={formatarData(row.nextDueDate)}>
                        <span className="block truncate">{formatarData(row.nextDueDate)}</span>
                      </td>
                      <td className="px-1 py-1.5 sm:px-1.5 sm:py-2" title={row.contractTypeName || undefined}>
                        <span className="block truncate">{dash(row.contractTypeName)}</span>
                      </td>
                      <td className="px-1 py-1.5 sm:px-1.5 sm:py-2" title={payeeLabel || undefined}>
                        <span className="block truncate">{dash(payeeLabel)}</span>
                      </td>
                      <td className="px-1 py-1.5 font-medium sm:px-1.5 sm:py-2" title={row.description}>
                        <span className="block truncate">{row.description}</span>
                      </td>
                      <td
                        className="px-1 py-1.5 sm:px-1.5 sm:py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PopoverSelect
                          id={`payable-cc-${row.id}`}
                          value={row.primaryCostCenterId ?? ""}
                          onChange={(v) => void updateRowCostCenter(row.id, v)}
                          placeholder="Selecionar..."
                          checklist={false}
                          buttonClassName="!w-full !min-w-0 !py-1 !px-1.5 !text-[11px] !rounded-md sm:!text-xs"
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
                      <td className="px-1 py-1.5 text-right tabular-nums sm:px-1.5 sm:py-2" title={row.hourRateFormatted || undefined}>
                        <span className="block truncate">{dash(row.hourRateFormatted)}</span>
                      </td>
                      <td className="px-1 py-1.5 text-right font-medium tabular-nums sm:px-1.5 sm:py-2" title={row.computedTotalFormatted}>
                        <span className="block truncate">{row.computedTotalFormatted}</span>
                      </td>
                      <td
                        className="px-1 py-1.5 text-center sm:px-1.5 sm:py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="inline-flex flex-col items-center justify-center gap-0.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 accent-[color:var(--primary)] cursor-pointer disabled:cursor-not-allowed sm:h-4 sm:w-4"
                            checked={isPaid}
                            disabled={!canTogglePaid || markingPaidId === row.id || bulkMarkingPaid}
                            title={
                              isPaid
                                ? row.paidAt
                                  ? `Pago em ${formatarData(row.paidAt)} — desmarcar`
                                  : "Desmarcar pagamento"
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
                          {isPaid && row.paidAt && (
                            <span className="hidden max-w-full truncate text-[10px] leading-none text-[color:var(--muted-foreground)] tabular-nums sm:block">
                              {formatarData(row.paidAt)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 sm:px-1.5 sm:py-2">
                        <div className="min-w-0 overflow-hidden">
                          <StatusBadge status={row.status} />
                        </div>
                      </td>
                      <td
                        className="px-0.5 py-1.5 text-center sm:px-1 sm:py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1 hover:bg-black/5 sm:p-1.5"
                          title="Editar"
                          aria-label="Editar"
                          onClick={() => void openEditPayable(row.id)}
                        >
                          <Pencil className="h-3.5 w-3.5 text-[color:var(--muted-foreground)] sm:h-4 sm:w-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {listTotal > listLimit && (
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-[color:var(--muted-foreground)]">
                  {listOffset + 1}–{Math.min(listOffset + listLimit, listTotal)} de {listTotal}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={listOffset <= 0 || loading}
                    className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                    onClick={() => void loadPayables({ offset: Math.max(0, listOffset - listLimit) })}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={listOffset + listLimit >= listTotal || loading}
                    className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                    onClick={() => void loadPayables({ offset: listOffset + listLimit })}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
            </>
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
                  <th className="px-3 py-2 text-left">Atividade/Descrição</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Categoria financeira</th>
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
                    <td className="px-3 py-2">
                      {rule.financialCategory?.name ?? rule.financialAccount?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatarMoeda(
                        Number.isFinite(rule.amountCents) ? rule.amountCents / 100 : null,
                      )}
                    </td>
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
                          title={rule.isActive ? "Inativar (remove futuras em aberto)" : "Ativar"}
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
                          title={
                            rule.hasPaidPayable
                              ? "Excluir (preserva contas pagas; remove futuras)"
                              : "Excluir"
                          }
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
                  Cada linha vira uma conta a pagar com categoria financeira{" "}
                  <strong>Cartão de Crédito</strong>. Use Data de Compra, Categoria, Descrição e Valor (em R$).
                  Também lê Final cartão (coluna C) e Centro de custo (coluna J) — o centro só é preenchido se já
                  existir no cadastro; caso contrário fica em branco para você selecionar na listagem.
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
                <label className={formModalLabelClass}>Atividade/Descrição</label>
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
                        readOnly={Boolean(selectedCategory.enableAmount)}
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
              <AllocationEditor lines={allocations} onChange={setAllocations} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingPayableId &&
                  editingPayableStatus !== "PAGO" &&
                  editingPayableStatus !== "CANCELADO" && (
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
                    setEditingPayableStatus(null);
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
                  setEditingRecurrenceHasPaid(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {editingRecurrenceHasPaid && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Há contas já pagas nesta recorrência. Elas serão preservadas; alterações de valor, datas e demais
                campos afetam apenas as parcelas futuras em aberto.
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Atividade/Descrição</label>
                <input
                  className={formModalInputClass()}
                  value={recForm.description}
                  onChange={(e) => setRecForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex.: Folha mensal"
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Pagamento para</label>
                <div className="mb-2 flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      checked={recForm.payeeKind === "professional"}
                      onChange={() =>
                        setRecForm((f) => ({ ...f, payeeKind: "professional", supplierId: "" }))
                      }
                    />
                    Profissional
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      checked={recForm.payeeKind === "supplier"}
                      onChange={() =>
                        setRecForm((f) => ({ ...f, payeeKind: "supplier", professionalUserId: "" }))
                      }
                    />
                    Fornecedor
                  </label>
                </div>
                {recForm.payeeKind === "professional" ? (
                  <PopoverSelect
                    id="recurrence-form-professional"
                    value={recForm.professionalUserId}
                    onChange={(v) => setRecForm((f) => ({ ...f, professionalUserId: v }))}
                    placeholder="—"
                    options={[
                      { value: "", label: "—" },
                      ...professionals.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                ) : (
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
                )}
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  O tipo de contrato (PJ/CLT…) é preenchido automaticamente pelo cadastro do usuário.
                </p>
              </div>
              <div>
                <label className={formModalLabelClass}>Categoria financeira</label>
                <PopoverSelect
                  id="recurrence-form-financial-category"
                  value={recForm.financialCategoryId}
                  onChange={(v) => setRecForm((f) => ({ ...f, financialCategoryId: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...financialCategories.map((c) => ({ value: c.id, label: c.name })),
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
                    Dia do vencimento de cada conta gerada. Se cair em sábado ou domingo, usa o próximo dia útil.
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
                    disabled={editingRecurrenceHasPaid}
                    title={
                      editingRecurrenceHasPaid
                        ? "Início bloqueado porque há contas pagas nesta recorrência"
                        : undefined
                    }
                  />
                  {editingRecurrenceHasPaid && (
                    <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                      Início bloqueado para preservar o histórico das contas já pagas. Use o término para
                      encurtar as futuras.
                    </p>
                  )}
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
                    Até essa data, cada vencimento entra na listagem de Contas a pagar. Antecipe o término para
                    cancelar apenas as futuras em aberto.
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
                  setEditingRecurrenceHasPaid(false);
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
              <button
                type="button"
                onClick={() => {
                  setDetailId(null);
                  setDetail(null);
                  setAttachments([]);
                  setHistory([]);
                  setDetailTab("dados");
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
              {(
                [
                  ["dados", "Dados"],
                  ["historico", "Histórico"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDetailTab(key);
                    if (key === "historico" && detailId) void loadHistory(detailId);
                  }}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
                    detailTab === key
                      ? "border-[color:var(--primary)] text-[color:var(--foreground)]"
                      : "border-transparent text-[color:var(--muted-foreground)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailTab === "historico" ? (
              <div className="mt-4">
                <FinanceHistoryPanel
                  history={history}
                  loading={historyLoading}
                  audit={{
                    createdAt: detail.createdAt,
                    updatedAt: detail.updatedAt,
                    createdByName: detail.createdByName,
                    updatedByName: detail.updatedByName,
                  }}
                />
              </div>
            ) : (
              <>
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
                Anexe nota fiscal, boleto, comprovante ou outro documento. Os arquivos ficam salvos no banco e
                permanecem disponíveis.
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
                {ATTACHMENT_UPLOAD_CATEGORIES.map((cat) => (
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
              </>
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
