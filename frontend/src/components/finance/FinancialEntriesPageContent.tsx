"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, History, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import { currentMonthBoundsLocal, unwrapPaginatedList } from "@/lib/financePaginated";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  formatarMoedaInput,
  moedaParaCentavos,
  parseMoedaInputToString,
} from "@/lib/brFormatters";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { FinanceHistoryPanel, type FinanceHistoryRow } from "@/components/finance/FinanceHistoryPanel";
import {
  FinancePageHeader,
  financeSecondaryBtnClass,
} from "@/components/finance/FinancePageHeader";

type Option = { id: string; name: string; code?: string | null };
type AccountOption = Option & { type: string };
type SupplierOption = { id: string; nomeApelido: string };
type UserOption = { id: string; name: string; linkedSupplierId?: string | null };
type ProjectOption = Option & {
  clientId?: string | null;
  client?: { id?: string | null } | null;
};
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

type AttachmentCategory = "NOTA_FISCAL" | "BOLETO" | "COMPROVANTE" | "OUTRO";

type PendingAttachment = {
  id: string;
  file: File;
  category: AttachmentCategory;
};

const ATTACHMENT_LABELS: Record<AttachmentCategory, string> = {
  NOTA_FISCAL: "Nota fiscal",
  BOLETO: "Boleto",
  COMPROVANTE: "Comprovante",
  OUTRO: "Documento",
};

const ATTACHMENT_UPLOAD_CATEGORIES: AttachmentCategory[] = [
  "NOTA_FISCAL",
  "BOLETO",
  "COMPROVANTE",
  "OUTRO",
];

type EntryRow = {
  id: string;
  costCenterId: string;
  costCenterName: string;
  financialAccountId: string;
  financialAccountName: string;
  type: "RECEITA" | "DESPESA";
  amountFormatted: string;
  entryDate: string;
  description: string | null;
  status: string;
  supplierName: string | null;
  projectName: string | null;
  createdByName: string;
  updatedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type FinanceImportResult = {
  createdPayables: number;
  createdReceivables: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

const emptyAllocation = (): AllocationLine => ({ costCenterId: "", projectId: "", percent: "100" });

function buildAllocationsPayload(lines: AllocationLine[]) {
  return lines
    .filter((l) => l.costCenterId)
    .map((l) => ({
      costCenterId: l.costCenterId,
      projectId: l.projectId || null,
      percentBps: Math.round(Number(l.percent || "0") * 100),
    }));
}

function moneyToCentsPayload(raw: string): number | null {
  return moedaParaCentavos(raw);
}

function calculateHourlyRateFromAmount(rawAmount: string): string {
  const amountCents = moedaParaCentavos(rawAmount);
  if (amountCents == null) return "";
  return String(Math.round(amountCents / 168) / 100);
}

export function FinancialEntriesPageContent() {
  const { can, permissionsReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.lancamentos"), [can]);
  const canImport = useMemo(
    () =>
      canFinanceFeature(can, "financeiro.contasPagar") &&
      canFinanceFeature(can, "financeiro.contasReceber"),
    [can],
  );

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [professionals, setProfessionals] = useState<UserOption[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthBounds = currentMonthBoundsLocal();
  const [filterStart, setFilterStart] = useState(monthBounds.start);
  const [filterEnd, setFilterEnd] = useState(monthBounds.end);
  const [listTotal, setListTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const listLimit = 50;
  const [filterCostCenterId, setFilterCostCenterId] = useState("");
  const [filterType, setFilterType] = useState<"" | "RECEITA" | "DESPESA">("");
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<"DESPESA" | "RECEITA">("DESPESA");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<FinanceImportResult | null>(null);

  const [historyEntry, setHistoryEntry] = useState<EntryRow | null>(null);
  const [history, setHistory] = useState<FinanceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [formType, setFormType] = useState<"RECEITA" | "DESPESA">("DESPESA");

  const [payableForm, setPayableForm] = useState({
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [receivableForm, setReceivableForm] = useState({
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

  const selectedCategory = useMemo(
    () => financialCategories.find((c) => c.id === payableForm.financialCategoryId) ?? null,
    [financialCategories, payableForm.financialCategoryId],
  );

  useEffect(() => {
    if (!selectedCategory?.enableAmount || !selectedCategory.enableHourRate) return;
    const calculated = calculateHourlyRateFromAmount(payableForm.amount);
    setPayableForm((current) =>
      current.hourRate === calculated ? current : { ...current, hourRate: calculated },
    );
  }, [payableForm.amount, selectedCategory]);

  const revenueAccounts = useMemo(
    () => accounts.filter((a) => a.type === "RECEITA"),
    [accounts],
  );

  const projectsForClient = useMemo(() => {
    if (!receivableForm.clientId) return [];
    return projects.filter((p) => p.clientId === receivableForm.clientId);
  }, [projects, receivableForm.clientId]);

  const loadEntries = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status: "LANCADO" });
    params.set("limit", String(listLimit));
    params.set("offset", String(offset));
    if (filterStart) params.set("start", filterStart);
    if (filterEnd) params.set("end", filterEnd);
    if (filterCostCenterId) params.set("costCenterId", filterCostCenterId);
    if (filterType) params.set("type", filterType);
    const r = await apiFetch(`/api/financial-entries?${params.toString()}`);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar lançamentos.");
      setLoading(false);
      return;
    }
    const page = unwrapPaginatedList<EntryRow>(body);
    setRows(page.items);
    setListTotal(page.total);
    setListOffset(offset);
    setLoading(false);
  }, [filterStart, filterEnd, filterCostCenterId, filterType]);

  const loadOptions = useCallback(async () => {
    const [ccRes, accRes, cRes, pRes, sRes, uRes, fcRes] = await Promise.all([
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-accounts"),
      apiFetch("/api/clients/for-finance-select"),
      apiFetch("/api/projects?light=true"),
      apiFetch("/api/suppliers/for-select"),
      apiFetch("/api/users/for-select?scope=relatorios&status=ativos"),
      apiFetch("/api/financial-categories"),
    ]);
    const ccBody = await ccRes.json().catch(() => null);
    setCostCenters(
      ccRes.ok && Array.isArray(ccBody)
        ? ccBody.filter((c: Option & { isActive?: boolean }) => c.isActive !== false)
        : [],
    );
    const accBody = await accRes.json().catch(() => null);
    setAccounts(
      accRes.ok && Array.isArray(accBody)
        ? accBody.filter((a: AccountOption & { isActive?: boolean }) => a.isActive !== false)
        : [],
    );
    const cBody = await cRes.json().catch(() => null);
    setClients(
      cRes.ok && Array.isArray(cBody) ? cBody.map((c: Option) => ({ id: c.id, name: c.name })) : [],
    );
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
    const sBody = await sRes.json().catch(() => null);
    setSuppliers(
      sRes.ok && Array.isArray(sBody)
        ? sBody.map((s: SupplierOption) => ({ id: s.id, nomeApelido: s.nomeApelido }))
        : [],
    );
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
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void loadOptions();
  }, [permissionsReady, canAccess, loadOptions]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void loadEntries();
  }, [permissionsReady, canAccess, loadEntries]);

  function addPendingAttachment(file: File, category: AttachmentCategory) {
    setPendingAttachments((prev) => [
      ...prev,
      { id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`, file, category },
    ]);
  }

  async function uploadPendingAttachments(payableId: string) {
    const CONCURRENCY = 3;
    const queue = [...pendingAttachments];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const att = queue.shift();
        if (!att) return;
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
          reader.readAsDataURL(att.file);
        });
        const r = await apiFetch(`/api/payables/${payableId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: att.file.name,
            fileData,
            fileType: att.file.type,
            fileSize: att.file.size,
            category: att.category,
          }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `Erro ao anexar ${ATTACHMENT_LABELS[att.category]}.`,
          );
        }
      }
    });
    await Promise.all(workers);
  }

  async function savePayable() {
    if (!payableForm.description.trim()) {
      setError("Informe a atividade/descrição.");
      return;
    }
    if (!payableForm.financialCategoryId) {
      setError("Selecione a categoria financeira.");
      return;
    }
    if (!payableForm.dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    if (payableForm.payeeKind === "professional" && !payableForm.professionalUserId) {
      setError("Selecione o profissional.");
      return;
    }
    if (payableForm.payeeKind === "supplier" && !payableForm.supplierId) {
      setError("Selecione a empresa/fornecedor.");
      return;
    }
    const allocationPayload = buildAllocationsPayload(allocations);
    if (allocationPayload.length === 0) {
      setError("Informe ao menos uma linha de rateio por centro de custo.");
      return;
    }
    const cat = selectedCategory;
    const amountCents = cat?.enableAmount ? (moneyToCentsPayload(payableForm.amount) ?? 0) : 0;
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      description: payableForm.description.trim(),
      financialCategoryId: payableForm.financialCategoryId,
      totalAmountCents: amountCents ?? 0,
      dueDate: payableForm.dueDate,
      installmentCount: 1,
      professionalUserId: payableForm.payeeKind === "professional" ? payableForm.professionalUserId : null,
      supplierId: payableForm.payeeKind === "supplier" ? payableForm.supplierId : null,
      allocations: allocationPayload,
    };
    if (cat?.enableHourRate) payload.hourRateCents = moneyToCentsPayload(payableForm.hourRate);
    if (cat?.enableDiscount) payload.discountCents = moneyToCentsPayload(payableForm.discount);
    if (cat?.enableInterestFine) payload.interestFineCents = moneyToCentsPayload(payableForm.interestFine);
    if (cat?.enableComplementaryHours) {
      const h =
        payableForm.complementaryHours.trim() === ""
          ? null
          : Number(payableForm.complementaryHours.replace(",", "."));
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
    if (!r.ok) {
      setSaving(false);
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar conta a pagar.");
      return;
    }
    const payableId = typeof body?.id === "string" ? body.id : null;
    if (payableId && pendingAttachments.length > 0) {
      try {
        await uploadPendingAttachments(payableId);
      } catch (err) {
        setSaving(false);
        setError(
          err instanceof Error
            ? `${err.message} A conta foi criada; finalize os anexos em Contas a pagar.`
            : "Conta criada, mas houve erro nos anexos.",
        );
        router.push(`${basePath}/financeiro/contas-pagar`);
        return;
      }
    }
    setSaving(false);
    setPendingAttachments([]);
    router.push(`${basePath}/financeiro/contas-pagar`);
  }

  async function saveReceivable() {
    if (!receivableForm.description.trim()) {
      setError("Informe a descrição.");
      return;
    }
    if (!receivableForm.clientId) {
      setError("Selecione o cliente.");
      return;
    }
    if (!receivableForm.financialAccountId) {
      setError("Selecione a conta financeira.");
      return;
    }
    if (!receivableForm.costCenterId) {
      setError("Selecione o centro de custo.");
      return;
    }
    if (!receivableForm.dueDate) {
      setError("Informe o vencimento.");
      return;
    }
    const amountCents = moneyToCentsPayload(receivableForm.amount);
    if (amountCents == null || amountCents <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    setSaving(true);
    setError(null);
    const r = await apiFetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: receivableForm.description.trim(),
        clientId: receivableForm.clientId,
        financialAccountId: receivableForm.financialAccountId,
        amount: receivableForm.amount,
        totalAmountCents: amountCents,
        competenceDate: receivableForm.competenceDate || null,
        dueDate: receivableForm.dueDate,
        installmentCount: Number(receivableForm.installmentCount) || 1,
        projectId: receivableForm.projectId || null,
        allocations: [
          {
            costCenterId: receivableForm.costCenterId,
            projectId: receivableForm.projectId || null,
            percentBps: 10000,
          },
        ],
      }),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar conta a receber.");
      return;
    }
    router.push(`${basePath}/financeiro/contas-receber`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formType === "DESPESA") await savePayable();
    else await saveReceivable();
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancelar este lançamento?")) return;
    const r = await apiFetch(`/api/financial-entries/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      alert(typeof body?.error === "string" ? body.error : "Erro ao cancelar.");
      return;
    }
    await loadEntries();
  }

  async function openHistory(row: EntryRow) {
    setHistoryEntry(row);
    setHistoryLoading(true);
    const r = await apiFetch(`/api/financial-entries/${row.id}/history`);
    const body = await r.json().catch(() => null);
    setHistory(r.ok && Array.isArray(body) ? body : []);
    setHistoryLoading(false);
  }

  function patchAlloc(index: number, patch: Partial<AllocationLine>) {
    setAllocations((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function downloadImportTemplate(kind: "DESPESA" | "RECEITA" = importKind) {
    const csv =
      kind === "DESPESA"
        ? [
            "Mês;Data;Categoria Financeira;Vencimento;Tipo Contrato;Profissional/Empresa;Atividade/Descrição;Centro de custo;Tx Hora;Valor;Descontos;Horas Complementares;Juros/Multa;Pago",
            "Julho;01/07/2026;Folha;27/07/2026;PJ;Anderson;Remuneração sobre serviços prestados;Operação SAP; ;500,00; ; ; ;0",
            "Julho;05/07/2026;Infraestrutura;15/07/2026;;Fornecedor Exemplo;Internet escritório;Administrativo;;189,90;;; ;1",
          ].join("\r\n")
        : [
            "Cliente;Projeto;Atividade/Descrição;Contrato;Data;Valor;Dt Emissão NF;Nro NF;Prev Pagamento;Centro de Custo;Pago",
            "Cliente Exemplo;Projeto Alpha;Mensalidade de suporte;CTR-2026-01;01/07/2026;5.000,00;01/07/2026;12345;10/07/2026;Comercial;0",
            "Cliente Exemplo;Projeto Beta;Horas extras consultoria;;15/07/2026;1.200,00;;;20/07/2026;Comercial;1",
          ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      kind === "DESPESA"
        ? "modelo-importacao-despesas.csv"
        : "modelo-importacao-receitas.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submitImport() {
    if (!importFile) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const buffer = await importFile.arrayBuffer();
      let csvText = new TextDecoder("utf-8").decode(buffer);
      if (/Ã.|Â./.test(csvText)) {
        csvText = new TextDecoder("windows-1252").decode(buffer);
      }
      const response = await apiFetch("/api/financial-entries/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, importKind }),
      });
      const body = await response.json().catch(() => null);
      const result: FinanceImportResult = {
        createdPayables: Number(body?.createdPayables ?? 0),
        createdReceivables: Number(body?.createdReceivables ?? 0),
        skipped: Number(body?.skipped ?? 0),
        errors: Array.isArray(body?.errors) ? body.errors : [],
      };
      setImportResult(result);
      if (!response.ok && result.errors.length === 0) {
        setError(typeof body?.error === "string" ? body.error : "Erro ao importar a planilha.");
      }
      if (result.createdPayables + result.createdReceivables > 0) {
        setImportFile(null);
        await loadEntries(0);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Erro ao ler a planilha.");
    } finally {
      setImporting(false);
    }
  }

  if (!permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando...</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] gap-3 p-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Sem permissão para lançamentos financeiros.</p>
        <button type="button" onClick={() => router.push(basePath)} className="text-sm underline">
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <FinancePageHeader
        variant="bar"
        title="Lançamentos financeiros"
        subtitle="Escolha o tipo e preencha como em Contas a pagar ou Contas a receber."
        actions={
          canImport ? (
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportResult(null);
              }}
              className={financeSecondaryBtnClass}
              style={{ borderColor: "var(--border)" }}
            >
              <Upload className="h-4 w-4" />
              Importar planilha
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto md:py-5">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>
          )}

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Novo lançamento</h2>

            <div className="max-w-sm">
              <label className={formModalLabelClass}>Tipo *</label>
              <PopoverSelect
                id="financial-entry-form-type"
                value={formType}
                onChange={(v) => {
                  setError(null);
                  setFormType(v as "RECEITA" | "DESPESA");
                  if (v !== "DESPESA") setPendingAttachments([]);
                }}
                checklist={false}
                options={[
                  { value: "DESPESA", label: "Despesa" },
                  { value: "RECEITA", label: "Receita" },
                ]}
              />
            </div>

            {formType === "DESPESA" ? (
              <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Campos de Contas a pagar — ao salvar, a conta aparece em Contas a pagar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={formModalLabelClass}>Atividade/Descrição</label>
                    <input
                      className={formModalInputClass()}
                      value={payableForm.description}
                      onChange={(e) => setPayableForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Ex.: Desenvolvedor Fullstack, Internet, Limpeza..."
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Categoria financeira</label>
                    <PopoverSelect
                      id="lancamentos-payable-category"
                      value={payableForm.financialCategoryId}
                      onChange={(v) =>
                        setPayableForm((f) => ({
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
                </div>
                {selectedCategory && (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border p-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {selectedCategory.enableHourRate && (
                      <div>
                        <label className={formModalLabelClass}>Tx hora</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={formModalInputClass()}
                          value={formatarMoedaInput(payableForm.hourRate)}
                          placeholder="R$ 0,00"
                        readOnly={Boolean(selectedCategory.enableAmount)}
                          onChange={(e) =>
                            setPayableForm((f) => ({
                              ...f,
                              hourRate: parseMoedaInputToString(e.target.value),
                            }))
                          }
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
                          value={formatarMoedaInput(payableForm.amount)}
                          placeholder="R$ 0,00"
                          onChange={(e) =>
                            setPayableForm((f) => ({
                              ...f,
                              amount: parseMoedaInputToString(e.target.value),
                            }))
                          }
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
                          value={formatarMoedaInput(payableForm.discount)}
                          placeholder="R$ 0,00"
                          onChange={(e) =>
                            setPayableForm((f) => ({
                              ...f,
                              discount: parseMoedaInputToString(e.target.value),
                            }))
                          }
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
                          value={payableForm.complementaryHours}
                          placeholder="0"
                          onChange={(e) =>
                            setPayableForm((f) => ({ ...f, complementaryHours: e.target.value }))
                          }
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
                          value={formatarMoedaInput(payableForm.interestFine)}
                          placeholder="R$ 0,00"
                          onChange={(e) =>
                            setPayableForm((f) => ({
                              ...f,
                              interestFine: parseMoedaInputToString(e.target.value),
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={formModalLabelClass}>Data de vencimento</label>
                    <input
                      type="date"
                      className={formModalInputClass()}
                      value={payableForm.dueDate}
                      onChange={(e) => setPayableForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={formModalLabelClass}>Profissional/Empresa</label>
                    <div className="mb-2 flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="lancamentos-payeeKind"
                          checked={payableForm.payeeKind === "professional"}
                          onChange={() =>
                            setPayableForm((f) => ({
                              ...f,
                              payeeKind: "professional",
                              supplierId: "",
                            }))
                          }
                        />
                        Profissional
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="lancamentos-payeeKind"
                          checked={payableForm.payeeKind === "supplier"}
                          onChange={() =>
                            setPayableForm((f) => ({
                              ...f,
                              payeeKind: "supplier",
                              professionalUserId: "",
                            }))
                          }
                        />
                        Empresa
                      </label>
                    </div>
                    {payableForm.payeeKind === "professional" ? (
                      <PopoverSelect
                        id="lancamentos-payable-professional"
                        value={payableForm.professionalUserId}
                        onChange={(v) => setPayableForm((f) => ({ ...f, professionalUserId: v }))}
                        placeholder="Selecione o profissional"
                        options={[
                          { value: "", label: "Selecione o profissional" },
                          ...professionals.map((u) => ({ value: u.id, label: u.name })),
                        ]}
                      />
                    ) : (
                      <PopoverSelect
                        id="lancamentos-payable-supplier"
                        value={payableForm.supplierId}
                        onChange={(v) => setPayableForm((f) => ({ ...f, supplierId: v }))}
                        placeholder="Selecione a empresa/fornecedor"
                        options={[
                          { value: "", label: "Selecione a empresa/fornecedor" },
                          ...suppliers.map((s) => ({ value: s.id, label: s.nomeApelido })),
                        ]}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={formModalLabelClass}>Rateio (centro de custo / projeto)</label>
                    <button
                      type="button"
                      className="text-xs text-[color:var(--primary)] hover:underline"
                      onClick={() => setAllocations((lines) => [...lines, emptyAllocation()])}
                    >
                      + Linha
                    </button>
                  </div>
                  {allocations.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <PopoverSelect
                          id={`lancamentos-alloc-cc-${idx}`}
                          value={line.costCenterId}
                          onChange={(v) => patchAlloc(idx, { costCenterId: v })}
                          placeholder="Centro de custo"
                          options={[
                            { value: "", label: "Centro de custo" },
                            ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                          ]}
                        />
                      </div>
                      <div className="col-span-4">
                        <PopoverSelect
                          id={`lancamentos-alloc-project-${idx}`}
                          value={line.projectId}
                          onChange={(v) => patchAlloc(idx, { projectId: v })}
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
                            value={line.percent}
                            onChange={(e) => patchAlloc(idx, { percent: e.target.value })}
                            placeholder="0"
                            aria-label="Percentual do rateio"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--muted-foreground)]">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        {allocations.length > 1 && (
                          <button
                            type="button"
                            className="text-xs text-red-600"
                            onClick={() =>
                              setAllocations((lines) => lines.filter((_, i) => i !== idx))
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <h4 className="text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">
                    Anexos
                  </h4>
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    Anexe nota fiscal, boleto ou comprovante. Os arquivos serão salvos na conta a pagar.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        const cat = ((e.target as HTMLInputElement).dataset.category ??
                          "OUTRO") as AttachmentCategory;
                        if (f) addPendingAttachment(f, cat);
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
                  {pendingAttachments.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {pendingAttachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs bg-black/[0.02]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <span>
                            <span className="font-medium">
                              {ATTACHMENT_LABELS[att.category]}
                            </span>
                            {" · "}
                            {att.file.name}
                          </span>
                          <button
                            type="button"
                            className="text-red-600"
                            title="Remover"
                            onClick={() =>
                              setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                      Nenhum anexo ainda.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Campos de Contas a receber — ao salvar, a conta aparece em Contas a receber.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={formModalLabelClass}>Descrição</label>
                    <input
                      className={formModalInputClass()}
                      value={receivableForm.description}
                      onChange={(e) =>
                        setReceivableForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Cliente</label>
                    <PopoverSelect
                      id="lancamentos-receivable-client"
                      value={receivableForm.clientId}
                      onChange={(v) =>
                        setReceivableForm((f) => ({ ...f, clientId: v, projectId: "" }))
                      }
                      placeholder="—"
                      options={[
                        { value: "", label: "—" },
                        ...clients.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Projeto</label>
                    <PopoverSelect
                      id="lancamentos-receivable-project"
                      value={receivableForm.projectId}
                      disabled={!receivableForm.clientId}
                      onChange={(v) => setReceivableForm((f) => ({ ...f, projectId: v }))}
                      placeholder={
                        !receivableForm.clientId
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
                    <label className={formModalLabelClass}>Conta financeira (receita)</label>
                    <PopoverSelect
                      id="lancamentos-receivable-account"
                      value={receivableForm.financialAccountId}
                      onChange={(v) => setReceivableForm((f) => ({ ...f, financialAccountId: v }))}
                      placeholder="—"
                      options={[
                        { value: "", label: "—" },
                        ...revenueAccounts.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Centro de custo (rateio)</label>
                    <PopoverSelect
                      id="lancamentos-receivable-cost-center"
                      value={receivableForm.costCenterId}
                      onChange={(v) => setReceivableForm((f) => ({ ...f, costCenterId: v }))}
                      placeholder="—"
                      options={[
                        { value: "", label: "—" },
                        ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Valor (R$)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={formModalInputClass()}
                      value={formatarMoedaInput(receivableForm.amount)}
                      placeholder="R$ 0,00"
                      onChange={(e) =>
                        setReceivableForm((f) => ({
                          ...f,
                          amount: parseMoedaInputToString(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Parcelas</label>
                    <input
                      type="number"
                      min={1}
                      className={formModalInputClass()}
                      value={receivableForm.installmentCount}
                      onChange={(e) =>
                        setReceivableForm((f) => ({ ...f, installmentCount: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Competência</label>
                    <input
                      type="date"
                      className={formModalInputClass()}
                      value={receivableForm.competenceDate}
                      onChange={(e) =>
                        setReceivableForm((f) => ({ ...f, competenceDate: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>1º vencimento</label>
                    <input
                      type="date"
                      className={formModalInputClass()}
                      value={receivableForm.dueDate}
                      onChange={(e) =>
                        setReceivableForm((f) => ({ ...f, dueDate: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {formType === "DESPESA" ? "Lançar em Contas a pagar" : "Lançar em Contas a receber"}
            </button>
          </form>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-[color:var(--foreground)]">
              Lançamentos no caixa
            </h2>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Registros gerados ao marcar contas como pagas/recebidas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className={inputClass}
              />
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className={inputClass}
              />
              <PopoverSelect
                id="financial-entry-filter-cost-center"
                value={filterCostCenterId}
                onChange={(v) => setFilterCostCenterId(v)}
                placeholder="Todos os centros"
                checklist={false}
                options={[
                  { value: "", label: "Todos os centros" },
                  ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <PopoverSelect
                id="financial-entry-filter-type"
                value={filterType}
                onChange={(v) => setFilterType(v as "" | "RECEITA" | "DESPESA")}
                placeholder="Receita e despesa"
                checklist={false}
                options={[
                  { value: "", label: "Receita e despesa" },
                  { value: "RECEITA", label: "Receita" },
                  { value: "DESPESA", label: "Despesa" },
                ]}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">
                Carregando...
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[color:var(--muted-foreground)]">
                Nenhum lançamento no período.
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-[color:var(--background)]/60 border-b border-[color:var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Data
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Centro de custo
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Conta
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">
                        Valor
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-foreground)]">
                        Descrição
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-foreground)]">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[color:var(--border)] last:border-0">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.entryDate.split("-").reverse().join("/")}
                        </td>
                        <td className="px-4 py-3">
                          <span className={row.type === "RECEITA" ? "text-emerald-600" : "text-red-600"}>
                            {row.type === "RECEITA" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.costCenterName}</td>
                        <td className="px-4 py-3">{row.financialAccountName}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {row.amountFormatted}
                        </td>
                        <td className="px-4 py-3 text-[color:var(--muted-foreground)] max-w-[200px] truncate">
                          {row.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void openHistory(row)}
                              className="inline-flex items-center justify-center rounded-lg border p-2 hover:opacity-90"
                              style={{ borderColor: "var(--border)" }}
                              title="Histórico"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCancel(row.id)}
                              className="inline-flex items-center justify-center rounded-lg border p-2 hover:opacity-90"
                              style={{ borderColor: "var(--border)" }}
                              title="Cancelar lançamento"
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
              {listTotal > listLimit ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-[color:var(--muted-foreground)]">
                    {listOffset + 1}–{Math.min(listOffset + listLimit, listTotal)} de {listTotal}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={listOffset <= 0 || loading}
                      className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                      onClick={() => void loadEntries(Math.max(0, listOffset - listLimit))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={listOffset + listLimit >= listTotal || loading}
                      className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 disabled:opacity-50"
                      onClick={() => void loadEntries(listOffset + listLimit)}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              ) : null}
              </>
            )}
          </div>
        </div>
      </main>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Importar planilha</h3>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Escolha o tipo: despesas vão para Contas a pagar e receitas para Contas a receber.
                  Use o modelo correspondente às colunas de cada tela.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-w-sm">
              <label className={formModalLabelClass}>Tipo de importação *</label>
              <PopoverSelect
                id="lancamentos-import-kind"
                value={importKind}
                onChange={(v) => {
                  setImportKind(v as "DESPESA" | "RECEITA");
                  setImportFile(null);
                  setImportResult(null);
                }}
                checklist={false}
                options={[
                  { value: "DESPESA", label: "Despesas (Contas a pagar)" },
                  { value: "RECEITA", label: "Receitas (Contas a receber)" },
                ]}
              />
            </div>

            <div className="mt-4 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
              {importKind === "DESPESA" ? (
                <>
                  <p className="font-medium">Colunas — Despesas</p>
                  <p className="mt-1 text-[color:var(--muted-foreground)]">
                    Mês; Data; Categoria Financeira; Vencimento; Tipo Contrato; Profissional/Empresa;
                    Atividade/Descrição; Centro de custo; Tx Hora; Valor; Descontos; Horas
                    Complementares (horas ou R$ — se R$, converte pela Tx Hora); Juros/Multa; Pago (1 =
                    sim, 0 = não).
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Colunas — Receitas</p>
                  <p className="mt-1 text-[color:var(--muted-foreground)]">
                    Cliente; Projeto; Atividade/Descrição; Contrato; Data; Valor; Dt Emissão NF; Nro
                    NF; Prev Pagamento; Centro de Custo; Pago (1 = sim, 0 = não).
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => downloadImportTemplate(importKind)}
                className="mt-3 inline-flex items-center gap-2 font-medium text-[color:var(--primary)] hover:underline"
              >
                <Download className="h-4 w-4" />
                Baixar modelo CSV ({importKind === "DESPESA" ? "despesas" : "receitas"})
              </button>
            </div>

            <div className="mt-4">
              <label className={formModalLabelClass}>Arquivo CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className={formModalInputClass()}
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
              />
            </div>

            {importResult && (
              <div
                className="mt-4 rounded-xl border p-3 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="font-medium">
                  {importKind === "DESPESA"
                    ? `${importResult.createdPayables} despesa(s) importada(s) em Contas a pagar.`
                    : `${importResult.createdReceivables} receita(s) importada(s) em Contas a receber.`}
                </p>
                {importResult.skipped > 0 && (
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    {importResult.skipped} linha(s) vazia(s) ignorada(s).
                  </p>
                )}
                {importResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-red-600">
                      {importResult.errors.length} linha(s) com erro:
                    </p>
                    <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                      {importResult.errors.map((item, index) => (
                        <li key={`${item.line}-${index}`}>
                          Linha {item.line}: {item.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={!importFile || importing}
                onClick={() => void submitImport()}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar {importKind === "DESPESA" ? "despesas" : "receitas"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">Histórico do lançamento</h3>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  {historyEntry.description || "Sem descrição"} · {historyEntry.amountFormatted}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryEntry(null);
                  setHistory([]);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <FinanceHistoryPanel
                history={history}
                loading={historyLoading}
                audit={{
                  createdAt: historyEntry.createdAt,
                  updatedAt: historyEntry.updatedAt,
                  createdByName: historyEntry.createdByName,
                  updatedByName: historyEntry.updatedByName,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
