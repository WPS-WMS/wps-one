"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import { formModalInputClass, formModalLabelClass } from "@/components/FormModalPrimitives";
import {
  addMonthsToIso,
  applyAutoBillingAmounts,
  cascadeBillingDatesFrom,
  isPastBillingDate,
  newClientId as newBillingClientId,
  nextBillingDueFromLines,
  redistributeBillingAmountsAfterEdit,
  renumberBillingInstallments,
  sumBillingLines,
  todayLocalIso,
  type BillingLineDraft,
} from "@/components/finance/projectRevenueCompositionUtils";

export type VariableRevenueEntryDraft = {
  clientId: string;
  competenceMonth: string;
  description: string;
  hours: string;
  hourlyRate: string;
  amount: string;
  billingLines: BillingLineDraft[];
  isLocked?: boolean;
};

export type VariableRevenueEntryApi = {
  id: string;
  competenceDate: string;
  description: string | null;
  hours: number | null;
  hourlyRate: number | null;
  amount: number;
  installmentCount: number;
  firstDueDate: string;
  billingLines?: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    amount: number;
  }>;
  isLocked?: boolean;
};

const cellInputClass =
  "w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--primary)]";
const tableClass = "min-w-full text-xs border rounded-xl overflow-hidden";
const thClass = "px-3 py-2 text-left font-semibold whitespace-nowrap";

function newClientId(): string {
  return `variable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateIso(): string {
  return todayLocalIso();
}

function previousMonthIso(): string {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
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
        amount: "0",
      })),
      true,
    ),
  );
}

export function emptyVariableRevenueEntry(): VariableRevenueEntryDraft {
  return {
    clientId: newClientId(),
    competenceMonth: previousMonthIso(),
    description: "",
    hours: "",
    hourlyRate: "",
    amount: "",
    billingLines: defaultInstallmentLines(0, 1),
  };
}

export function mapVariableEntriesToDraft(
  entries: VariableRevenueEntryApi[] | undefined,
): VariableRevenueEntryDraft[] {
  if (!entries?.length) return [emptyVariableRevenueEntry()];
  return entries.map((entry) => {
    const amount = entry.amount;
    const billingLines =
      entry.billingLines && entry.billingLines.length > 0
        ? renumberBillingInstallments(
            entry.billingLines.map((line) => ({
              clientId: line.id,
              milestone: line.milestone ?? "",
              installmentNumber: String(line.installmentNumber),
              dueDate: String(line.dueDate).slice(0, 10),
              amount: String(line.amount),
            })),
          )
        : defaultInstallmentLines(
            amount,
            entry.installmentCount || 1,
            String(entry.firstDueDate).slice(0, 10),
          );
    const hourlyRate = entry.hourlyRate != null ? Number(entry.hourlyRate) : null;
    const hours =
      entry.hours != null && Number(entry.hours) > 0
        ? String(entry.hours)
        : hourlyRate && hourlyRate > 0 && amount > 0
          ? String(Math.round((amount / hourlyRate) * 100) / 100)
          : entry.hours != null
            ? String(entry.hours)
            : "";
    return {
      clientId: entry.id,
      competenceMonth: String(entry.competenceDate).slice(0, 7),
      description: entry.description ?? "",
      hours,
      hourlyRate: entry.hourlyRate != null ? String(entry.hourlyRate) : "",
      amount: String(amount),
      billingLines,
      isLocked: entry.isLocked,
    };
  });
}

export function variableEntriesToPayload(entries: VariableRevenueEntryDraft[]) {
  return entries.map((entry, index) => {
    const amount = Number(entry.amount) || 0;
    const billingLines = entry.billingLines
      .filter((line) => line.dueDate)
      .map((line, lineIndex) => ({
        milestone: line.milestone.trim() || null,
        installmentNumber: Number(line.installmentNumber) || lineIndex + 1,
        dueDate: line.dueDate,
        amount: Number(line.amount) || 0,
        sortOrder: lineIndex,
      }));
    const firstDueDate = billingLines[0]?.dueDate ?? localDateIso();
    return {
      competenceDate: `${entry.competenceMonth}-01`,
      description: entry.description.trim() || null,
      hours: (() => {
        if (entry.hours !== "" && Number.isFinite(Number(entry.hours)) && Number(entry.hours) > 0) {
          return Number(entry.hours);
        }
        const rate = Number(entry.hourlyRate);
        if (amount > 0 && Number.isFinite(rate) && rate > 0) {
          return Math.round((amount / rate) * 100) / 100;
        }
        return entry.hours === "" ? null : Number(entry.hours);
      })(),
      hourlyRate: entry.hourlyRate === "" ? null : Number(entry.hourlyRate),
      amount,
      installmentCount: billingLines.length || 1,
      firstDueDate,
      billingLines,
      sortOrder: index,
    };
  });
}

export function ProjectVariableRevenueEditor({
  projectId,
  entries,
  onChange,
  disabled = false,
}: {
  projectId: string;
  entries: VariableRevenueEntryDraft[];
  onChange: Dispatch<SetStateAction<VariableRevenueEntryDraft[]>>;
  disabled?: boolean;
}) {
  const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const requestedHours = useRef(new Set<string>());

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
          const hours = String(body.totalHours);
          const amount =
            row.hourlyRate !== ""
              ? Math.round(body.totalHours * Number(row.hourlyRate) * 100) / 100
              : Number(row.amount) || 0;
          return {
            ...row,
            hours,
            amount: String(amount),
            billingLines: applyAutoBillingAmounts(amount, row.billingLines, true),
          };
        }),
      );
    })();
  }, [entries, onChange, projectId]);

  function updateEntry(
    clientId: string,
    changes: Partial<VariableRevenueEntryDraft>,
    options?: { recalculateAmount?: boolean; redistributeBilling?: boolean },
  ) {
    onChange(
      entries.map((entry) => {
        if (entry.clientId !== clientId || entry.isLocked) return entry;
        const next = { ...entry, ...changes };
        if (options?.recalculateAmount && next.hours !== "" && next.hourlyRate !== "") {
          next.amount = String(
            Math.round(Number(next.hours) * Number(next.hourlyRate) * 100) / 100,
          );
        }
        if (options?.redistributeBilling || options?.recalculateAmount) {
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
    if (index < 0 || isPastBillingDate(entry.billingLines[index]!.dueDate)) return;
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
    if (isPastBillingDate(entry.billingLines[index]!.dueDate) || isPastBillingDate(dueDate)) return;
    const updated = entry.billingLines.map((row) =>
      row.clientId === lineClientId ? { ...row, dueDate } : row,
    );
    updateBillingLines(entryClientId, cascadeBillingDatesFrom(updated, index));
  }

  function addMeasurement() {
    const last = entries[entries.length - 1];
    const next = emptyVariableRevenueEntry();
    if (last?.hourlyRate) {
      next.hourlyRate = last.hourlyRate;
    }
    onChange([...entries, next]);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Medições da receita variável
          </h3>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            Registre cada competência. Defina as parcelas com data e valor — elas vão para contas a
            receber.
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

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const locked = disabled || Boolean(entry.isLocked);
          const amount = Number(entry.amount) || 0;
          const billingTotal = sumBillingLines(entry.billingLines);
          const totalsMismatch =
            entry.billingLines.length > 0 &&
            Math.round(billingTotal * 100) !== Math.round(amount * 100);
          return (
            <div
              key={entry.clientId}
              className="rounded-xl border p-3 space-y-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Medição {index + 1}</p>
                <div className="flex items-center gap-2">
                  {entry.isLocked && (
                    <span className="text-[11px] text-amber-700">Período já vencido</span>
                  )}
                  <button
                    type="button"
                    disabled={locked || entries.length <= 1}
                    className="text-red-600 disabled:opacity-40"
                    onClick={() => onChange(entries.filter((row) => row.clientId !== entry.clientId))}
                    title="Excluir medição"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className={formModalLabelClass}>Competência</label>
                  <input
                    type="month"
                    className={formModalInputClass()}
                    value={entry.competenceMonth}
                    max={previousMonthIso()}
                    disabled={locked}
                    onChange={(event) =>
                      updateEntry(entry.clientId, {
                        competenceMonth: event.target.value,
                        hours: "",
                      })
                    }
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Faturamento de mês encerrado
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
                  <label className={formModalLabelClass}>Horas apontadas</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={formModalInputClass()}
                    value={entry.hours}
                    disabled={locked}
                    placeholder="0"
                    onChange={(event) =>
                      updateEntry(
                        entry.clientId,
                        { hours: event.target.value },
                        { recalculateAmount: true },
                      )
                    }
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Informe as horas do mês. Se houver apontamento no projeto, o total é sugerido.
                    Valor da medição = horas × taxa hora.
                  </p>
                </div>
                <div>
                  <label className={formModalLabelClass}>Taxa hora</label>
                  <input
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(entry.hourlyRate)}
                    disabled={locked}
                    placeholder="R$ 0,00"
                    onChange={(event) =>
                      updateEntry(
                        entry.clientId,
                        { hourlyRate: parseMoedaInputToString(event.target.value) },
                        { recalculateAmount: true },
                      )
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Valor da medição</label>
                  <input
                    inputMode="numeric"
                    className={formModalInputClass()}
                    value={formatarMoedaInput(entry.amount)}
                    disabled
                    readOnly
                    placeholder="R$ 0,00"
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Calculado automaticamente: horas × taxa hora.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Faturamento
                  </h4>
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Parcelas com data de vencimento e valor (contas a receber).
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
                        <th className={`${thClass} text-right`}>Valor</th>
                        <th className={`${thClass} w-10`} />
                      </tr>
                    </thead>
                    <tbody>
                      {entry.billingLines.map((line) => {
                        const lineLocked = locked || isPastBillingDate(line.dueDate);
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
                                min={todayLocalIso()}
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
                                  entry.billingLines.length <= 1 ||
                                  isPastBillingDate(line.dueDate)
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
                        <td className="px-3 py-2" colSpan={2}>
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
