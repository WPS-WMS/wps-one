"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import { formModalInputClass, formModalLabelClass } from "@/components/FormModalPrimitives";
import {
  addMonthsToIso,
  applyAutoBillingAmounts,
  cascadeBillingDatesFrom,
  costLineValue,
  defaultCostLine,
  newClientId as newBillingClientId,
  nextBillingDueFromLines,
  redistributeBillingAmountsAfterEdit,
  renumberBillingInstallments,
  sumBillingLines,
  sumCostLines,
  todayLocalIso,
  type BillingLineDraft,
  type CostLineDraft,
} from "@/components/finance/projectRevenueCompositionUtils";

export type VariableRevenueEntryDraft = {
  clientId: string;
  title: string;
  competenceMonth: string;
  description: string;
  hours: string;
  amount: string;
  skillLines: CostLineDraft[];
  billingLines: BillingLineDraft[];
  isLocked?: boolean;
  receivableGenerated?: boolean;
};

export type VariableRevenueEntryApi = {
  id: string;
  title?: string | null;
  competenceDate: string;
  description: string | null;
  hours: number | null;
  hourlyRate: number | null;
  amount: number;
  installmentCount: number;
  firstDueDate: string;
  costLines?: Array<{
    id: string;
    skill: string;
    hourlyRate: number;
    hours: number;
    totalValue?: number;
  }>;
  billingLines?: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    expectedPaymentDate?: string | null;
    amount: number;
  }>;
  isLocked?: boolean;
  receivableGenerated?: boolean;
};

const cellInputClass =
  "w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--primary)]";
const tableClass = "min-w-full text-xs border rounded-xl overflow-hidden";
const thClass = "px-3 py-2 text-left font-semibold whitespace-nowrap";

function isPersistedVariableEntryId(id: string): boolean {
  return Boolean(id) && !id.startsWith("variable-") && !id.startsWith("tmp-");
}

function newClientId(): string {
  return `variable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateIso(): string {
  return todayLocalIso();
}

function currentMonthIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function yearMonthFromIsoDate(iso: string | null | undefined): string | null {
  const stamp = String(iso ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(stamp) ? stamp : null;
}

/** Vencimento padrão da 1ª parcela: mês seguinte ao de competência (apontamentos). */
function defaultFirstDueFromCompetence(competenceMonth: string, existingDue?: string): string {
  const stamp = yearMonthFromIsoDate(competenceMonth) || currentMonthIso();
  const day = existingDue && /^\d{4}-\d{2}-\d{2}$/.test(existingDue) ? existingDue.slice(8, 10) : "01";
  return addMonthsToIso(`${stamp}-${day}`, 1);
}

function firstBillingDueDate(lines: BillingLineDraft[]): string | null {
  const dated = lines.filter((line) => line.dueDate);
  if (dated.length === 0) return null;
  const sorted = [...dated].sort((a, b) => {
    const na = Number(a.installmentNumber) || 0;
    const nb = Number(b.installmentNumber) || 0;
    if (na !== nb) return na - nb;
    return a.dueDate.localeCompare(b.dueDate);
  });
  return sorted[0]!.dueDate;
}

function billingMonthFromEntry(entry: VariableRevenueEntryDraft): string {
  const dueMonth = yearMonthFromIsoDate(firstBillingDueDate(entry.billingLines));
  if (dueMonth) return dueMonth;
  return yearMonthFromIsoDate(defaultFirstDueFromCompetence(entry.competenceMonth || currentMonthIso()))
    ?? currentMonthIso();
}

function nextMeasurementFirstDueDate(existingEntries: VariableRevenueEntryDraft[]): string {
  const allLines = existingEntries.flatMap((entry) => entry.billingLines).filter((line) => line.dueDate);
  if (allLines.length === 0) return localDateIso();
  const latestDue = allLines.reduce(
    (max, line) => (line.dueDate > max ? line.dueDate : max),
    allLines[0]!.dueDate,
  );
  return addMonthsToIso(latestDue, 1);
}

function defaultInstallmentLines(amount: number, count = 1, firstDue = localDateIso()): BillingLineDraft[] {
  const safeCount = Math.max(1, Math.min(count, 120));
  return renumberBillingInstallments(
    applyAutoBillingAmounts(
      amount,
      Array.from({ length: safeCount }, (_, index) => ({
        clientId: newBillingClientId(),
        milestone: "",
        installmentNumber: String(index + 1),
        dueDate: index === 0 ? firstDue : addMonthsToIso(firstDue, index),
        expectedPaymentDate: index === 0 ? firstDue : addMonthsToIso(firstDue, index),
        amount: "0",
      })),
      true,
    ),
  );
}

function sumSkillHours(lines: CostLineDraft[]): number {
  return (
    Math.round(lines.reduce((sum, line) => sum + (Number(line.hours) || 0), 0) * 100) / 100
  );
}

function mapApiCostLinesToDraft(
  entry: VariableRevenueEntryApi,
): CostLineDraft[] {
  if (entry.costLines && entry.costLines.length > 0) {
    return entry.costLines.map((line) => ({
      clientId: line.id,
      skill: line.skill,
      hourlyRate: String(line.hourlyRate),
      hours: String(line.hours),
    }));
  }
  if (entry.hourlyRate != null && entry.hours != null && entry.hours > 0) {
    const rate =
      entry.hourlyRate > 0
        ? entry.hourlyRate
        : entry.amount > 0
          ? Math.round((entry.amount / entry.hours) * 100) / 100
          : 0;
    return [
      {
        clientId: `${entry.id}-legacy`,
        skill: "Geral",
        hourlyRate: String(rate),
        hours: String(entry.hours),
      },
    ];
  }
  if (entry.amount > 0) {
    return [
      {
        clientId: `${entry.id}-legacy`,
        skill: "Geral",
        hourlyRate: String(entry.amount),
        hours: "1",
      },
    ];
  }
  return [defaultCostLine()];
}

export function emptyVariableRevenueEntry(index = 0): VariableRevenueEntryDraft {
  const competenceMonth = currentMonthIso();
  return {
    clientId: newClientId(),
    title: `Medição ${index + 1}`,
    competenceMonth,
    description: "",
    hours: "",
    amount: "",
    skillLines: [defaultCostLine()],
    billingLines: defaultInstallmentLines(0, 1, defaultFirstDueFromCompetence(competenceMonth)),
  };
}

export function mapVariableEntriesToDraft(
  entries: VariableRevenueEntryApi[] | undefined,
): VariableRevenueEntryDraft[] {
  if (!entries?.length) return [emptyVariableRevenueEntry()];
  return entries.map((entry, index) => {
    const skillLines = mapApiCostLinesToDraft(entry);
    const amount = entry.amount > 0 ? entry.amount : sumCostLines(skillLines);
    const billingLines =
      entry.billingLines && entry.billingLines.length > 0
        ? renumberBillingInstallments(
            entry.billingLines.map((line) => ({
              clientId: line.id,
              milestone: line.milestone ?? "",
              installmentNumber: String(line.installmentNumber),
              dueDate: String(line.dueDate).slice(0, 10),
              expectedPaymentDate: String(line.expectedPaymentDate ?? line.dueDate).slice(0, 10),
              amount: String(line.amount),
            })),
          )
        : defaultInstallmentLines(
            amount,
            entry.installmentCount || 1,
            String(entry.firstDueDate).slice(0, 10),
          );
    const titleFromMilestone = billingLines.find((line) => line.milestone.trim())?.milestone.trim();
    return {
      clientId: entry.id,
      title: entry.title?.trim() || titleFromMilestone || `Medição ${index + 1}`,
      competenceMonth: String(entry.competenceDate).slice(0, 7),
      description: entry.description ?? "",
      hours:
        entry.hours != null && Number(entry.hours) >= 0
          ? String(entry.hours)
          : sumSkillHours(skillLines) > 0
            ? String(sumSkillHours(skillLines))
            : "",
      amount: String(amount),
      skillLines,
      billingLines,
      isLocked: entry.isLocked,
      receivableGenerated: Boolean(entry.receivableGenerated),
    };
  });
}

export function variableEntriesToPayload(entries: VariableRevenueEntryDraft[]) {
  return entries.map((entry, index) => {
    const skillLines = entry.skillLines
      .filter((line) => line.skill.trim() || line.hourlyRate || line.hours)
      .map((line, lineIndex) => ({
        skill: line.skill.trim() || `Skill ${lineIndex + 1}`,
        hourlyRate: Number(line.hourlyRate) || 0,
        hours: Number(line.hours) || 0,
        sortOrder: lineIndex,
      }));
    const skillTotal = sumCostLines(entry.skillLines);
    const storedAmount = Number(entry.amount);
    const amount =
      skillTotal > 0
        ? skillTotal
        : Number.isFinite(storedAmount) && storedAmount > 0
          ? storedAmount
          : 0;
    const skillHours = sumSkillHours(entry.skillLines);
    const title = entry.title.trim() || `Medição ${index + 1}`;
    const billingLines = entry.billingLines
      .filter((line) => line.dueDate)
      .map((line, lineIndex) => ({
        milestone: title,
        installmentNumber: Number(line.installmentNumber) || lineIndex + 1,
        dueDate: line.dueDate,
        expectedPaymentDate: line.expectedPaymentDate || line.dueDate,
        amount: Number(line.amount) || 0,
        sortOrder: lineIndex,
      }));
    const firstDueDate = billingLines[0]?.dueDate ?? localDateIso();
    const referenceHours =
      entry.hours !== "" && Number.isFinite(Number(entry.hours))
        ? Number(entry.hours)
        : skillHours > 0
          ? skillHours
          : null;
    return {
      id: isPersistedVariableEntryId(entry.clientId) ? entry.clientId : undefined,
      title,
      competenceDate: `${entry.competenceMonth}-01`,
      description: entry.description.trim() || null,
      hours: referenceHours,
      hourlyRate:
        referenceHours != null && referenceHours > 0 && amount > 0
          ? Math.round((amount / referenceHours) * 100) / 100
          : null,
      amount,
      costLines: skillLines,
      installmentCount: billingLines.length || 1,
      firstDueDate,
      billingLines,
      sortOrder: index,
    };
  });
}

function hoursTimesClientRate(hours: string, rate: number | null | undefined): number {
  const h = Number(hours);
  const r = Number(rate);
  if (!Number.isFinite(h) || !Number.isFinite(r) || h <= 0 || r <= 0) return 0;
  return Math.round(h * r * 100) / 100;
}

function formatCompetenceMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split("-");
  if (!year || !month) return isoMonth;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function ProjectVariableRevenueEditor({
  projectId,
  revenueId = null,
  entries,
  onChange,
  disabled = false,
  clientHourlyRate = null,
  onReceivableGenerated,
}: {
  projectId: string;
  revenueId?: string | null;
  entries: VariableRevenueEntryDraft[];
  onChange: Dispatch<SetStateAction<VariableRevenueEntryDraft[]>>;
  disabled?: boolean;
  clientHourlyRate?: number | null;
  onReceivableGenerated?: (payload: { variableEntries?: VariableRevenueEntryApi[] } & Record<string, unknown>) => void;
}) {
  const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const requestedHours = useRef(new Set<string>());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const entryIdsKey = entries.map((entry) => entry.clientId).join("|");

  useEffect(() => {
    const lastId = entries[entries.length - 1]?.clientId;
    if (!lastId) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds((current) => {
      const valid = new Set(entries.map((entry) => entry.clientId));
      const kept = new Set([...current].filter((id) => valid.has(id)));
      if (kept.size > 0) return kept;
      return new Set([lastId]);
    });
  }, [entryIdsKey, entries]);

  function toggleExpanded(clientId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function expandOnly(clientId: string) {
    setExpandedIds(new Set([clientId]));
  }

  useEffect(() => {
    const entry = entries.find(
      (row) =>
        !row.isLocked &&
        row.competenceMonth &&
        row.hours === "" &&
        !requestedHours.current.has(`${row.clientId}:${row.competenceMonth}`),
    );
    if (!entry) return;
    const requestKey = `${entry.clientId}:${entry.competenceMonth}`;
    requestedHours.current.add(requestKey);
    void (async () => {
      const response = await apiFetch(
        `/api/project-revenues/worked-hours?projectId=${encodeURIComponent(projectId)}&competence=${encodeURIComponent(entry.competenceMonth)}`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.totalHours !== "number") {
        if (!response.ok) requestedHours.current.delete(requestKey);
        return;
      }
      if (!(body.totalHours > 0)) return;
      onChange((current) =>
        current.map((row) => {
          if (
            row.clientId !== entry.clientId ||
            row.competenceMonth !== entry.competenceMonth ||
            row.hours !== ""
          ) {
            return row;
          }
          return { ...row, hours: String(body.totalHours) };
        }),
      );
    })();
  }, [entries, onChange, projectId]);

  function updateSkillLines(clientId: string, skillLines: CostLineDraft[]) {
    onChange(
      entries.map((entry) => {
        if (entry.clientId !== clientId || entry.isLocked) return entry;
        const amount = sumCostLines(skillLines);
        return {
          ...entry,
          skillLines,
          amount: String(amount),
          billingLines: applyAutoBillingAmounts(amount, entry.billingLines, true),
        };
      }),
    );
  }

  function updateEntry(
    clientId: string,
    changes: Partial<VariableRevenueEntryDraft>,
    options?: { redistributeBilling?: boolean },
  ) {
    onChange(
      entries.map((entry) => {
        if (entry.clientId !== clientId) return entry;
        const onlyTitle =
          entry.isLocked &&
          Object.keys(changes).length === 1 &&
          Object.prototype.hasOwnProperty.call(changes, "title");
        if (entry.isLocked && !onlyTitle) return entry;
        const next = { ...entry, ...changes };
        if (Object.prototype.hasOwnProperty.call(changes, "title")) {
          const syncedTitle = String(next.title).trim();
          if (syncedTitle) {
            next.billingLines = next.billingLines.map((line) => ({
              ...line,
              milestone: syncedTitle,
            }));
          }
        }
        if (options?.redistributeBilling) {
          next.billingLines = applyAutoBillingAmounts(
            Number(next.amount) || 0,
            next.billingLines,
            true,
          );
        }
        return next;
      }),
    );
  }

  function updateBillingLines(clientId: string, lines: BillingLineDraft[]) {
    updateEntry(clientId, { billingLines: renumberBillingInstallments(lines) });
  }

  function updateBillingAmount(entryClientId: string, lineClientId: string, amount: string) {
    const entry = entries.find((row) => row.clientId === entryClientId);
    if (!entry || entry.isLocked) return;
    const index = entry.billingLines.findIndex((row) => row.clientId === lineClientId);
    if (index < 0) return;
    const updated = entry.billingLines.map((row) =>
      row.clientId === lineClientId ? { ...row, amount } : row,
    );
    updateEntry(entryClientId, {
      billingLines: redistributeBillingAmountsAfterEdit(
        Number(entry.amount) || 0,
        updated,
        index,
        amount,
      ),
    });
  }

  function updateBillingDueDate(entryClientId: string, lineClientId: string, dueDate: string) {
    const entry = entries.find((row) => row.clientId === entryClientId);
    if (!entry || entry.isLocked) return;
    const index = entry.billingLines.findIndex((row) => row.clientId === lineClientId);
    if (index < 0) return;
    const current = entry.billingLines[index]!;
    const syncExpected =
      !current.expectedPaymentDate || current.expectedPaymentDate === current.dueDate;
    const updated = entry.billingLines.map((row) =>
      row.clientId === lineClientId
        ? {
            ...row,
            dueDate,
            expectedPaymentDate: syncExpected ? dueDate : row.expectedPaymentDate,
          }
        : row,
    );
    updateBillingLines(entryClientId, cascadeBillingDatesFrom(updated, index));
  }

  function updateBillingExpectedPaymentDate(
    entryClientId: string,
    lineClientId: string,
    expectedPaymentDate: string,
  ) {
    const entry = entries.find((row) => row.clientId === entryClientId);
    if (!entry || entry.isLocked) return;
    const current = entry.billingLines.find((row) => row.clientId === lineClientId);
    if (!current) return;
    updateBillingLines(
      entryClientId,
      entry.billingLines.map((row) =>
        row.clientId === lineClientId ? { ...row, expectedPaymentDate } : row,
      ),
    );
  }

  function addMeasurement() {
    const last = entries[entries.length - 1];
    const next = emptyVariableRevenueEntry(entries.length);
    next.billingLines = defaultInstallmentLines(0, 1, nextMeasurementFirstDueDate(entries));
    if (last?.skillLines.length) {
      next.skillLines = last.skillLines.map((line) => ({
        ...line,
        clientId: newClientId(),
        hours: "",
      }));
    }
    onChange([...entries, next]);
    expandOnly(next.clientId);
  }

  async function generateReceivable(entry: VariableRevenueEntryDraft) {
    if (!revenueId || !isPersistedVariableEntryId(entry.clientId) || entry.receivableGenerated) return;
    setGeneratingId(entry.clientId);
    setGenerateError(null);
    const response = await apiFetch(
      `/api/project-revenues/${encodeURIComponent(revenueId)}/variable-entries/${encodeURIComponent(entry.clientId)}/generate-receivable`,
      { method: "POST" },
    );
    const body = await response.json().catch(() => null);
    setGeneratingId(null);
    if (!response.ok) {
      setGenerateError(
        typeof body?.error === "string" ? body.error : "Erro ao gerar a conta a receber.",
      );
      return;
    }
    onReceivableGenerated?.(body ?? {});
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Medições da receita variável
          </h3>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            Registre cada mês de faturamento. As horas são sugeridas com base nos apontamentos do
            mês selecionado. Salve a receita e use &quot;Gerar conta a receber&quot; em cada
            medição para lançar as parcelas.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Total medido
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatarMoeda(total)}</p>
          <p className="text-[11px] text-[color:var(--muted-foreground)]">
            {entries.length} medição{entries.length === 1 ? "" : "ões"}
          </p>
        </div>
      </div>
      {generateError && (
        <p className="text-xs text-red-600">{generateError}</p>
      )}

      <div className="space-y-2">
        {entries.map((entry, index) => {
          const locked = disabled || Boolean(entry.isLocked);
          const expanded = expandedIds.has(entry.clientId);
          const amount = Number(entry.amount) || sumCostLines(entry.skillLines);
          const skillHoursSum = sumSkillHours(entry.skillLines);
          const referenceHours = Number(entry.hours) || 0;
          const hoursMismatch =
            referenceHours > 0 &&
            skillHoursSum > 0 &&
            Math.round(referenceHours * 100) !== Math.round(skillHoursSum * 100);
          const billingTotal = sumBillingLines(entry.billingLines);
          const totalsMismatch =
            entry.billingLines.length > 0 &&
            Math.round(billingTotal * 100) !== Math.round(amount * 100);
          const displayTitle = entry.title.trim() || `Medição ${index + 1}`;
          const persisted = isPersistedVariableEntryId(entry.clientId);
          const generating = generatingId === entry.clientId;
          const generateDisabled =
            disabled ||
            Boolean(entry.receivableGenerated) ||
            !revenueId ||
            !persisted ||
            generating;
          const generateTitle = entry.receivableGenerated
            ? "Conta a receber já gerada para esta medição"
            : !revenueId || !persisted
              ? "Salve a receita antes de gerar a conta a receber"
              : "Gerar conta a receber desta medição";
          return (
            <div
              key={entry.clientId}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className={`flex flex-wrap items-center gap-2 px-3 py-2.5 transition-colors ${
                  expanded ? "border-b bg-black/[0.02]" : "hover:bg-black/[0.02]"
                }`}
                style={expanded ? { borderColor: "var(--border)" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.clientId)}
                  className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={expanded}
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[color:var(--muted-foreground)] transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-[color:var(--foreground)]">
                    {displayTitle}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]"
                    style={{ background: "rgba(0,0,0,0.05)" }}
                    title="Mês de faturamento (1ª parcela)"
                  >
                    {formatCompetenceMonth(billingMonthFromEntry(entry))}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
                    {formatarMoeda(amount)}
                  </span>
                  {entry.receivableGenerated && !entry.isLocked && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      Conta gerada
                    </span>
                  )}
                  {entry.isLocked && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Período vencido
                    </span>
                  )}
                  {totalsMismatch && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Parcelas divergentes
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={generateDisabled}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border))",
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}
                  title={generateTitle}
                  onClick={() => void generateReceivable(entry)}
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                  {entry.receivableGenerated
                    ? "Conta gerada"
                    : generating
                      ? "Gerando..."
                      : "Gerar conta a receber"}
                </button>
                <button
                  type="button"
                  disabled={locked || entries.length <= 1}
                  className="shrink-0 rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                  onClick={() => onChange(entries.filter((row) => row.clientId !== entry.clientId))}
                  title="Excluir medição"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {expanded && (
                <div className="space-y-3 p-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <input
                    className={`${formModalInputClass()} max-w-[280px] font-semibold`}
                    value={entry.title}
                    disabled={disabled}
                    placeholder={`Medição ${index + 1}`}
                    aria-label={`Título da medição ${index + 1}`}
                    onChange={(event) =>
                      updateEntry(entry.clientId, { title: event.target.value })
                    }
                    onBlur={() => {
                      if (entry.title.trim()) return;
                      updateEntry(entry.clientId, { title: `Medição ${index + 1}` });
                    }}
                  />
                </div>
                <p className="text-[11px] text-[color:var(--muted-foreground)]">
                  Este nome aparece no campo Activity da invoice.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className={formModalLabelClass}>Referente ao mês</label>
                  <input
                    type="month"
                    className={formModalInputClass()}
                    value={entry.competenceMonth}
                    disabled={locked}
                    onChange={(event) => {
                      const newMonth = event.target.value;
                      for (const key of [...requestedHours.current]) {
                        if (key.startsWith(`${entry.clientId}:`)) {
                          requestedHours.current.delete(key);
                        }
                      }
                      const billingLines =
                        entry.billingLines.length === 1
                          ? [
                              {
                                ...entry.billingLines[0]!,
                                dueDate: defaultFirstDueFromCompetence(
                                  newMonth,
                                  entry.billingLines[0]?.dueDate,
                                ),
                                expectedPaymentDate: defaultFirstDueFromCompetence(
                                  newMonth,
                                  entry.billingLines[0]?.expectedPaymentDate ||
                                    entry.billingLines[0]?.dueDate,
                                ),
                              },
                            ]
                          : entry.billingLines;
                      updateEntry(entry.clientId, {
                        competenceMonth: newMonth,
                        hours: "",
                        billingLines,
                      });
                    }}
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Mês dos apontamentos. O selo cinza é o faturamento (1ª parcela), em geral o mês
                    seguinte. Horas sugeridas de{" "}
                    {entry.competenceMonth || currentMonthIso()}.
                  </p>
                </div>
                <div className="md:col-span-3">
                  <label className={formModalLabelClass}>Descrição</label>
                  <input
                    className={formModalInputClass()}
                    value={entry.description}
                    disabled={locked}
                    placeholder="Ex.: Horas T&M de agosto"
                    onChange={(event) =>
                      updateEntry(entry.clientId, { description: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Horas apontadas (referência)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={formModalInputClass()}
                    value={entry.hours}
                    disabled={locked}
                    placeholder="0"
                    onChange={(event) =>
                      updateEntry(entry.clientId, { hours: event.target.value })
                    }
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Total de horas apontadas e aprovadas no projeto no mês selecionado. Distribua
                    esse total entre as skills abaixo.
                  </p>
                </div>
                <div>
                  <label className={formModalLabelClass}>Valor horas × taxa</label>
                  <input
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(String(hoursTimesClientRate(entry.hours, clientHourlyRate)))}
                    disabled
                    readOnly
                    placeholder="R$ 0,00"
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Taxa hora da receita × horas apontadas. Não altera o valor das skills.
                  </p>
                </div>
                <div>
                  <label className={formModalLabelClass}>Valor da medição</label>
                  <input
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(String(amount))}
                    disabled
                    readOnly
                    placeholder="R$ 0,00"
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Soma das skills: taxa hora × quantidade de cada linha.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Skills
                  </h4>
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Informe taxa hora e horas por perfil. O valor da medição é a soma de todas as
                    linhas.
                  </p>
                </div>
                {hoursMismatch && (
                  <p className="text-xs text-amber-700">
                    A soma das horas nas skills ({skillHoursSum}) difere das horas apontadas de
                    referência ({referenceHours}).
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className={tableClass} style={{ borderColor: "var(--border)" }}>
                    <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                      <tr>
                        <th className={thClass}>Skill</th>
                        <th className={thClass}>Taxa hora</th>
                        <th className={thClass}>Quantidade</th>
                        <th className={`${thClass} text-right`}>Valor total</th>
                        <th className={`${thClass} w-10`} />
                      </tr>
                    </thead>
                    <tbody>
                      {entry.skillLines.map((line) => (
                        <tr
                          key={line.clientId}
                          className="border-t"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              className={cellInputClass}
                              style={{ borderColor: "var(--border)" }}
                              value={line.skill}
                              disabled={locked}
                              placeholder="Ex: Consultor EWM"
                              onChange={(e) =>
                                updateSkillLines(
                                  entry.clientId,
                                  entry.skillLines.map((row) =>
                                    row.clientId === line.clientId
                                      ? { ...row, skill: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              className={cellInputClass}
                              style={{ borderColor: "var(--border)" }}
                              value={formatarMoedaInput(line.hourlyRate)}
                              placeholder="R$ 0,00"
                              disabled={locked}
                              onChange={(e) =>
                                updateSkillLines(
                                  entry.clientId,
                                  entry.skillLines.map((row) =>
                                    row.clientId === line.clientId
                                      ? {
                                          ...row,
                                          hourlyRate: parseMoedaInputToString(e.target.value),
                                        }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={cellInputClass}
                              style={{ borderColor: "var(--border)" }}
                              value={line.hours}
                              disabled={locked}
                              onChange={(e) =>
                                updateSkillLines(
                                  entry.clientId,
                                  entry.skillLines.map((row) =>
                                    row.clientId === line.clientId
                                      ? { ...row, hours: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatarMoeda(costLineValue(line))}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={locked || entry.skillLines.length <= 1}
                              className="text-red-600 disabled:opacity-40"
                              onClick={() =>
                                updateSkillLines(
                                  entry.clientId,
                                  entry.skillLines.filter((row) => row.clientId !== line.clientId),
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2" colSpan={3}>
                          TOTAL
                        </td>
                        <td className="px-3 py-2 text-right">{formatarMoeda(amount)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    updateSkillLines(entry.clientId, [...entry.skillLines, defaultCostLine()])
                  }
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar skill
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Faturamento
                  </h4>
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Parcelas com vencimento, previsão de pagamento e valor. A conta a receber só
                    é criada ao clicar em &quot;Gerar conta a receber&quot;.
                  </p>
                </div>
                {totalsMismatch && (
                  <p className="text-xs text-amber-700">
                    O total das parcelas ({formatarMoeda(billingTotal)}) difere do valor da medição (
                    {formatarMoeda(amount)}).
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className={tableClass} style={{ borderColor: "var(--border)" }}>
                    <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                      <tr>
                        <th className={`${thClass} text-center`}>Parcela</th>
                        <th className={thClass}>Data</th>
                        <th className={thClass}>Prev. pagamento</th>
                        <th className={`${thClass} text-right`}>Valor</th>
                        <th className={`${thClass} w-10`} />
                      </tr>
                    </thead>
                    <tbody>
                      {entry.billingLines.map((line) => {
                        const lineLocked = locked;
                        return (
                          <tr
                            key={line.clientId}
                            className="border-t"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <td className="px-3 py-2 text-center text-[color:var(--muted-foreground)]">
                              {line.installmentNumber}
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="date"
                                className={cellInputClass}
                                style={{ borderColor: "var(--border)" }}
                                value={line.dueDate}
                                disabled={lineLocked}
                                onChange={(event) =>
                                  updateBillingDueDate(
                                    entry.clientId,
                                    line.clientId,
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="date"
                                className={cellInputClass}
                                style={{ borderColor: "var(--border)" }}
                                value={line.expectedPaymentDate || line.dueDate}
                                disabled={lineLocked}
                                onChange={(event) =>
                                  updateBillingExpectedPaymentDate(
                                    entry.clientId,
                                    line.clientId,
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={`${cellInputClass} text-right`}
                                style={{ borderColor: "var(--border)" }}
                                value={line.amount}
                                disabled={lineLocked}
                                onChange={(event) =>
                                  updateBillingAmount(
                                    entry.clientId,
                                    line.clientId,
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                disabled={
                                  locked ||
                                  entry.billingLines.length <= 1
                                }
                                className="text-red-600 disabled:opacity-40"
                                onClick={() => {
                                  const next = renumberBillingInstallments(
                                    entry.billingLines.filter(
                                      (row) => row.clientId !== line.clientId,
                                    ),
                                  );
                                  updateEntry(entry.clientId, {
                                    billingLines: applyAutoBillingAmounts(amount, next, true),
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 inline" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t font-semibold" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2" colSpan={3}>
                          TOTAL
                        </td>
                        <td className="px-3 py-2 text-right">{formatarMoeda(billingTotal)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    const next = renumberBillingInstallments([
                      ...entry.billingLines,
                      {
                        clientId: newBillingClientId(),
                        milestone: "",
                        installmentNumber: String(entry.billingLines.length + 1),
                        dueDate: nextBillingDueFromLines(entry.billingLines),
                        expectedPaymentDate: nextBillingDueFromLines(entry.billingLines),
                        amount: "",
                      },
                    ]);
                    updateEntry(entry.clientId, {
                      billingLines: applyAutoBillingAmounts(amount, next, true),
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar parcela
                </button>
              </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={addMeasurement}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs font-medium disabled:opacity-60"
        style={{ borderColor: "var(--border)" }}
      >
        <Plus className="h-4 w-4" />
        Adicionar medição
      </button>

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
      >
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Soma de todas as medições ({entries.length})
        </p>
        <p className="text-sm font-semibold tabular-nums">Total medido: {formatarMoeda(total)}</p>
      </div>
    </section>
  );
}
