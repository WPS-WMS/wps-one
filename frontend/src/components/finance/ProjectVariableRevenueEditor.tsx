"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import { formModalInputClass, formModalLabelClass } from "@/components/FormModalPrimitives";

export type VariableRevenueEntryDraft = {
  clientId: string;
  competenceMonth: string;
  description: string;
  hours: string;
  hourlyRate: string;
  amount: string;
  installmentCount: string;
  firstDueDate: string;
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
  isLocked?: boolean;
};

function newClientId(): string {
  return `variable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function previousMonthIso(): string {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

export function emptyVariableRevenueEntry(): VariableRevenueEntryDraft {
  const today = localDateIso();
  return {
    clientId: newClientId(),
    competenceMonth: previousMonthIso(),
    description: "",
    hours: "",
    hourlyRate: "",
    amount: "",
    installmentCount: "1",
    firstDueDate: today,
  };
}

export function mapVariableEntriesToDraft(
  entries: VariableRevenueEntryApi[] | undefined,
): VariableRevenueEntryDraft[] {
  if (!entries?.length) return [emptyVariableRevenueEntry()];
  return entries.map((entry) => ({
    clientId: entry.id,
    competenceMonth: entry.competenceDate.slice(0, 7),
    description: entry.description ?? "",
    hours: entry.hours != null ? String(entry.hours) : "",
    hourlyRate: entry.hourlyRate != null ? String(entry.hourlyRate) : "",
    amount: String(entry.amount),
    installmentCount: String(entry.installmentCount),
    firstDueDate: entry.firstDueDate.slice(0, 10),
    isLocked: entry.isLocked,
  }));
}

export function variableEntriesToPayload(entries: VariableRevenueEntryDraft[]) {
  return entries.map((entry, index) => ({
    competenceDate: `${entry.competenceMonth}-01`,
    description: entry.description.trim() || null,
    hours: entry.hours === "" ? null : Number(entry.hours),
    hourlyRate: entry.hourlyRate === "" ? null : Number(entry.hourlyRate),
    amount: Number(entry.amount) || 0,
    installmentCount: Number(entry.installmentCount) || 1,
    firstDueDate: entry.firstDueDate,
    sortOrder: index,
  }));
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
      onChange((current) =>
        current.map((row) => {
          if (row.clientId !== entry.clientId || row.competenceMonth !== entry.competenceMonth) {
            return row;
          }
          const hours = String(body.totalHours);
          const amount =
            row.hourlyRate !== ""
              ? String(Math.round(body.totalHours * Number(row.hourlyRate) * 100) / 100)
              : row.amount;
          return { ...row, hours, amount };
        }),
      );
    })();
  }, [entries, onChange, projectId]);

  function updateEntry(
    clientId: string,
    changes: Partial<VariableRevenueEntryDraft>,
    recalculate = false,
  ) {
    onChange(
      entries.map((entry) => {
        if (entry.clientId !== clientId || entry.isLocked) return entry;
        const next = { ...entry, ...changes };
        if (recalculate && next.hours !== "" && next.hourlyRate !== "") {
          next.amount = String(
            Math.round(Number(next.hours) * Number(next.hourlyRate) * 100) / 100,
          );
        }
        return next;
      }),
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Medições da receita variável
        </h3>
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
          Registre cada competência. O valor pode ser calculado por horas × taxa ou ajustado
          manualmente, e cada medição pode ser parcelada.
        </p>
      </div>

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const locked = disabled || Boolean(entry.isLocked);
          const amount = Number(entry.amount) || 0;
          const installments = Math.max(Number(entry.installmentCount) || 1, 1);
          return (
            <div
              key={entry.clientId}
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
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
                    readOnly
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                    Calculado pelos apontamentos do projeto
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
                        true,
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
                    disabled={locked}
                    placeholder="R$ 0,00"
                    onChange={(event) =>
                      updateEntry(entry.clientId, {
                        amount: parseMoedaInputToString(event.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Nº de parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    className={formModalInputClass()}
                    value={entry.installmentCount}
                    disabled={locked}
                    onChange={(event) =>
                      updateEntry(entry.clientId, { installmentCount: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Primeiro vencimento</label>
                  <input
                    type="date"
                    className={formModalInputClass()}
                    value={entry.firstDueDate}
                    disabled={locked}
                    onChange={(event) =>
                      updateEntry(entry.clientId, { firstDueDate: event.target.value })
                    }
                  />
                </div>
                <div className="flex items-end md:col-span-3">
                  <p className="pb-2 text-xs text-[color:var(--muted-foreground)]">
                    Faturamento: {installments}x de aproximadamente{" "}
                    {formatarMoeda(amount / installments)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...entries, emptyVariableRevenueEntry()])}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar medição
        </button>
        <p className="text-sm font-semibold">Total medido: {formatarMoeda(total)}</p>
      </div>
    </section>
  );
}
