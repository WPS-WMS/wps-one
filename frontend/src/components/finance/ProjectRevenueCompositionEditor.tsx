"use client";

import { useMemo, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatarMoeda } from "@/lib/brFormatters";
import {
  applyAutoBillingAmounts,
  costLineValue,
  defaultBillingLines,
  defaultCostLine,
  newClientId,
  renumberBillingInstallments,
  sumBillingLines,
  sumCostLines,
  type BillingLineDraft,
  type CostLineDraft,
} from "@/components/finance/projectRevenueCompositionUtils";

const cellInputClass =
  "w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--primary)]";
const tableClass = "min-w-full text-xs border rounded-xl overflow-hidden";
const thClass = "px-3 py-2 text-left font-semibold whitespace-nowrap";

type ProjectRevenueCompositionEditorProps = {
  costLines: CostLineDraft[];
  billingLines: BillingLineDraft[];
  autoBillingCalculation: boolean;
  onCostLinesChange: (lines: CostLineDraft[]) => void;
  onBillingLinesChange: (lines: BillingLineDraft[]) => void;
  onAutoBillingChange: (value: boolean) => void;
  disabled?: boolean;
  headerActions?: ReactNode;
  compact?: boolean;
};

export function ProjectRevenueCompositionEditor({
  costLines,
  billingLines,
  autoBillingCalculation,
  onCostLinesChange,
  onBillingLinesChange,
  onAutoBillingChange,
  disabled = false,
  headerActions,
  compact = false,
}: ProjectRevenueCompositionEditorProps) {
  const costTotal = useMemo(() => sumCostLines(costLines), [costLines]);
  const billingTotal = useMemo(() => sumBillingLines(billingLines), [billingLines]);
  const totalsMismatch = costLines.length > 0 && billingLines.length > 0 && costTotal !== billingTotal;

  function updateCostLines(next: CostLineDraft[]) {
    onCostLinesChange(next);
    if (autoBillingCalculation && next.length >= 0) {
      onBillingLinesChange(applyAutoBillingAmounts(sumCostLines(next), billingLines));
    }
  }

  function updateBillingLines(next: BillingLineDraft[], recalcAuto = false) {
    const normalized = renumberBillingInstallments(next);
    if (recalcAuto || autoBillingCalculation) {
      onBillingLinesChange(applyAutoBillingAmounts(costTotal, normalized));
      return;
    }
    onBillingLinesChange(normalized);
  }

  function toggleAutoBilling(enabled: boolean) {
    onAutoBillingChange(enabled);
    if (enabled) {
      onBillingLinesChange(applyAutoBillingAmounts(costTotal, billingLines));
    }
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <section className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Composição de custos
            </h3>
            {!compact && (
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Skills, taxa hora e quantidade de horas para calcular o valor total do projeto.
              </p>
            )}
          </div>
          {headerActions}
        </div>
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
              {costLines.map((line) => (
                <tr key={line.clientId} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1.5">
                    <input
                      className={cellInputClass}
                      style={{ borderColor: "var(--border)" }}
                      value={line.skill}
                      disabled={disabled}
                      placeholder="Ex: Consultor EWM"
                      onChange={(e) =>
                        updateCostLines(
                          costLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, skill: e.target.value } : row,
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
                      value={line.hourlyRate}
                      disabled={disabled}
                      onChange={(e) =>
                        updateCostLines(
                          costLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, hourlyRate: e.target.value } : row,
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
                      disabled={disabled}
                      onChange={(e) =>
                        updateCostLines(
                          costLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, hours: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatarMoeda(costLineValue(line))}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      className="text-red-600 disabled:opacity-40"
                      onClick={() => updateCostLines(costLines.filter((row) => row.clientId !== line.clientId))}
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
                <td className="px-3 py-2 text-right">{formatarMoeda(costTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => updateCostLines([...costLines, defaultCostLine()])}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar linha de custo
        </button>
      </section>

      <section className={compact ? "space-y-2" : "space-y-3"}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Faturamento
            </h3>
            {!compact && (
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Parcelas com marco, data de pagamento e valor.
              </p>
            )}
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
            <input
              type="checkbox"
              checked={autoBillingCalculation}
              disabled={disabled}
              onChange={(e) => toggleAutoBilling(e.target.checked)}
            />
            Cálculo automático
          </label>
        </div>

        {!autoBillingCalculation && totalsMismatch && (
          <p className="text-xs text-amber-700">
            O total do faturamento ({formatarMoeda(billingTotal)}) difere do total de custos ({formatarMoeda(costTotal)}).
          </p>
        )}

        <div className="overflow-x-auto">
          <table className={tableClass} style={{ borderColor: "var(--border)" }}>
            <thead style={{ background: "rgba(0,0,0,0.04)" }}>
              <tr>
                <th className={thClass}>Marco</th>
                <th className={`${thClass} text-center`}>Parcela</th>
                <th className={thClass}>Data</th>
                <th className={`${thClass} text-right`}>Valor</th>
                <th className={`${thClass} w-10`} />
              </tr>
            </thead>
            <tbody>
              {billingLines.map((line) => (
                <tr key={line.clientId} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1.5">
                    <input
                      className={cellInputClass}
                      style={{ borderColor: "var(--border)" }}
                      value={line.milestone}
                      disabled={disabled}
                      placeholder="Ex: Aceite da proposta"
                      onChange={(e) =>
                        updateBillingLines(
                          billingLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, milestone: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center text-[color:var(--muted-foreground)]">
                    {line.installmentNumber}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      className={cellInputClass}
                      style={{ borderColor: "var(--border)" }}
                      value={line.dueDate}
                      disabled={disabled}
                      onChange={(e) =>
                        updateBillingLines(
                          billingLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, dueDate: e.target.value } : row,
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
                      className={`${cellInputClass} text-right`}
                      style={{ borderColor: "var(--border)" }}
                      value={line.amount}
                      disabled={disabled || autoBillingCalculation}
                      readOnly={autoBillingCalculation}
                      onChange={(e) =>
                        updateBillingLines(
                          billingLines.map((row) =>
                            row.clientId === line.clientId ? { ...row, amount: e.target.value } : row,
                          ),
                          false,
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={disabled || billingLines.length <= 1}
                      className="text-red-600 disabled:opacity-40"
                      onClick={() =>
                        updateBillingLines(
                          billingLines.filter((row) => row.clientId !== line.clientId),
                          true,
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
                <td className="px-3 py-2 text-right">{formatarMoeda(billingTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const nextDue = new Date();
            nextDue.setMonth(nextDue.getMonth() + billingLines.length);
            updateBillingLines(
              [
                ...billingLines,
                {
                  clientId: newClientId(),
                  milestone: "",
                  installmentNumber: String(billingLines.length + 1),
                  dueDate: nextDue.toISOString().slice(0, 10),
                  amount: "0",
                },
              ],
              true,
            );
          }}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar parcela
        </button>
      </section>
    </div>
  );
}

export function emptyCompositionState() {
  return {
    costLines: [defaultCostLine()],
    billingLines: defaultBillingLines(),
    autoBillingCalculation: true,
  };
}

export function mapApiToDraft(revenue: {
  costLines?: Array<{ id: string; skill: string; hourlyRate: number; hours: number }>;
  billingLines?: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    amount: number;
  }>;
  autoBillingCalculation?: boolean;
}) {
  const costLines =
    revenue.costLines && revenue.costLines.length > 0
      ? revenue.costLines.map((line) => ({
          clientId: line.id,
          skill: line.skill,
          hourlyRate: String(line.hourlyRate),
          hours: String(line.hours),
        }))
      : [defaultCostLine()];

  const billingLines =
    revenue.billingLines && revenue.billingLines.length > 0
      ? revenue.billingLines.map((line) => ({
          clientId: line.id,
          milestone: line.milestone ?? "",
          installmentNumber: String(line.installmentNumber),
          dueDate: line.dueDate.slice(0, 10),
          amount: String(line.amount),
        }))
      : defaultBillingLines();

  return {
    costLines,
    billingLines,
    autoBillingCalculation: revenue.autoBillingCalculation !== false,
  };
}

export function draftToPayload(
  costLines: CostLineDraft[],
  billingLines: BillingLineDraft[],
  autoBillingCalculation: boolean,
) {
  return {
    autoBillingCalculation,
    costLines: costLines
      .filter((line) => line.skill.trim())
      .map((line, index) => ({
        skill: line.skill.trim(),
        hourlyRate: Number(line.hourlyRate) || 0,
        hours: Number(line.hours) || 0,
        sortOrder: index,
      })),
    billingLines: billingLines
      .filter((line) => line.dueDate)
      .map((line, index) => ({
        milestone: line.milestone.trim() || null,
        installmentNumber: Number(line.installmentNumber) || index + 1,
        dueDate: line.dueDate,
        amount: Number(line.amount) || 0,
        sortOrder: index,
      })),
  };
}

export function SaveButton({
  saving,
  onClick,
  disabled,
}: {
  saving: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving}
      className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
    >
      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
      Salvar receita
    </button>
  );
}
