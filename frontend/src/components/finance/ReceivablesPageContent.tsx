"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Banknote, Bell, Check, Download, Eye, FileText, Layers, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import { monthYearToDueRange, unwrapPaginatedList } from "@/lib/financePaginated";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceHistoryPanel, type FinanceHistoryRow } from "@/components/finance/FinanceHistoryPanel";
import {
  FinanceAgingSummaryCard,
  FinanceCollapsibleFilters,
  FinancePageHeader,
  FinancePageSizeSelect,
  financeListPageShellClass,
  financeListTableWrapClass,
  financeListTheadClass,
  financeListTheadStyle,
  financePrimaryBtnClass,
  financePrimaryBtnStyle,
  financeSecondaryBtnClass,
} from "@/components/finance/FinancePageHeader";
import { DatePicker } from "@/components/ui/DatePicker";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  paymentMethodLabel,
  RECEIVABLE_PAYMENT_METHOD_OPTIONS,
} from "@/lib/financePaymentMethods";

const RECEIVABLE_ATTACHMENT_LABELS: Record<string, string> = {
  NOTA_FISCAL: "Nota fiscal",
  BOLETO: "Boleto",
};

const RECEIVABLE_ATTACHMENT_UPLOAD_CATEGORIES = ["NOTA_FISCAL", "BOLETO"] as const;

type AttachmentRow = {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  category: string;
  createdAt: string;
};

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
  paymentMethod?: string | null;
  activityDescription?: string | null;
  financialAccountId?: string;
  financialAccountName: string;
  billingDocumentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null;
  billingDocumentLabel?: string;
  billingDocumentEmitLabel?: string;
  contractCurrency?: string | null;
  billingDocumentCanEmitNow?: boolean;
  billingDocumentBlockedReason?: string | null;
  hasInternalDocument?: boolean;
  nfNumber: string | null;
  nfEmissionDate: string | null;
  focusNfeRef?: string | null;
  focusNfeStatus?: string | null;
  focusNfeError?: string | null;
  focusNfeUrl?: string | null;
  focusNfeDanfseUrl?: string | null;
  nextDueDate: string | null;
  nextInstallmentId?: string | null;
  paid: boolean;
  incomplete: boolean;
  installmentCount: number;
  isGroup?: boolean;
  groupId?: string | null;
  groupMemberCount?: number;
  groupMembers?: ReceivableRow[];
};

type ReceivableDetail = ReceivableRow & {
  isGroup?: boolean;
  groupId?: string | null;
  groupMembers?: ReceivableRow[];
  notes: string | null;
  netAmountCents: number | null;
  taxAmountCents: number | null;
  retentionAmountCents: number | null;
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string | null;
  updatedByName?: string | null;
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
    nfNumber?: string | null;
    nfEmissionDate?: string | null;
    focusNfeRef?: string | null;
    focusNfeStatus?: string | null;
    focusNfeError?: string | null;
    focusNfeUrl?: string | null;
    focusNfeDanfseUrl?: string | null;
    hasInternalDocument?: boolean;
    billingDocumentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null;
    receivableId?: string | null;
    billingGroupId?: string | null;
    billingGroupDescription?: string | null;
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
  RECEBIDO: "Recebido",
  ATRASADO: "Previsto",
  CANCELADO: "Cancelado",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  FATURADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELADO: "bg-red-100 text-red-800 border-red-200",
  PREVISTO: "bg-slate-100 text-slate-700 border-slate-200",
  RECEBIDO: "bg-sky-100 text-sky-800 border-sky-200",
  ATRASADO: "bg-slate-100 text-slate-700 border-slate-200",
};

function displayReceivableStatus(status: string, opts?: { nfNumber?: string | null; paid?: boolean }): string {
  if (status === "CANCELADO") return "CANCELADO";
  if (status === "RECEBIDO" || opts?.paid) return "RECEBIDO";
  // NF emitida (ou status Faturado) prevalece sobre ATRASADO efetivo na lista.
  if (status === "FATURADO" || opts?.nfNumber) return "FATURADO";
  return "PREVISTO";
}

function StatusBadge({
  status,
  nfNumber,
  paid,
}: {
  status: string;
  nfNumber?: string | null;
  paid?: boolean;
}) {
  const display = displayReceivableStatus(status, { nfNumber, paid });
  const label = STATUS_LABELS[display] ?? display;
  const cls = STATUS_BADGE_CLASS[display] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

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

function dash(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

function billingDocumentEmitTitle(row: ReceivableRow): string {
  if (row.billingDocumentEmitLabel) return row.billingDocumentEmitLabel;
  if (row.billingDocumentType === "INVOICE") return "Emitir invoice";
  if (row.billingDocumentType === "NOTA_DEBITO") return "Emitir nota de débito";
  if (row.billingDocumentType === "NOTA_FISCAL") return "Emitir nota fiscal";
  return "Emitir nota";
}

function internalDocumentViewTitle(
  type?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null,
): string {
  if (type === "NOTA_DEBITO") return "Visualizar nota de débito";
  if (type === "INVOICE") return "Visualizar invoice";
  return "Visualizar documento";
}

function billingDocumentProviderLabel(
  provider: "FOCUS_NFE" | "PROVISORIA" | "INTERNAL" | undefined,
  documentLabel?: string,
): string {
  if (provider === "INTERNAL") {
    return `${documentLabel || "Documento interno"} (não usa Focus NFe)`;
  }
  if (provider === "PROVISORIA") return "NF provisória (sem Focus)";
  if (provider === "FOCUS_NFE") return "NFSe Nacional via Focus NFe";
  return documentLabel || "Nota";
}

function focusNoteViewUrl(danfse?: string | null, xml?: string | null): string | null {
  const url = (danfse ?? "").trim() || (xml ?? "").trim();
  return url || null;
}

function openFocusNote(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function openHtmlDocument(html: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
}

function rowDateParts(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso || !/^\d{4}-\d{2}/.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

export function ReceivablesPageContent() {
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.contasReceber"), [can]);

  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listSumCents, setListSumCents] = useState<number | null>(null);
  const [listOffset, setListOffset] = useState(0);
  const [listLimit, setListLimit] = useState(50);
  const listOffsetRef = useRef(0);
  listOffsetRef.current = listOffset;
  const [clients, setClients] = useState<Option[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [aging, setAging] = useState<AgingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPaid, setFilterPaid] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()));
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectQ, setFilterProjectQ] = useState("");
  const [filterContractQ, setFilterContractQ] = useState("");
  const [filterFinancialAccountId, setFilterFinancialAccountId] = useState("");
  const [filterDocumentType, setFilterDocumentType] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupDescription, setGroupDescription] = useState("");
  const [grouping, setGrouping] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [detailTab, setDetailTab] = useState<"valores" | "historico" | "nfse">("valores");
  const [receiveModal, setReceiveModal] = useState<{ installmentId: string; receivedAt: string } | null>(null);
  const [history, setHistory] = useState<FinanceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nfseAttempts, setNfseAttempts] = useState<
    Array<{
      id: string;
      installmentId: string;
      focusNfeRef: string;
      environment: string;
      status: string;
      nfNumber: string | null;
      codigoIss: string | null;
      focusNfeUrl: string | null;
      focusNfeDanfseUrl: string | null;
      errorMessage: string | null;
      source: string;
      createdAt: string;
      updatedAt: string;
      createdBy: { id: string; name: string } | null;
    }>
  >([]);
  const [nfseAttemptsLoading, setNfseAttemptsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [markingReceivedId, setMarkingReceivedId] = useState<string | null>(null);
  const [emittingInvoiceId, setEmittingInvoiceId] = useState<string | null>(null);
  const [emitConfirmRow, setEmitConfirmRow] = useState<ReceivableRow | null>(null);
  const [emitPreview, setEmitPreview] = useState<{
    provider?: "FOCUS_NFE" | "PROVISORIA" | "INTERNAL";
    documentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE";
    documentLabel?: string;
    emitActionLabel?: string;
    contractCurrency?: string;
    canEmitNow?: boolean;
    blockedReason?: string | null;
    clientName: string;
    tomadorDocumento: string;
    tomadorRazaoSocial: string;
    description: string;
    descricaoServico?: string;
    observacao?: string;
    amountFormatted: string;
    competenceDate: string | null;
    environment: string | null;
    codigoTributacaoNacionalIss: string | null;
    codigosTributacaoIssOptions?: string[];
    warnings: string[];
    invoicePreview?: {
      issuerName: string;
      billToName: string;
      project: string;
      currency: string;
      services: Array<{ consultant: string; activity: string; hours: number | null; amount: number }>;
    };
    debitNotePreview?: {
      issuerName: string;
      recipientName: string;
      referenteA: string;
      amountFormatted: string;
      amountInWords: string;
    };
  } | null>(null);
  const [emitIssCode, setEmitIssCode] = useState("");
  const [emitDescricaoServico, setEmitDescricaoServico] = useState("");
  const [emitPreviewLoading, setEmitPreviewLoading] = useState(false);
  const [emitModalError, setEmitModalError] = useState<string | null>(null);
  const [cancelFocusRow, setCancelFocusRow] = useState<ReceivableRow | null>(null);
  const [cancelFocusJustificativa, setCancelFocusJustificativa] = useState("");
  const [cancellingFocusId, setCancellingFocusId] = useState<string | null>(null);
  const [bulkMarkingReceived, setBulkMarkingReceived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Quando a lista é por parcela, edita só essa parcela (valor/vencimento). */
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    paymentMethod: "",
  });

  const loadOptions = useCallback(async () => {
    const [cRes, pRes, ccRes, accRes] = await Promise.all([
      apiFetch("/api/clients/for-finance-select"),
      apiFetch("/api/projects?light=true"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-accounts"),
    ]);
    let cBody = await cRes.json().catch(() => null);
    // Fallback: endpoint light indisponível → lista completa (mesmo tenant).
    if (!cRes.ok || !Array.isArray(cBody)) {
      const fallback = await apiFetch("/api/clients");
      cBody = await fallback.json().catch(() => null);
      setClients(
        fallback.ok && Array.isArray(cBody)
          ? cBody.map((c: Option) => ({ id: c.id, name: c.name }))
          : [],
      );
    } else {
      setClients(cBody.map((c: Option) => ({ id: c.id, name: c.name })));
    }
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
  }, []);

  const refreshLists = useCallback(async (opts?: { sync?: boolean; offset?: number; quiet?: boolean }) => {
    if (!opts?.quiet) {
      setLoading(true);
      setError(null);
    }
    const offset = opts?.offset ?? listOffsetRef.current;
    if (opts?.sync) {
      await apiFetch("/api/receivables/sync", { method: "POST" }).catch(() => null);
    }

    const params = new URLSearchParams();
    params.set("limit", String(listLimit));
    params.set("offset", String(offset));
    if (filterStatus) params.set("status", filterStatus);
    if (filterPaid) params.set("paid", filterPaid);
    if (filterClientId) params.set("clientId", filterClientId);
    if (filterProjectQ.trim()) params.set("q", filterProjectQ.trim());
    if (filterContractQ.trim()) params.set("contract", filterContractQ.trim());
    if (filterFinancialAccountId) params.set("financialAccountId", filterFinancialAccountId);
    if (filterDocumentType) params.set("documentType", filterDocumentType);

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

    const [rRes, agingRes] = await Promise.all([
      apiFetch(`/api/receivables?${params.toString()}`),
      apiFetch("/api/receivables/aging"),
    ]);
    const rBody = await rRes.json().catch(() => null);
    if (!rRes.ok) {
      if (!opts?.quiet) {
        setError(typeof rBody?.error === "string" ? rBody.error : "Erro ao carregar contas.");
        setLoading(false);
      }
      return;
    }
    const page = unwrapPaginatedList<ReceivableRow>(rBody);
    setRows(page.items);
    setListTotal(page.total);
    setListSumCents(typeof page.sumCents === "number" ? page.sumCents : null);
    setListOffset(offset);
    const agingBody = await agingRes.json().catch(() => null);
    if (agingRes.ok) setAging(agingBody as AgingSummary);
    if (!opts?.quiet) setLoading(false);
  }, [
    filterStatus,
    filterPaid,
    filterClientId,
    filterProjectQ,
    filterContractQ,
    filterFinancialAccountId,
    filterDocumentType,
    filterDateFrom,
    filterDateTo,
    filterYear,
    filterMonth,
    listLimit,
  ]);

  /** Atualiza na lista as linhas da conta a partir do detalhe (status/NF sem esperar F5). */
  function applyDetailToListRows(d: ReceivableDetail) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== d.id) return row;
        const inst = row.installmentId
          ? d.installments.find((item) => item.id === row.installmentId)
          : null;
        if (!inst) {
          return {
            ...row,
            status: d.status,
            nfNumber: d.nfNumber ?? d.invoice?.nfNumber ?? row.nfNumber,
            nfEmissionDate: d.nfEmissionDate ?? d.invoice?.emissionDate ?? row.nfEmissionDate,
            paid: d.paid || d.status === "RECEBIDO",
          };
        }
        return {
          ...row,
          status: inst.status,
          nfNumber: inst.nfNumber ?? row.nfNumber,
          nfEmissionDate: inst.nfEmissionDate ?? row.nfEmissionDate,
          focusNfeRef: inst.focusNfeRef ?? row.focusNfeRef,
          focusNfeStatus: inst.focusNfeStatus ?? row.focusNfeStatus,
          focusNfeError: inst.focusNfeError ?? row.focusNfeError,
          focusNfeUrl: inst.focusNfeUrl ?? row.focusNfeUrl,
          focusNfeDanfseUrl: inst.focusNfeDanfseUrl ?? row.focusNfeDanfseUrl,
          paid: inst.status === "RECEBIDO",
          nextDueDate: inst.dueDate,
        };
      }),
    );
  }

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadOptions();
        if (cancelled) return;
        await refreshLists({ sync: true, offset: 0 });
      } catch {
        if (!cancelled) setError("Erro ao carregar dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, [permissionsReady, canAccess]);

  const filtersBootstrapped = useRef(false);
  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    if (!filtersBootstrapped.current) {
      filtersBootstrapped.current = true;
      return;
    }
    const t = setTimeout(() => {
      void refreshLists({ offset: 0 });
    }, 300);
    return () => clearTimeout(t);
  }, [
    permissionsReady,
    canAccess,
    filterStatus,
    filterPaid,
    filterMonth,
    filterYear,
    filterDateFrom,
    filterDateTo,
    filterClientId,
    filterProjectQ,
    filterContractQ,
    filterFinancialAccountId,
    filterDocumentType,
    refreshLists,
  ]);

  // Enquanto houver NFSe em processamento, atualiza a lista (webhook Focus).
  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    const processing = rows.some((row) => row.focusNfeStatus === "processando_autorizacao");
    if (!processing) return;
    const t = setInterval(() => {
      void refreshLists({ quiet: true });
    }, 4000);
    return () => clearInterval(t);
  }, [permissionsReady, canAccess, rows, refreshLists]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current + 1, current, current - 1];
  }, []);

  const filteredRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dueA = a.competenceDate || a.nextDueDate || "";
      const dueB = b.competenceDate || b.nextDueDate || "";
      if (!dueA && !dueB) return 0;
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA.localeCompare(dueB);
    });
  }, [rows]);

  const activeFilterCount = [
    filterStatus,
    filterPaid,
    filterMonth,
    filterYear,
    filterDateFrom,
    filterDateTo,
    filterClientId,
    filterProjectQ.trim(),
    filterContractQ.trim(),
    filterFinancialAccountId,
    filterDocumentType,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setFilterStatus("");
    setFilterPaid("");
    setFilterMonth("");
    setFilterYear(String(new Date().getFullYear()));
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterClientId("");
    setFilterProjectQ("");
    setFilterContractQ("");
    setFilterFinancialAccountId("");
    setFilterDocumentType("");
  }

  const filteredTotalCents = useMemo(() => {
    if (listSumCents != null) return listSumCents;
    return filteredRows.reduce((sum, row) => sum + (row.totalAmountCents ?? 0), 0);
  }, [filteredRows, listSumCents]);

  const filteredUnreceivedRows = useMemo(
    () =>
      filteredRows.filter((row) => {
        if (row.paid || row.status === "RECEBIDO" || row.status === "CANCELADO") return false;
        // Só permite marcar pago após emissão da NF (Faturado).
        return row.status === "FATURADO" || !!row.nfNumber;
      }),
    [filteredRows],
  );

  const projectsForClient = useMemo(() => {
    if (!form.clientId) return [];
    return projects.filter((p) => p.clientId === form.clientId);
  }, [projects, form.clientId]);

  /** Opções de cliente: API + clientes já presentes nas linhas (evita select vazio na edição). */
  const clientSelectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) {
      if (c.id) map.set(c.id, c.name);
    }
    for (const row of rows) {
      if (row.clientId && row.clientName && !map.has(row.clientId)) {
        map.set(row.clientId, row.clientName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [clients, rows]);

  async function loadHistory(id: string) {
    setHistoryLoading(true);
    const r = await apiFetch(`/api/receivables/${id}/history`);
    const body = await r.json().catch(() => null);
    setHistory(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  function receivableSelectionKey(row: ReceivableRow): string | null {
    if (row.isGroup) return null;
    return row.installmentId ?? null;
  }

  const selectableFilteredRows = useMemo(
    () => filteredRows.filter((row) => receivableSelectionKey(row)),
    [filteredRows],
  );
  const allFilteredSelected =
    selectableFilteredRows.length > 0 &&
    selectableFilteredRows.every((row) => selectedRowKeys.includes(receivableSelectionKey(row)!));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const keys = new Set(selectableFilteredRows.map((row) => receivableSelectionKey(row)!));
      setSelectedRowKeys((prev) => prev.filter((id) => !keys.has(id)));
      return;
    }
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      for (const row of selectableFilteredRows) {
        const key = receivableSelectionKey(row);
        if (key) next.add(key);
      }
      return [...next];
    });
  }

  async function submitReceivableGroup() {
    setGrouping(true);
    setError(null);
    try {
      const r = await apiFetch("/api/receivables/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentIds: selectedRowKeys,
          description: groupDescription,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível agrupar.");
        return;
      }
      setGroupModalOpen(false);
      setGroupDescription("");
      setSelectedRowKeys([]);
      await refreshLists();
    } finally {
      setGrouping(false);
    }
  }

  async function ungroupReceivable(groupId: string) {
    const r = await apiFetch(`/api/receivables/groups/${groupId}`, { method: "DELETE" });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Não foi possível desagrupar.");
      return;
    }
    setDetailId(null);
    setDetail(null);
    await refreshLists();
  }

  async function openRowDetail(row: ReceivableRow) {
    if (row.isGroup && row.groupId) {
      setDetailId(row.groupId);
      setDetailTab("valores");
      const r = await apiFetch(`/api/receivables/groups/${row.groupId}`);
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível abrir o grupo.");
        return;
      }
      const members = (body.groupMembers ?? []) as ReceivableRow[];
      const firstId = members[0]?.id ?? body.id;
      const detailRes = await apiFetch(`/api/receivables/${firstId}`);
      const detailBody = await detailRes.json().catch(() => null);
      const base = (detailRes.ok ? detailBody : body) as ReceivableDetail;
      const groupedIds = new Set(
        members.map((m) => m.installmentId).filter((id): id is string => Boolean(id)),
      );
      const groupInstallmentsRaw = (base.installments ?? []).filter((inst) => groupedIds.has(inst.id));
      const groupInstallments =
        groupInstallmentsRaw.length > 0
          ? groupInstallmentsRaw
          : members.map((m, idx) => ({
              id: m.installmentId ?? m.id,
              installmentNumber: m.installmentNumber ?? idx + 1,
              dueDate: m.nextDueDate ?? m.competenceDate ?? "",
              amountCents: m.totalAmountCents,
              status: m.status,
              receivedAt: m.paid ? m.nextDueDate : null,
              nfNumber: m.nfNumber,
              nfEmissionDate: m.nfEmissionDate,
              focusNfeRef: m.focusNfeRef,
              focusNfeStatus: m.focusNfeStatus,
              focusNfeError: m.focusNfeError,
              focusNfeUrl: m.focusNfeUrl,
              focusNfeDanfseUrl: m.focusNfeDanfseUrl,
              hasInternalDocument: Boolean(m.hasInternalDocument),
              billingDocumentType: m.billingDocumentType,
              receivableId: m.id,
            }));
      const groupedNf = groupInstallments.find((inst) => inst.nfNumber);
      const nextDue =
        groupInstallments
          .filter((inst) => inst.status !== "RECEBIDO" && inst.status !== "CANCELADO")
          .map((inst) => inst.dueDate)
          .sort()[0] ?? groupInstallments[0]?.dueDate ?? null;
      setDetail({
        ...base,
        description: body.description ?? row.description,
        totalAmountCents: body.totalAmountCents ?? row.totalAmountCents,
        totalAmountFormatted: body.totalAmountFormatted ?? row.totalAmountFormatted,
        status: body.status ?? base.status,
        paid: Boolean(body.paid),
        nfNumber: groupedNf?.nfNumber ?? null,
        nfEmissionDate: groupedNf?.nfEmissionDate ?? null,
        invoice: groupedNf
          ? {
              nfNumber: groupedNf.nfNumber ?? "",
              nfSeries: null,
              emissionDate: groupedNf.nfEmissionDate ?? "",
              grossAmountCents: body.totalAmountCents ?? 0,
              netAmountCents: body.totalAmountCents ?? 0,
              taxAmountCents: 0,
              retentionAmountCents: 0,
            }
          : null,
        nextDueDate: nextDue,
        installments: groupInstallments,
        groupMembers: members,
        isGroup: true,
        groupId: row.groupId,
      });
      if (firstId) {
        const attRes = await apiFetch(`/api/receivables/${firstId}/attachments`);
        const attBody = await attRes.json().catch(() => null);
        setAttachments(attRes.ok && Array.isArray(attBody) ? attBody : []);
      } else {
        setAttachments([]);
      }
      return;
    }
    await openDetail(row.id);
  }

  async function loadNfseAttempts(id: string) {
    setNfseAttemptsLoading(true);
    const r = await apiFetch(`/api/receivables/${id}/nfse-attempts`);
    const body = await r.json().catch(() => null);
    setNfseAttempts(r.ok && Array.isArray(body) ? body : []);
    setNfseAttemptsLoading(false);
  }

  async function openDetail(id: string, opts?: { keepTab?: boolean }) {
    setDetailId(id);
    if (!opts?.keepTab) {
      setDetailTab("valores");
      setHistory([]);
      setNfseAttempts([]);
    }
    setAttachments([]);
    setReceiveModal(null);
    const [detailRes, attRes] = await Promise.all([
      apiFetch(`/api/receivables/${id}`),
      apiFetch(`/api/receivables/${id}/attachments`),
    ]);
    const body = await detailRes.json().catch(() => null);
    const attBody = await attRes.json().catch(() => null);
    const d = detailRes.ok ? (body as ReceivableDetail) : null;
    setDetail(d);
    setAttachments(attRes.ok && Array.isArray(attBody) ? attBody : []);
    if (d) {
      applyDetailToListRows(d);
      // Garante lista alinhada ao banco (autorização Focus pode ter chegado via webhook).
      void refreshLists({ quiet: true });
    }
  }

  async function uploadAttachment(file: File, category: string) {
    const hostId = detail?.isGroup ? detail.groupMembers?.[0]?.id : detailId;
    if (!hostId) return;
    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
      reader.readAsDataURL(file);
    });
    const r = await apiFetch(`/api/receivables/${hostId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileData,
        fileType: file.type,
        fileSize: file.size,
        category,
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Erro no upload.");
      return;
    }
    if (detail?.isGroup) {
      const attRes = await apiFetch(`/api/receivables/${hostId}/attachments`);
      const attBody = await attRes.json().catch(() => null);
      setAttachments(attRes.ok && Array.isArray(attBody) ? attBody : []);
      return;
    }
    await openDetail(hostId);
  }

  async function downloadAttachment(att: AttachmentRow) {
    const hostId = detail?.isGroup ? detail.groupMembers?.[0]?.id : detailId;
    if (!hostId) return;
    const res = await apiFetchBlob(`/api/receivables/${hostId}/attachments/${att.id}/file`);
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
    const hostId = detail?.isGroup ? detail.groupMembers?.[0]?.id : detailId;
    if (!hostId || !window.confirm("Excluir este anexo?")) return;
    const r = await apiFetch(`/api/receivables/${hostId}/attachments/${attId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      setError("Erro ao excluir anexo.");
      return;
    }
    if (detail?.isGroup) {
      const attRes = await apiFetch(`/api/receivables/${hostId}/attachments`);
      const attBody = await attRes.json().catch(() => null);
      setAttachments(attRes.ok && Array.isArray(attBody) ? attBody : []);
      return;
    }
    await openDetail(hostId);
  }

  async function receiveInstallment() {
    if (!detailId || !receiveModal) return;
    const r = await apiFetch(`/api/receivables/${detailId}/installments/${receiveModal.installmentId}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receivedAt: receiveModal.receivedAt }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao registrar recebimento.");
      return;
    }
    setReceiveModal(null);
    await openDetail(detailId);
    await refreshLists();
  }

  async function saveReceivable() {
    setSaving(true);
    setFormError(null);
    if (!form.financialAccountId.trim()) {
      setFormError("Selecione a conta financeira (receita). Este campo é obrigatório.");
      setSaving(false);
      return;
    }
    if (!form.clientId.trim()) {
      setFormError("Selecione o cliente. Este campo é obrigatório.");
      setSaving(false);
      return;
    }
    if (!form.description.trim()) {
      setFormError("Informe a descrição. Este campo é obrigatório.");
      setSaving(false);
      return;
    }
    const amountCents = moedaParaCentavos(form.amount);
    if (amountCents == null || amountCents <= 0) {
      setFormError("Informe um valor válido maior que zero.");
      setSaving(false);
      return;
    }
    // Rateio interno: CR não exibe centro de custo na modal; usa o já vinculado (edição)
    // ou Administrativo / primeiro centro ativo.
    const defaultCostCenterId =
      form.costCenterId.trim() ||
      costCenters.find((c) => c.name.trim().toLowerCase() === "administrativo")?.id ||
      costCenters[0]?.id ||
      "";
    if (!defaultCostCenterId) {
      setFormError("Nenhum centro de custo ativo no sistema. Cadastre um em Configurações.");
      setSaving(false);
      return;
    }
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      clientId: form.clientId,
      financialAccountId: form.financialAccountId,
      amount: form.amount,
      competenceDate: form.competenceDate || null,
      dueDate: form.dueDate,
      projectId: form.projectId || null,
      paymentMethod: form.paymentMethod || null,
      allocations: [
        {
          costCenterId: defaultCostCenterId,
          projectId: form.projectId || null,
          percentBps: 10000,
        },
      ],
    };
    if (editingId && editingInstallmentId) {
      payload.installmentId = editingInstallmentId;
      payload.installmentAmountCents = amountCents;
    } else {
      payload.totalAmountCents = amountCents;
      payload.installmentCount = Number(form.installmentCount) || 1;
    }
    const r = await apiFetch(editingId ? `/api/receivables/${editingId}` : "/api/receivables", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setFormError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    setModalOpen(false);
    setEditingId(null);
    setEditingInstallmentId(null);
    setFormError(null);
    await refreshLists();
  }

  function openCreateModal() {
    setEditingId(null);
    setEditingInstallmentId(null);
    setCancelConfirmOpen(false);
    setFormError(null);
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
      paymentMethod: "",
    });
    setModalOpen(true);
  }

  async function openEditReceivable(row: ReceivableRow) {
    setError(null);
    const r = await apiFetch(`/api/receivables/${row.id}`);
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar conta.");
      return;
    }
    const d = body as ReceivableDetail & {
      clientId?: string;
      client?: { id?: string; name?: string } | null;
      financialAccountId?: string;
      allocations?: { costCenterId: string; projectId?: string | null }[];
      installments?: { id: string; dueDate: string; amountCents: number }[];
    };
    const projectId = row.projectId ?? d.projectId ?? d.allocations?.[0]?.projectId ?? "";
    const clientId =
      row.clientId ||
      d.clientId ||
      d.client?.id ||
      (projectId ? projects.find((p) => p.id === projectId)?.clientId : null) ||
      "";
    const clientName = row.clientName || d.clientName || d.client?.name || "";
    if (clientId && clientName) {
      setClients((prev) => (prev.some((c) => c.id === clientId) ? prev : [...prev, { id: clientId, name: clientName }]));
    }

    const installmentCount = d.installmentCount || row.installmentCount || 1;
    const installmentId = row.installmentId ?? row.nextInstallmentId ?? null;
    const scopedInstallment =
      installmentId && installmentCount > 1
        ? d.installments?.find((i) => i.id === installmentId)
        : null;
    const editInstallmentId = scopedInstallment?.id ?? (installmentCount > 1 ? installmentId : null);

    const descriptionFromList = (row.activityDescription || row.description || "").trim();
    const amountCents = scopedInstallment
      ? scopedInstallment.amountCents
      : row.totalAmountCents > 0
        ? row.totalAmountCents
        : (d.totalAmountCents ?? 0);
    const dueDate =
      scopedInstallment?.dueDate?.slice(0, 10) ||
      row.nextDueDate ||
      d.nextDueDate ||
      new Date().toISOString().slice(0, 10);

    setEditingId(row.id);
    setEditingInstallmentId(editInstallmentId);
    setFormError(null);
    setForm({
      description: descriptionFromList || d.description || "",
      clientId: clientId || "",
      financialAccountId: row.financialAccountId || d.financialAccountId || "",
      amount: String(amountCents / 100),
      competenceDate: row.competenceDate ?? d.competenceDate ?? "",
      dueDate,
      installmentCount: String(installmentCount),
      costCenterId: d.allocations?.[0]?.costCenterId ?? "",
      projectId,
      paymentMethod: row.paymentMethod ?? d.paymentMethod ?? "",
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
    setEditingInstallmentId(null);
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
    }
    await refreshLists();
  }

  async function openEmitInvoiceConfirm(row: ReceivableRow) {
    if (emittingInvoiceId || markingReceivedId || bulkMarkingReceived) return;
    const focusAllowsRetry =
      row.focusNfeStatus === "erro_autorizacao" || row.focusNfeStatus === "cancelado";
    if (!focusAllowsRetry && (row.nfNumber || row.status === "RECEBIDO" || row.paid)) {
      setError("Nota já emitida");
      return;
    }
    if (row.focusNfeStatus === "processando_autorizacao") {
      setError("Emissão já em processamento na Focus NFe. Aguarde ou atualize o status.");
      return;
    }
    if (row.status === "CANCELADO") {
      setError("Conta cancelada.");
      return;
    }
    setEmitConfirmRow(row);
    setEmitPreview(null);
    setEmitIssCode("");
    setEmitDescricaoServico("");
    setEmitPreviewLoading(true);
    setEmitModalError(null);
    setError(null);
    try {
      const r = await apiFetch(`/api/receivables/${row.id}/emit-invoice/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: row.installmentId ?? row.nextInstallmentId ?? undefined,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        // Mantém a modal aberta para o usuário ler o motivo (ex.: Simples Nacional).
        setEmitPreview(null);
        setEmitModalError(
          typeof body?.error === "string"
            ? body.error
            : "Não foi possível montar a prévia da NF.",
        );
        return;
      }
      setEmitPreview(body);
      const options = Array.isArray(body?.codigosTributacaoIssOptions)
        ? body.codigosTributacaoIssOptions
        : [];
      setEmitIssCode(
        String(body?.codigoTributacaoNacionalIss ?? options[0] ?? "").trim(),
      );
      setEmitDescricaoServico(
        String(body?.descricaoServico ?? body?.description ?? "").trim(),
      );
    } finally {
      setEmitPreviewLoading(false);
    }
  }

  async function confirmEmitInvoice() {
    const row = emitConfirmRow;
    if (!row) return;
    const markKey = row.listRowId ?? row.id;
    setEmittingInvoiceId(markKey);
    setEmitModalError(null);
    setError(null);
    try {
      // Garante só o código (ex.: "010601"), sem rótulo do select.
      const issCode = emitIssCode.split(/\s*[—–]\s*/)[0]?.trim() || emitIssCode.trim();
      const emitUrl =
        row.isGroup && row.groupId
          ? `/api/receivables/groups/${row.groupId}/emit-invoice`
          : `/api/receivables/${row.id}/emit-invoice`;
      const r = await apiFetch(emitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          installmentId: row.installmentId ?? row.nextInstallmentId ?? undefined,
          codigoTributacaoNacionalIss: issCode || undefined,
          descricaoServico: emitDescricaoServico.trim() || undefined,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const raw =
          typeof body?.error === "string"
            ? body.error
            : typeof body?.message === "string"
              ? body.message
              : "Erro ao emitir nota.";
        const msg = raw.includes("já") ? "Nota já emitida" : raw;
        setEmitModalError(msg);
        setError(msg);
        return;
      }
      setEmitConfirmRow(null);
      setEmitPreview(null);
      setEmitModalError(null);
      if (
        body?.provider === "INTERNAL" &&
        (body?.documentType === "INVOICE" || body?.documentType === "NOTA_DEBITO")
      ) {
        await openInternalInvoice(row);
      }
      if (body?.provider === "FOCUS_NFE" && body?.focusNfeStatus === "processando_autorizacao") {
        setError(null);
        // Mantém feedback positivo via refresh; status processando aparece na lista.
      }
      if (body?.focusNfeError) {
        setError(String(body.focusNfeError));
      }
      await refreshLists({ quiet: true });
      if (detailId === row.id) await openDetail(row.id);

      const installmentId = row.installmentId ?? row.nextInstallmentId;
      const needsFocusPoll =
        body?.provider === "FOCUS_NFE" &&
        (body?.focusNfeStatus === "processando_autorizacao" ||
          body?.focusNfeStatus === "autorizado") &&
        !!installmentId;

      // Autorização Focus costuma chegar assíncrona (webhook) — acompanha até estabilizar.
      if (needsFocusPoll && body?.focusNfeStatus === "processando_autorizacao") {
        for (let i = 0; i < 15; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const sync = await apiFetch(`/api/receivables/${row.id}/sync-focus-invoice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installmentId }),
          });
          const syncBody = await sync.json().catch(() => null);
          if (sync.ok && syncBody?.focusNfeStatus && syncBody.focusNfeStatus !== "processando_autorizacao") {
            if (syncBody.focusNfeError) setError(String(syncBody.focusNfeError));
            await refreshLists({ quiet: true });
            if (detailId === row.id) await openDetail(row.id, { keepTab: true });
            break;
          }
        }
        // Última varredura da lista mesmo se ainda processando (webhook pode ter atualizado).
        await refreshLists({ quiet: true });
      } else if (needsFocusPoll) {
        await refreshLists({ quiet: true });
        if (detailId === row.id) await openDetail(row.id, { keepTab: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao emitir nota.";
      setEmitModalError(msg);
      setError(msg);
    } finally {
      setEmittingInvoiceId(null);
    }
  }

  async function emitInvoice(row: ReceivableRow) {
    void openEmitInvoiceConfirm(row);
  }

  async function openInternalInvoice(row: Pick<ReceivableRow, "id" | "installmentId" | "nextInstallmentId">) {
    const installmentId = row.installmentId ?? row.nextInstallmentId;
    const qs = installmentId ? `?installmentId=${encodeURIComponent(installmentId)}` : "";
    const r = await apiFetch(`/api/receivables/${row.id}/internal-invoice${qs}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Não foi possível abrir o documento.");
      return;
    }
    if (typeof body?.html === "string") openHtmlDocument(body.html);
  }

  async function confirmCancelFocusInvoice() {
    const row = cancelFocusRow;
    if (!row) return;
    const installmentId = row.installmentId ?? row.nextInstallmentId;
    if (!installmentId) {
      setError("Parcela não encontrada para cancelar a NFSe.");
      return;
    }
    const justificativa = cancelFocusJustificativa.trim();
    if (justificativa.length < 15) {
      setError("Informe uma justificativa com ao menos 15 caracteres.");
      return;
    }
    const markKey = row.listRowId ?? row.id;
    setCancellingFocusId(markKey);
    setError(null);
    try {
      const r = await apiFetch(`/api/receivables/${row.id}/cancel-focus-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installmentId, justificativa }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar NFSe na Focus.");
        return;
      }
      setCancelFocusRow(null);
      setCancelFocusJustificativa("");
      await refreshLists();
      if (detail?.isGroup && detail.groupId) {
        await openRowDetail({ ...detail, isGroup: true, groupId: detail.groupId });
      } else if (detailId === row.id) {
        await openDetail(row.id, { keepTab: true });
        if (detailTab === "nfse") await loadNfseAttempts(row.id);
      }
    } finally {
      setCancellingFocusId(null);
    }
  }

  function openCancelFocusFromInstallment(inst: ReceivableDetail["installments"][number]) {
    if (!detail) return;
    setCancelFocusRow({
      ...detail,
      installmentId: inst.id,
      nfNumber: inst.nfNumber ?? detail.nfNumber,
      totalAmountFormatted: formatarMoeda(inst.amountCents / 100),
      focusNfeRef: inst.focusNfeRef,
      focusNfeStatus: inst.focusNfeStatus,
    });
    setCancelFocusJustificativa("Cancelamento solicitado pelo emitente");
    setError(null);
  }

  async function cancelInternalDocument(opts: {
    receivableId: string;
    installmentId: string;
    documentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null;
    isGroup?: boolean;
    groupId?: string | null;
    reloadReceivableId?: string | null;
  }) {
    const docLabel =
      opts.documentType === "INVOICE"
        ? "invoice"
        : opts.documentType === "NOTA_DEBITO"
          ? "nota de débito"
          : "documento";
    if (
      !window.confirm(
        `Cancelar a ${docLabel}? A parcela volta para Previsto.` +
          (opts.isGroup ? " No grupo, o documento é cancelado em todas as parcelas agrupadas." : ""),
      )
    ) {
      return;
    }
    const r = await apiFetch(`/api/receivables/${opts.receivableId}/cancel-internal-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installmentId: opts.installmentId }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao cancelar o documento.");
      return;
    }
    await refreshLists();
    if (opts.isGroup && opts.groupId) {
      await openRowDetail({
        id: opts.receivableId,
        groupId: opts.groupId,
        isGroup: true,
        description: "Grupo",
      } as ReceivableRow);
      return;
    }
    if (opts.reloadReceivableId) {
      await openDetail(opts.reloadReceivableId, { keepTab: true });
    }
  }

  async function markAsReceived(row: ReceivableRow) {
    const markKey = row.listRowId ?? row.id;
    if (markingReceivedId || bulkMarkingReceived) return;
    const isFaturado = row.status === "FATURADO" || !!row.nfNumber;
    if (!isFaturado) {
      setError("Só é possível marcar como pago após emitir a nota (status Faturado).");
      return;
    }
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
      await refreshLists();
      if (detailId === row.id) await openDetail(row.id);
    } finally {
      setMarkingReceivedId(null);
    }
  }

  async function markAllFilteredAsReceived() {
    if (filteredUnreceivedRows.length === 0 || bulkMarkingReceived) return;
    const count = filteredUnreceivedRows.length;
    const totalCents = filteredUnreceivedRows.reduce((s, r) => s + (r.totalAmountCents ?? 0), 0);
    const scopeLabel = hasActiveFilters ? "filtrada(s)" : "da lista";
    if (
      !window.confirm(
        `Marcar ${count} parcela(s) ${scopeLabel} como recebida(s)?\n\nTotal: ${formatarMoeda(totalCents / 100)}`,
      )
    ) {
      return;
    }
    setBulkMarkingReceived(true);
    setError(null);
    const receivedAt = new Date().toISOString().slice(0, 10);
    let ok = 0;
    let fail = 0;
    try {
      for (const row of filteredUnreceivedRows) {
        const installmentId = row.installmentId ?? row.nextInstallmentId ?? null;
        const r = installmentId
          ? await apiFetch(`/api/receivables/${row.id}/installments/${installmentId}/receive`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receivedAt }),
            })
          : await apiFetch(`/api/receivables/${row.id}/mark-received`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receivedAt }),
            });
        if (r.ok) ok += 1;
        else fail += 1;
      }
      await refreshLists();
      if (fail > 0) {
        setError(`Marcação em lote: ${ok} recebida(s), ${fail} com erro.`);
      }
    } finally {
      setBulkMarkingReceived(false);
    }
  }

  async function unmarkAsReceived(row: ReceivableRow) {
    const markKey = row.listRowId ?? row.id;
    if (markingReceivedId || bulkMarkingReceived) return;
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
      await refreshLists();
      if (detailId === row.id) await openDetail(row.id);
    } finally {
      setMarkingReceivedId(null);
    }
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
    await refreshLists();
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
    <div className={financeListPageShellClass}>
      <FinancePageHeader
        title="Contas a receber"
        subtitle="Faturamento e reembolsos a cobrar — acompanhe NF, previsão de pagamento e status."
        chip="Entradas"
        tone="default"
        actions={
          <>
            <button
              type="button"
              disabled={sendingAlerts}
              onClick={() => void sendAlerts()}
              className={financeSecondaryBtnClass}
              style={{ borderColor: "var(--border)" }}
            >
              {sendingAlerts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Enviar alertas
            </button>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className={financePrimaryBtnClass}
              style={financePrimaryBtnStyle}
            >
              <Plus className="h-4 w-4" /> Nova conta
            </button>
          </>
        }
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {aging && (
        <FinanceAgingSummaryCard
          tone="inflow"
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
              id="receivables-filter-month"
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
              id="receivables-filter-year"
              value={filterYear}
              onChange={(v) => setFilterYear(v)}
              placeholder="Todos"
              checklist={false}
              options={[
                { value: "", label: "Todos" },
                ...yearOptions.map((y) => ({ value: String(y), label: String(y) })),
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Data de</label>
            <DatePicker
              id="receivables-filter-date-from"
              buttonClassName={inputClass}
              value={filterDateFrom}
              onChange={setFilterDateFrom}
              title="Data a partir de"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Data até</label>
            <DatePicker
              id="receivables-filter-date-to"
              buttonClassName={inputClass}
              value={filterDateTo}
              onChange={setFilterDateTo}
              title="Data até"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Cliente</label>
            <PopoverSelect
              id="receivables-filter-client"
              value={filterClientId}
              onChange={(v) => setFilterClientId(v)}
              placeholder="Todos"
              checklist={false}
                  options={[
                    { value: "", label: "Todos" },
                    ...clientSelectOptions.map((c) => ({ value: c.id, label: c.name })),
                  ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Projeto</label>
            <input
              type="search"
              className={inputClass}
              value={filterProjectQ}
              onChange={(e) => setFilterProjectQ(e.target.value)}
              placeholder="Digite o nome..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Contrato</label>
            <input
              type="search"
              className={inputClass}
              value={filterContractQ}
              onChange={(e) => setFilterContractQ(e.target.value)}
              placeholder="Ex.: 58/2025"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Pago?</label>
            <PopoverSelect
              id="receivables-filter-paid"
              value={filterPaid}
              onChange={(v) => setFilterPaid(v)}
              placeholder="Todos"
              checklist={false}
              options={[
                { value: "", label: "Todos" },
                { value: "1", label: "Pago" },
                { value: "0", label: "Não pago" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Status</label>
            <PopoverSelect
              id="receivables-filter-status"
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              placeholder="Todos os status"
              checklist={false}
              options={[
                { value: "", label: "Todos os status" },
                { value: "PREVISTO", label: "Previsto" },
                { value: "FATURADO", label: "Faturado" },
                { value: "RECEBIDO", label: "Recebido" },
                { value: "CANCELADO", label: "Cancelado" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Conta financeira
            </label>
            <PopoverSelect
              id="receivables-filter-financial-account"
              value={filterFinancialAccountId}
              onChange={(v) => setFilterFinancialAccountId(v)}
              placeholder="Todas"
              checklist={false}
              options={[
                { value: "", label: "Todas" },
                ...accounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">Documento</label>
            <PopoverSelect
              id="receivables-filter-document"
              value={filterDocumentType}
              onChange={(v) => setFilterDocumentType(v)}
              placeholder="Todos"
              checklist={false}
              options={[
                { value: "", label: "Todos" },
                { value: "NOTA_FISCAL", label: "Nota fiscal" },
                { value: "INVOICE", label: "Invoice" },
                { value: "NOTA_DEBITO", label: "Nota de débito" },
              ]}
            />
          </div>
        </div>
      </FinanceCollapsibleFilters>

      <FinancePageSizeSelect
        id="receivables-page-size"
        value={listLimit}
        disabled={loading}
        onChange={setListLimit}
      />

      {loading ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Nenhuma conta a receber.</p>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-sm">
              <span className="text-[color:var(--muted-foreground)]">
                {hasActiveFilters ? "Total filtrado" : "Total"}
                {` (${listTotal > 0 ? listTotal : filteredRows.length} parcela${
                  (listTotal > 0 ? listTotal : filteredRows.length) === 1 ? "" : "s"
                }): `}
              </span>
              <span className="font-semibold tabular-nums">
                {formatarMoeda(filteredTotalCents / 100)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {selectedRowKeys.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setGroupDescription("");
                  setGroupModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
                style={{ borderColor: "var(--border)" }}
              >
                Agrupar {selectedRowKeys.length} contas
              </button>
            )}
            {filteredUnreceivedRows.length > 0 && (
              <button
                type="button"
                disabled={bulkMarkingReceived}
                onClick={() => void markAllFilteredAsReceived()}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {bulkMarkingReceived ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Marcar {filteredUnreceivedRows.length} como recebida
                {filteredUnreceivedRows.length === 1 ? "" : "s"}
              </button>
            )}
            </div>
          </div>
        <div className={financeListTableWrapClass} style={{ borderColor: "var(--border)" }}>
          <table className="w-full table-fixed border-collapse overflow-hidden text-[11px] leading-tight sm:text-xs">
            <colgroup>
              <col className="w-[2.25rem]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[9%]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[3rem]" />
              <col className="w-[6rem]" />
              <col className="w-[4.5rem]" />
            </colgroup>
            <thead className={financeListTheadClass} style={financeListTheadStyle}>
              <tr>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[color:var(--primary)]"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Selecionar todas as linhas filtradas"
                  />
                </th>
                <th className="px-2 py-2.5 text-left whitespace-nowrap">Cliente</th>
                <th className="px-2 py-2.5 text-left whitespace-nowrap">Projeto</th>
                <th className="px-2 py-2.5 text-left whitespace-nowrap">Atividade/Descrição</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Contrato</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Data</th>
                <th className="px-2 py-2.5 text-right whitespace-nowrap">Valor</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Dt Emissão NF</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Nro NF</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Prev pagamento</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Pago?</th>
                <th className="px-2 py-2.5 text-left whitespace-nowrap">Status</th>
                <th className="px-2 py-2.5 text-center whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowKey = row.listRowId ?? row.id;
                const isPaid = row.paid || row.status === "RECEBIDO";
                const isFaturado = row.status === "FATURADO" || !!row.nfNumber;
                // Marcar pago: só com Faturado. Desmarcar: permitido se já Recebido.
                const canMarkReceived = isFaturado && !isPaid;
                const canUnmarkReceived = isPaid;
                const canToggleReceived = canMarkReceived || canUnmarkReceived;
                const focusAllowsRetry =
                  row.focusNfeStatus === "erro_autorizacao" ||
                  row.focusNfeStatus === "cancelado";
                const alreadyEmitted =
                  (!focusAllowsRetry && !!row.nfNumber) ||
                  row.status === "RECEBIDO" ||
                  isPaid ||
                  row.focusNfeStatus === "processando_autorizacao";
                const canShowEmitInvoice = row.status !== "CANCELADO";
                const noDocument = row.billingDocumentType === null;
                const emitTitle =
                  row.focusNfeStatus === "processando_autorizacao"
                    ? "NFSe em processamento na Focus"
                    : row.focusNfeStatus === "erro_autorizacao"
                      ? `Erro Focus — clique para tentar de novo: ${row.focusNfeError || "falha na autorização"}`
                      : row.focusNfeStatus === "cancelado" && !row.nfNumber
                        ? `${billingDocumentEmitTitle(row)} (NFSe cancelada)`
                      : alreadyEmitted
                        ? "Nota já emitida"
                        : noDocument
                          ? row.billingDocumentBlockedReason || "Sem documento para emitir"
                          : billingDocumentEmitTitle(row);
                const emitDisabled =
                  alreadyEmitted ||
                  noDocument ||
                  emittingInvoiceId === rowKey ||
                  markingReceivedId === rowKey ||
                  bulkMarkingReceived;
                const projectLabel = row.projectName;
                const activityLabel = row.activityDescription || row.description;
                return (
                  <tr
                    key={rowKey}
                    className="border-t cursor-pointer hover:bg-black/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                    title={
                      row.incomplete
                        ? "Dados incompletos: falta NF e/ou data de emissão"
                        : undefined
                    }
                    onClick={() => void openRowDetail(row)}
                  >
                    <td
                      className="px-2 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {receivableSelectionKey(row) ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[color:var(--primary)]"
                          checked={selectedRowKeys.includes(receivableSelectionKey(row)!)}
                          onChange={(e) => {
                            const key = receivableSelectionKey(row)!;
                            setSelectedRowKeys((prev) =>
                              e.target.checked ? [...prev, key] : prev.filter((id) => id !== key),
                            );
                          }}
                          aria-label="Selecionar conta"
                        />
                      ) : (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-600/15 text-violet-700"
                          title="Grupo"
                        >
                          <Layers className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Grupo</span>
                        </span>
                      )}
                    </td>
                    <td className="overflow-hidden px-2 py-2 font-medium">
                      <span className="block truncate" title={row.clientName || undefined}>
                        {dash(row.clientName)}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2">
                      <span className="block truncate" title={projectLabel || undefined}>
                        {dash(projectLabel)}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2">
                      <span className="block truncate" title={activityLabel || undefined}>
                        {dash(activityLabel)}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-center">
                      <span className="block truncate" title={row.contractTitle || undefined}>
                        {dash(row.contractTitle)}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-center tabular-nums">
                      <span className="block truncate">{formatarData(row.competenceDate)}</span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-right tabular-nums">
                      <span className="block truncate">
                        {row.totalAmountCents <= 0 ? "—" : row.totalAmountFormatted}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-center tabular-nums">
                      <span className="block truncate">{formatarData(row.nfEmissionDate)}</span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-center">
                      <span className="block truncate" title={row.nfNumber || undefined}>
                        {dash(row.nfNumber)}
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-2 text-center tabular-nums">
                      <span className="block truncate">{formatarData(row.nextDueDate)}</span>
                    </td>
                    <td
                      className="px-2 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[color:var(--primary)] cursor-pointer disabled:cursor-not-allowed"
                        checked={isPaid}
                        disabled={!canToggleReceived || markingReceivedId === rowKey || bulkMarkingReceived}
                        title={
                          isPaid
                            ? "Desmarcar recebimento"
                            : canMarkReceived
                              ? "Marcar como recebido"
                              : "Emita a nota antes de marcar como pago"
                        }
                        aria-label={isPaid ? "Desmarcar recebimento" : "Marcar como recebido"}
                        onChange={(e) => {
                          if (e.target.checked) void markAsReceived(row);
                          else void unmarkAsReceived(row);
                        }}
                      />
                    </td>
                    <td className="overflow-hidden px-2 py-2">
                      <div className="min-w-0 overflow-hidden">
                        <StatusBadge status={row.status} nfNumber={row.nfNumber} paid={isPaid} />
                      </div>
                    </td>
                    <td
                      className="px-2 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-center gap-0.5">
                        {!row.isGroup && (
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                          title="Editar"
                          aria-label="Editar"
                          onClick={() => void openEditReceivable(row)}
                        >
                          <Pencil className="h-4 w-4 text-[color:var(--muted-foreground)]" />
                        </button>
                        )}
                        {row.hasInternalDocument && (
                          <button
                            type="button"
                            className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                            title={internalDocumentViewTitle(row.billingDocumentType)}
                            aria-label={internalDocumentViewTitle(row.billingDocumentType)}
                            onClick={() => void openInternalInvoice(row)}
                          >
                            <Eye className="h-4 w-4 text-[color:var(--primary)]" />
                          </button>
                        )}
                        {canShowEmitInvoice && (
                          <button
                            type="button"
                            className={`inline-flex rounded-md p-1.5 hover:bg-black/5 disabled:opacity-50 ${
                              alreadyEmitted || noDocument ? "opacity-60" : ""
                            }`}
                            title={emitTitle}
                            aria-label={emitTitle}
                            disabled={emitDisabled}
                            onClick={() => void emitInvoice(row)}
                          >
                            {emittingInvoiceId === rowKey ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--primary)]" />
                            ) : (
                              <FileText
                                className={`h-4 w-4 ${
                                  alreadyEmitted || noDocument
                                    ? "text-[color:var(--muted-foreground)]"
                                    : "text-[color:var(--primary)]"
                                }`}
                              />
                            )}
                          </button>
                        )}
                        {row.hasInternalDocument &&
                          row.status !== "RECEBIDO" &&
                          row.status !== "CANCELADO" && (
                          <button
                            type="button"
                            className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                            title="Cancelar documento"
                            aria-label="Cancelar documento"
                            onClick={() =>
                              void cancelInternalDocument({
                                receivableId: row.id,
                                installmentId: row.installmentId ?? row.nextInstallmentId ?? "",
                                documentType: row.billingDocumentType,
                                isGroup: Boolean(row.isGroup),
                                groupId: row.groupId,
                              })
                            }
                          >
                            <Ban className="h-4 w-4 text-red-600" />
                          </button>
                        )}
                      </div>
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
                onClick={() => void refreshLists({ offset: Math.max(0, listOffset - listLimit) })}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={listOffset + listLimit >= listTotal || loading}
                className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                onClick={() => void refreshLists({ offset: listOffset + listLimit })}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setModalOpen(false);
            setEditingId(null);
            setEditingInstallmentId(null);
            setCancelConfirmOpen(false);
            setFormError(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h3 className="font-semibold">
                {editingId
                  ? editingInstallmentId
                    ? "Editar parcela"
                    : "Editar conta a receber"
                  : "Nova conta a receber"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingId(null);
                  setEditingInstallmentId(null);
                  setCancelConfirmOpen(false);
                  setFormError(null);
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
                <PopoverSelect
                  id="receivable-form-client"
                  value={form.clientId}
                  onChange={(v) => setForm((f) => ({ ...f, clientId: v, projectId: "" }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...clientSelectOptions.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Projeto</label>
                <PopoverSelect
                  id="receivable-form-project"
                  value={form.projectId}
                  disabled={!form.clientId}
                  onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                  placeholder={
                    !form.clientId
                      ? "Selecione o cliente primeiro"
                      : projectsForClient.length === 0
                        ? "Nenhum projeto deste cliente"
                        : "—"
                  }
                  options={[
                    { value: "", label: "—" },
                    ...projectsForClient.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Conta financeira (receita) *</label>
                <PopoverSelect
                  id="receivable-form-financial-account"
                  value={form.financialAccountId}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, financialAccountId: v }));
                    if (formError) setFormError(null);
                  }}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...accounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>
                    {editingInstallmentId ? "Valor da parcela (R$)" : "Valor (R$)"}
                  </label>
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
                  <input
                    type="number"
                    min={1}
                    className={formModalInputClass()}
                    value={form.installmentCount}
                    disabled={!!editingId}
                    onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={formModalLabelClass}>Competência</label>
                  <input type="date" className={formModalInputClass()} value={form.competenceDate} onChange={(e) => setForm((f) => ({ ...f, competenceDate: e.target.value }))} />
                  {editingInstallmentId ? (
                    <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                      Altera a Data desta parcela na lista e na NFS-e.
                    </p>
                  ) : Number(form.installmentCount) > 1 ? (
                    <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                      Competência da conta — aplica a todas as parcelas.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={formModalLabelClass}>
                    {editingInstallmentId ? "Vencimento" : "1º vencimento"}
                  </label>
                  <input type="date" className={formModalInputClass()} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={formModalLabelClass}>Forma de pagamento</label>
                <PopoverSelect
                  id="receivable-form-payment-method"
                  value={form.paymentMethod}
                  onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...RECEIVABLE_PAYMENT_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                />
              </div>
            </div>
            {formError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
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
                    setEditingInstallmentId(null);
                    setCancelConfirmOpen(false);
                    setFormError(null);
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

      {emitConfirmRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">
                {emitPreview?.documentLabel || emitConfirmRow.billingDocumentLabel
                  ? `Confirmar emissão — ${emitPreview?.documentLabel || emitConfirmRow.billingDocumentLabel}`
                  : "Confirmar emissão"}
              </h3>
              <button
                type="button"
                disabled={!!emittingInvoiceId}
                onClick={() => {
                  setEmitConfirmRow(null);
                  setEmitPreview(null);
                  setEmitModalError(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {emitPreviewLoading ? (
              <div className="mt-6 flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
              </div>
            ) : emitPreview ? (
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Documento:</span>{" "}
                  {emitPreview.documentLabel || "—"}
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Emissão:</span>{" "}
                  {billingDocumentProviderLabel(emitPreview.provider, emitPreview.documentLabel)}
                </p>
                {emitPreview.contractCurrency && (
                  <p>
                    <span className="text-[color:var(--muted-foreground)]">Moeda do contrato:</span>{" "}
                    {emitPreview.contractCurrency}
                  </p>
                )}
                {emitPreview.environment && (
                  <p>
                    <span className="text-[color:var(--muted-foreground)]">Ambiente:</span>{" "}
                    {emitPreview.environment === "PRODUCAO" ? "Produção" : "Homologação"}
                  </p>
                )}
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Cliente:</span>{" "}
                  {emitPreview.clientName}
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Tomador:</span>{" "}
                  {emitPreview.tomadorRazaoSocial} ({emitPreview.tomadorDocumento})
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Serviço:</span>{" "}
                  {emitPreview.description}
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Valor:</span>{" "}
                  {emitPreview.amountFormatted}
                </p>
                <p>
                  <span className="text-[color:var(--muted-foreground)]">Competência:</span>{" "}
                  {dash(emitPreview.competenceDate)}
                </p>
                {emitPreview.provider === "FOCUS_NFE" && (
                  <div>
                    <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                      Código ISS *
                    </label>
                    {(emitPreview.codigosTributacaoIssOptions?.length ?? 0) > 0 ? (
                      <select
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                        value={emitIssCode}
                        onChange={(e) => setEmitIssCode(e.target.value)}
                        disabled={!!emittingInvoiceId}
                      >
                        {(emitPreview.codigosTributacaoIssOptions ?? []).map((code) => (
                          <option key={code} value={code}>
                            {code}
                            {code === "010601"
                              ? " — Consultoria em informática"
                              : code === "170202"
                                ? " — Apoio/administração (17.02)"
                                : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                        value={emitIssCode}
                        onChange={(e) => setEmitIssCode(e.target.value)}
                        disabled={!!emittingInvoiceId}
                        placeholder="Ex.: 010601"
                      />
                    )}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Descrição *
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
                    rows={4}
                    maxLength={2000}
                    value={emitDescricaoServico}
                    onChange={(e) => setEmitDescricaoServico(e.target.value)}
                    disabled={!!emittingInvoiceId}
                    placeholder={
                      emitPreview.documentType === "INVOICE"
                        ? "Description that will appear on the invoice"
                        : emitPreview.documentType === "NOTA_DEBITO"
                          ? "Texto referente à nota de débito"
                          : "Descrição do serviço que constará na NFS-e"
                    }
                  />
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    {emitPreview.documentType === "INVOICE"
                      ? "Vai no campo Notes da invoice."
                      : emitPreview.documentType === "NOTA_DEBITO"
                        ? "Vai no campo Referente a da nota de débito."
                        : "Vai na nota. Se houver descrição padrão na Focus NFe, ela já vem preenchida para você completar."}
                  </p>
                </div>
                {emitPreview.provider === "FOCUS_NFE" && emitPreview.observacao?.trim() && (
                  <div>
                    <p className="mb-1 text-xs text-[color:var(--muted-foreground)]">Observação</p>
                    <p className="whitespace-pre-wrap rounded-lg border bg-[color:var(--background)] px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      {emitPreview.observacao}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      Cadastro do cliente (Dados de faturamento). Vai na nota junto com a descrição.
                    </p>
                  </div>
                )}
                {emitPreview.debitNotePreview && (
                  <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Emitente:</span>{" "}
                      {emitPreview.debitNotePreview.issuerName}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Destinatário:</span>{" "}
                      {emitPreview.debitNotePreview.recipientName}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Referente a:</span>{" "}
                      {emitPreview.debitNotePreview.referenteA}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Valor:</span>{" "}
                      {emitPreview.debitNotePreview.amountFormatted}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Por extenso:</span>{" "}
                      {emitPreview.debitNotePreview.amountInWords}
                    </p>
                  </div>
                )}
                {emitPreview.invoicePreview && (
                  <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Emitente:</span>{" "}
                      {emitPreview.invoicePreview.issuerName}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Bill to:</span>{" "}
                      {emitPreview.invoicePreview.billToName}
                    </p>
                    <p>
                      <span className="text-[color:var(--muted-foreground)]">Project:</span>{" "}
                      {dash(emitPreview.invoicePreview.project)}
                    </p>
                    {emitPreview.invoicePreview.services.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {emitPreview.invoicePreview.services.map((line, idx) => (
                          <li key={`${line.consultant}-${idx}`}>
                            {line.consultant}
                            {line.activity ? ` — ${line.activity}` : ""}
                            {line.hours != null ? ` · ${line.hours}h` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {emitPreview.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-700">
                    {emitPreview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <p className="pt-2 text-xs text-[color:var(--muted-foreground)]">
                  {emitPreview.canEmitNow === false
                    ? emitPreview.blockedReason ||
                      "A emissão deste documento interno será liberada quando o modelo estiver pronto."
                    : emitPreview.documentType === "INVOICE"
                      ? "A invoice será gerada internamente (não usa a Focus). Confirme para emitir."
                      : emitPreview.documentType === "NOTA_DEBITO"
                        ? "A nota de débito será gerada internamente (não usa a Focus). Confirme para emitir."
                        : "Confirme apenas se os dados estiverem corretos."}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">
                {emitModalError
                  ? "Corrija a configuração abaixo e tente novamente."
                  : "Não foi possível carregar a prévia."}
              </p>
            )}
            {emitModalError && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {emitModalError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={!!emittingInvoiceId}
                onClick={() => {
                  setEmitConfirmRow(null);
                  setEmitPreview(null);
                  setEmitModalError(null);
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !!emittingInvoiceId ||
                  emitPreviewLoading ||
                  !emitPreview ||
                  emitPreview.canEmitNow === false ||
                  !emitDescricaoServico.trim() ||
                  (emitPreview.provider === "FOCUS_NFE" && !emitIssCode.trim())
                }
                onClick={() => void confirmEmitInvoice()}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {emittingInvoiceId && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar emissão
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelFocusRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[color:var(--surface)] p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">Cancelar NFSe na Focus</h3>
              <button
                type="button"
                disabled={!!cancellingFocusId}
                onClick={() => {
                  setCancelFocusRow(null);
                  setCancelFocusJustificativa("");
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
              Cliente: {cancelFocusRow.clientName} · NF {dash(cancelFocusRow.nfNumber)} · valor{" "}
              {cancelFocusRow.totalAmountFormatted}
            </p>
            <p className="mt-2 text-xs text-amber-700">
              O cancelamento é definitivo na Focus e não pode ser desfeito.
            </p>
            <label className="mt-4 block text-xs text-[color:var(--muted-foreground)]">
              Justificativa (mín. 15 caracteres)
            </label>
            <textarea
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
              rows={3}
              value={cancelFocusJustificativa}
              onChange={(e) => setCancelFocusJustificativa(e.target.value)}
              disabled={!!cancellingFocusId}
            />
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={!!cancellingFocusId}
                onClick={() => {
                  setCancelFocusRow(null);
                  setCancelFocusJustificativa("");
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!!cancellingFocusId || cancelFocusJustificativa.trim().length < 15}
                onClick={() => void confirmCancelFocusInvoice()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {cancellingFocusId && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {groupModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-[color:var(--surface)] p-5">
            <h3 className="font-semibold">Agrupar contas a receber</h3>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {selectedRowKeys.length} contas selecionadas. Informe a atividade/descrição do grupo.
            </p>
            <label className="mt-4 mb-1 block text-xs text-[color:var(--muted-foreground)]">
              Atividade/Descrição
            </label>
            <input
              className={inputClass}
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder="Ex.: Faturamento mensal CBS"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setGroupModalOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={grouping || !groupDescription.trim()}
                className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void submitReceivableGroup()}
              >
                {grouping ? "Agrupando..." : "Agrupar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailId && detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setDetailId(null);
            setDetail(null);
            setHistory([]);
            setDetailTab("valores");
            setReceiveModal(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {detail.isGroup ? (
                  <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Grupo
                  </span>
                ) : null}
                <h3 className="mt-1 font-semibold">
                  {detail.description || (detail.isGroup ? "Contas agrupadas" : "Conta a receber")}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {detail.isGroup && detail.groupId ? (
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-black/5"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => void ungroupReceivable(detail.groupId!)}
                  >
                    Desagrupar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setDetailId(null);
                    setDetail(null);
                    setHistory([]);
                    setDetailTab("valores");
                    setReceiveModal(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
              {(
                (
                  detail.isGroup
                    ? ([["valores", "Valores"]] as const)
                    : ([
                        ["valores", "Valores"],
                        ["nfse", "NFSe"],
                        ["historico", "Histórico"],
                      ] as const)
                )
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDetailTab(key);
                    if (key === "historico" && detailId && !detail.isGroup) void loadHistory(detailId);
                    if (key === "nfse" && detailId && !detail.isGroup) void loadNfseAttempts(detailId);
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
            ) : detailTab === "nfse" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Tentativas de emissão NFSe Nacional (Focus). Cada referência fica registrada mesmo
                  após erro, cancelamento ou reemissão.
                </p>
                {nfseAttemptsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[color:var(--muted-foreground)]" />
                  </div>
                ) : nfseAttempts.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Nenhuma tentativa registrada ainda.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border text-xs" style={{ borderColor: "var(--border)" }}>
                    <table className="min-w-full">
                      <thead className="bg-black/5">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Quando</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                          <th className="px-2 py-1.5 text-left">NF</th>
                          <th className="px-2 py-1.5 text-left">Origem</th>
                          <th className="px-2 py-1.5 text-left">Detalhe</th>
                          <th className="px-2 py-1.5 text-center w-10">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nfseAttempts.map((a) => {
                          const attemptViewUrl = focusNoteViewUrl(a.focusNfeDanfseUrl, a.focusNfeUrl);
                          const detailText = a.errorMessage
                            ? a.errorMessage
                            : [a.codigoIss ? `ISS ${a.codigoIss}` : null, a.createdBy?.name]
                                .filter(Boolean)
                                .join(" · ") || "—";
                          return (
                          <tr
                            key={a.id}
                            className="border-t"
                            style={{ borderColor: "var(--border)" }}
                            title={a.focusNfeRef ? `Ref Focus: ${a.focusNfeRef}` : undefined}
                          >
                            <td className="px-2 py-2 whitespace-nowrap">
                              {new Date(a.createdAt).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-2 py-2">{a.status}</td>
                            <td className="px-2 py-2">{a.nfNumber || "—"}</td>
                            <td className="px-2 py-2">{a.source}</td>
                            <td className="px-2 py-2 max-w-[280px] truncate" title={detailText !== "—" ? detailText : undefined}>
                              {detailText}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {attemptViewUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openFocusNote(attemptViewUrl)}
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                                  title={
                                    a.status === "cancelado"
                                      ? "Visualizar nota cancelada"
                                      : "Visualizar nota"
                                  }
                                  aria-label={
                                    a.status === "cancelado"
                                      ? "Visualizar nota cancelada"
                                      : "Visualizar nota"
                                  }
                                >
                                  <Eye className="h-4 w-4 text-[color:var(--primary)]" />
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mt-2 grid gap-1 text-sm text-[color:var(--muted-foreground)] sm:grid-cols-2">
                  <p>Cliente: {dash(detail.clientName)}</p>
                  <p>
                    Projeto:{" "}
                    {dash(
                      detail.projectName ||
                        (detail.allocations ?? []).map((a) => a.projectName).filter(Boolean).join(", ") ||
                        null,
                    )}
                  </p>
                  <p>Forma de pagamento: {dash(paymentMethodLabel(detail.paymentMethod))}</p>
                  <p>
                    Documento:{" "}
                    {dash(detail.billingDocumentLabel)}
                    {detail.contractCurrency ? ` · ${detail.contractCurrency}` : ""}
                  </p>
                  <p className="flex items-center gap-2">
                    Status:{" "}
                    <StatusBadge
                      status={detail.status}
                      nfNumber={detail.nfNumber ?? detail.invoice?.nfNumber}
                      paid={detail.paid || detail.status === "RECEBIDO"}
                    />
                  </p>
                </div>

                <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">
                  Valores
                </h4>
                <div className="mt-2 overflow-x-auto rounded-lg border text-xs" style={{ borderColor: "var(--border)" }}>
                  <table className="min-w-full">
                    <thead className="bg-black/5">
                      <tr>
                        <th className="px-2 py-1.5 text-right">Valor</th>
                        <th className="px-2 py-1.5 text-left">Dt Emissão NF</th>
                        <th className="px-2 py-1.5 text-left">Nro NF</th>
                        <th className="px-2 py-1.5 text-left">Prev. Pagamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-2 py-2 text-right font-medium">{detail.totalAmountFormatted}</td>
                        <td className="px-2 py-2">
                          {formatarData(detail.invoice?.emissionDate ?? detail.nfEmissionDate ?? null)}
                        </td>
                        <td className="px-2 py-2">
                          {dash(detail.invoice?.nfNumber ?? detail.nfNumber ?? null)}
                        </td>
                        <td className="px-2 py-2">{formatarData(detail.nextDueDate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4 className="mt-4 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">
                  {detail.isGroup ? "Parcelas do agrupamento" : "Parcelas"}
                </h4>
                {detail.isGroup ? (
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Somente as parcelas deste grupo. As demais continuam no cronograma do projeto.
                  </p>
                ) : null}
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-[color:var(--muted-foreground)]">
                        <th className="py-1 pr-3">#</th>
                        <th className="py-1 pr-3">Vencimento</th>
                        <th className="py-1 pr-3">Recebimento</th>
                        <th className="py-1 pr-3 text-right">Valor</th>
                        <th className="py-1 pr-3">Status</th>
                        <th className="py-1">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.installments ?? []).map((inst) => {
                        const viewUrl = focusNoteViewUrl(inst.focusNfeDanfseUrl, inst.focusNfeUrl);
                        const canCancelInst =
                          !!inst.focusNfeRef &&
                          (inst.focusNfeStatus === "autorizado" ||
                            (!!inst.nfNumber && inst.focusNfeStatus !== "cancelado")) &&
                          inst.status !== "RECEBIDO" &&
                          inst.status !== "CANCELADO" &&
                          detail.status !== "CANCELADO";
                        const groupedElsewhere = Boolean(inst.billingGroupId && !detail.isGroup);
                        const canReceiveInst =
                          !groupedElsewhere &&
                          (inst.status === "FATURADO" || !!inst.nfNumber) &&
                          inst.status !== "RECEBIDO" &&
                          inst.status !== "CANCELADO";
                        const canCancelInstSafe = canCancelInst && !groupedElsewhere;
                        const hasInternalDoc = Boolean(inst.hasInternalDocument);
                        const canCancelInternal =
                          hasInternalDoc &&
                          !groupedElsewhere &&
                          inst.status !== "RECEBIDO" &&
                          inst.status !== "CANCELADO" &&
                          inst.focusNfeStatus !== "autorizado";
                        return (
                        <tr key={inst.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-2 pr-3">{inst.installmentNumber}</td>
                          <td className="py-2 pr-3">{formatarData(inst.dueDate)}</td>
                          <td className="py-2 pr-3">
                            {formatarData(
                              typeof inst.receivedAt === "string"
                                ? inst.receivedAt.slice(0, 10)
                                : inst.receivedAt
                                  ? new Date(inst.receivedAt).toISOString().slice(0, 10)
                                  : null,
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">{formatarMoeda(inst.amountCents / 100)}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-col items-start gap-0.5">
                              <StatusBadge
                                status={inst.status}
                                nfNumber={inst.nfNumber}
                                paid={inst.status === "RECEBIDO"}
                              />
                              {inst.focusNfeStatus === "cancelado" && (
                                <span className="text-[10px] text-red-700">NF cancelada</span>
                              )}
                              {groupedElsewhere && inst.billingGroupId ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full bg-violet-600/15 px-2 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-600/25"
                                  onClick={() =>
                                    void openRowDetail({
                                      ...detail,
                                      isGroup: true,
                                      groupId: inst.billingGroupId,
                                      description: inst.billingGroupDescription || "Grupo",
                                    })
                                  }
                                >
                                  <Layers className="h-3 w-3" aria-hidden />
                                  {inst.billingGroupDescription || "Grupo"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2">
                            <div className="inline-flex items-center gap-0.5">
                              {hasInternalDoc && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openInternalInvoice({
                                      id: inst.receivableId ?? detail.id,
                                      installmentId: inst.id,
                                      nextInstallmentId: inst.id,
                                    })
                                  }
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                                  title={internalDocumentViewTitle(
                                    inst.billingDocumentType ?? detail.billingDocumentType,
                                  )}
                                  aria-label={internalDocumentViewTitle(
                                    inst.billingDocumentType ?? detail.billingDocumentType,
                                  )}
                                >
                                  <Eye className="h-4 w-4 text-[color:var(--primary)]" />
                                </button>
                              )}
                              {viewUrl && (
                                <button
                                  type="button"
                                  onClick={() => openFocusNote(viewUrl)}
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                                  title={
                                    inst.focusNfeStatus === "cancelado"
                                      ? "Visualizar nota cancelada"
                                      : "Visualizar nota"
                                  }
                                  aria-label={
                                    inst.focusNfeStatus === "cancelado"
                                      ? "Visualizar nota cancelada"
                                      : "Visualizar nota"
                                  }
                                >
                                  <Eye className="h-4 w-4 text-[color:var(--primary)]" />
                                </button>
                              )}
                              {canCancelInstSafe && (
                                <button
                                  type="button"
                                  disabled={cancellingFocusId === inst.id}
                                  onClick={() => openCancelFocusFromInstallment(inst)}
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5 disabled:opacity-50"
                                  title="Cancelar nota"
                                  aria-label="Cancelar nota"
                                >
                                  {cancellingFocusId === inst.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                                  ) : (
                                    <Ban className="h-4 w-4 text-red-600" />
                                  )}
                                </button>
                              )}
                              {!canCancelInstSafe && canCancelInternal && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void cancelInternalDocument({
                                      receivableId: inst.receivableId ?? detail.id,
                                      installmentId: inst.id,
                                      documentType: inst.billingDocumentType ?? detail.billingDocumentType,
                                      isGroup: Boolean(detail.isGroup),
                                      groupId: detail.groupId,
                                      reloadReceivableId: detail.id,
                                    })
                                  }
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                                  title="Cancelar documento"
                                  aria-label="Cancelar documento"
                                >
                                  <Ban className="h-4 w-4 text-red-600" />
                                </button>
                              )}
                              {canReceiveInst && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReceiveModal({
                                      installmentId: inst.id,
                                      receivedAt: new Date().toISOString().slice(0, 10),
                                    })
                                  }
                                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                                  title="Receber pagamento"
                                  aria-label="Receber pagamento"
                                >
                                  <Banknote className="h-4 w-4 text-[color:var(--primary)]" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <h4 className="text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">
                    Anexos
                  </h4>
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    Anexe a nota fiscal e o boleto. Os arquivos ficam salvos e permanecem disponíveis nesta conta.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        const cat = (e.target as HTMLInputElement).dataset.category ?? "NOTA_FISCAL";
                        if (f) void uploadAttachment(f, cat);
                        e.target.value = "";
                      }}
                    />
                    {RECEIVABLE_ATTACHMENT_UPLOAD_CATEGORIES.map((cat) => (
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
                        <Upload className="h-3.5 w-3.5" /> {RECEIVABLE_ATTACHMENT_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                  {attachments.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {attachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-black/[0.02] px-3 py-2 text-xs"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">
                              {RECEIVABLE_ATTACHMENT_LABELS[att.category] ?? att.category}
                            </span>
                            {" · "}
                            {att.filename}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
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

                {!detail.isGroup && detail.status !== "RECEBIDO" && detail.status !== "CANCELADO" && (
                  <button
                    type="button"
                    onClick={() => void cancelReceivable()}
                    className="mt-4 text-xs text-red-600 hover:underline"
                  >
                    Cancelar conta
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {receiveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-[color:var(--surface)] p-5">
            <h3 className="font-semibold text-sm">Registrar recebimento</h3>
            <div className="mt-3">
              <label className={formModalLabelClass}>Data de recebimento</label>
              <input
                type="date"
                className={formModalInputClass()}
                value={receiveModal.receivedAt}
                onChange={(e) =>
                  setReceiveModal((p) => (p ? { ...p, receivedAt: e.target.value } : p))
                }
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiveModal(null)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void receiveInstallment()}
                className="rounded-lg bg-[color:var(--primary)] px-3 py-1.5 text-sm text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
