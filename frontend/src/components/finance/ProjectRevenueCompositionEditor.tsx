"use client";

import { useMemo, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Link } from "@/components/Link";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import { formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import {
  applyAutoBillingAmounts,
  cascadeBillingDatesFrom,
  costLineValue,
  defaultBillingLines,
  defaultCostLine,
  defaultDiscountLine,
  isPastBillingDate,
  netCostTotal,
  newClientId,
  nextBillingDueFromLines,
  redistributeBillingAmountsAfterEdit,
  renumberBillingInstallments,
  sumBillingLines,
  sumCostLines,
  sumDiscountLines,
  todayLocalIso,
  type BillingLineDraft,
  type CostLineDraft,
} from "@/components/finance/projectRevenueCompositionUtils";

const cellInputClass =
  "w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--primary)]";
const tableClass = "min-w-full text-xs border rounded-xl overflow-hidden";
const thClass = "px-3 py-2 text-left font-semibold whitespace-nowrap";

export type TaxTypeOption = {
  id: string;
  name: string;
  ratePercent: number | null;
};

const PAYMENT_METHOD_OPTIONS = [
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TED", label: "TED" },
] as const;

export type RevenuePaymentMethod = "" | "PIX" | "BOLETO" | "TED";

type ProjectRevenueCompositionEditorProps = {
  costLines: CostLineDraft[];
  billingLines: BillingLineDraft[];
  autoBillingCalculation: boolean;
  paymentMethod?: RevenuePaymentMethod;
  taxTypeId: string;
  taxTypes: TaxTypeOption[];
  onCostLinesChange: (lines: CostLineDraft[]) => void;
  onBillingLinesChange: (lines: BillingLineDraft[]) => void;
  onAutoBillingChange: (value: boolean) => void;
  onPaymentMethodChange?: (value: RevenuePaymentMethod) => void;
  onTaxTypeChange: (value: string) => void;
  impostosConfigHref?: string;
  disabled?: boolean;
  headerActions?: ReactNode;
  compact?: boolean;
};

export function ProjectRevenueCompositionEditor({
  costLines,
  billingLines,
  autoBillingCalculation,
  paymentMethod = "",
  taxTypeId,
  taxTypes,
  onCostLinesChange,
  onBillingLinesChange,
  onAutoBillingChange,
  onPaymentMethodChange,
  onTaxTypeChange,
  impostosConfigHref,
  disabled = false,
  headerActions,
  compact = false,
}: ProjectRevenueCompositionEditorProps) {
  const costTotal = useMemo(() => sumCostLines(costLines), [costLines]);
  const discountTotal = useMemo(() => sumDiscountLines(costLines), [costLines]);
  const netTotal = useMemo(() => netCostTotal(costLines), [costLines]);
  const hasDiscount = useMemo(() => costLines.some((line) => line.isDiscount), [costLines]);
  const billingTotal = useMemo(() => sumBillingLines(billingLines), [billingLines]);
  const totalsMismatch = costLines.length > 0 && billingLines.length > 0 && netTotal !== billingTotal;
  const selectedTax = useMemo(
    () => taxTypes.find((tax) => tax.id === taxTypeId) ?? null,
    [taxTypeId, taxTypes],
  );
  const estimatedTaxAmount = useMemo(() => {
    if (!selectedTax?.ratePercent || billingTotal <= 0) return null;
    return Math.round(billingTotal * (selectedTax.ratePercent / 100) * 100) / 100;
  }, [billingTotal, selectedTax]);

  function updateCostLines(next: CostLineDraft[]) {
    onCostLinesChange(next);
    if (autoBillingCalculation && next.length >= 0) {
      onBillingLinesChange(applyAutoBillingAmounts(netCostTotal(next), billingLines));
    }
  }

  function updateBillingLines(next: BillingLineDraft[]) {
    onBillingLinesChange(renumberBillingInstallments(next));
  }

  function updateBillingAmount(lineClientId: string, amount: string) {
    const index = billingLines.findIndex((row) => row.clientId === lineClientId);
    if (index < 0 || isPastBillingDate(billingLines[index]!.dueDate)) return;
    const updated = billingLines.map((row) =>
      row.clientId === lineClientId ? { ...row, amount } : row,
    );
    onBillingLinesChange(
      autoBillingCalculation
        ? redistributeBillingAmountsAfterEdit(netTotal, updated, index, amount)
        : renumberBillingInstallments(updated),
    );
  }

  function toggleAutoBilling(enabled: boolean) {
    onAutoBillingChange(enabled);
    if (enabled) {
      const firstEditableIndex = billingLines.findIndex(
        (line) => !isPastBillingDate(line.dueDate),
      );
      const withProgressiveDates =
        firstEditableIndex >= 0
          ? cascadeBillingDatesFrom(
              billingLines.map((line, index) =>
                index === firstEditableIndex && !line.dueDate
                  ? { ...line, dueDate: todayLocalIso() }
                  : line,
              ),
              firstEditableIndex,
            )
          : billingLines;
      onBillingLinesChange(applyAutoBillingAmounts(netTotal, withProgressiveDates, true));
      return;
    }
    // Ao desativar, preserva datas e valores já cadastrados.
    onBillingLinesChange(renumberBillingInstallments(billingLines));
  }

  function updateBillingDueDate(lineClientId: string, dueDate: string) {
    const index = billingLines.findIndex((row) => row.clientId === lineClientId);
    if (index < 0) return;
    if (isPastBillingDate(billingLines[index]!.dueDate) || isPastBillingDate(dueDate)) return;
    const updated = billingLines.map((row) =>
      row.clientId === lineClientId ? { ...row, dueDate } : row,
    );
    // Em automático, as datas seguintes acompanham; em manual, só a linha editada.
    updateBillingLines(
      autoBillingCalculation ? cascadeBillingDatesFrom(updated, index) : updated,
    );
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
        <div
          className="rounded-xl border p-3 space-y-2"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
        >
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--foreground)]">
              Imposto sobre a receita
            </h4>
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
              Vincule um imposto cadastrado em Configurações. O cálculo usa o faturamento bruto (parcelas), sem incluir
              reembolsos.
            </p>
          </div>
          {taxTypes.length === 0 ? (
            <p className="text-xs text-amber-800">
              Nenhum imposto cadastrado.{" "}
              {impostosConfigHref ? (
                <Link href={impostosConfigHref} className="font-medium underline hover:opacity-80">
                  Cadastrar em Configurações &gt; Impostos
                </Link>
              ) : (
                "Cadastre em Configurações > Impostos."
              )}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[color:var(--muted-foreground)]">
                  Tipo de imposto
                </label>
                <PopoverSelect
                  id="revenue-composition-tax-type"
                  value={taxTypeId}
                  disabled={disabled}
                  onChange={(v) => onTaxTypeChange(v)}
                  placeholder="Sem imposto"
                  options={[
                    { value: "", label: "Sem imposto" },
                    ...taxTypes.map((tax) => {
                      const rateLabel =
                        tax.ratePercent != null
                          ? ` (${tax.ratePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`
                          : "";
                      return { value: tax.id, label: `${tax.name}${rateLabel}` };
                    }),
                  ]}
                />
              </div>
              {estimatedTaxAmount != null && (
                <div className="rounded-lg border px-3 py-2 text-right" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Estimativa
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
                    {formatarMoeda(estimatedTaxAmount)}
                  </p>
                </div>
              )}
            </div>
          )}
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
              {costLines.map((line) =>
                line.isDiscount ? (
                  <tr key={line.clientId} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5">
                      <input
                        className={cellInputClass}
                        style={{ borderColor: "var(--border)" }}
                        value={line.skill}
                        disabled={disabled}
                        placeholder="Desconto"
                        onChange={(e) =>
                          updateCostLines(
                            costLines.map((row) =>
                              row.clientId === line.clientId ? { ...row, skill: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5" colSpan={2}>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={cellInputClass}
                        style={{ borderColor: "var(--border)" }}
                        value={formatarMoedaInput(line.hourlyRate)}
                        placeholder="R$ 0,00"
                        disabled={disabled}
                        onChange={(e) =>
                          updateCostLines(
                            costLines.map((row) =>
                              row.clientId === line.clientId
                                ? { ...row, hourlyRate: parseMoedaInputToString(e.target.value), hours: "1" }
                                : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-red-600">
                      {costLineValue(line) > 0 ? `- ${formatarMoeda(costLineValue(line))}` : formatarMoeda(0)}
                    </td>
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
                ) : (
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
                        type="text"
                        inputMode="numeric"
                        className={cellInputClass}
                        style={{ borderColor: "var(--border)" }}
                        value={formatarMoedaInput(line.hourlyRate)}
                        placeholder="R$ 0,00"
                        disabled={disabled}
                        onChange={(e) =>
                          updateCostLines(
                            costLines.map((row) =>
                              row.clientId === line.clientId
                                ? { ...row, hourlyRate: parseMoedaInputToString(e.target.value) }
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
                ),
              )}
              <tr className="border-t font-semibold" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2" colSpan={3}>
                  TOTAL
                </td>
                <td className="px-3 py-2 text-right">{formatarMoeda(costTotal)}</td>
                <td />
              </tr>
              {hasDiscount && (
                <tr className="border-t font-semibold" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2" colSpan={3}>
                    TOTAL COM DESCONTO
                  </td>
                  <td className="px-3 py-2 text-right">{formatarMoeda(netTotal)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateCostLines([...costLines, defaultDiscountLine()])}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar desconto
          </button>
        </div>
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
          <div className="flex flex-wrap items-end gap-2">
            <label className="inline-flex h-[38px] items-center gap-2 rounded-lg border px-3 text-xs" style={{ borderColor: "var(--border)" }}>
              <input
                type="checkbox"
                checked={autoBillingCalculation}
                disabled={disabled}
                onChange={(e) => toggleAutoBilling(e.target.checked)}
              />
              Cálculo automático
            </label>
            {onPaymentMethodChange && (
              <div className="min-w-[180px]">
                <label
                  className="mb-1 block text-[11px] font-medium text-[color:var(--muted-foreground)]"
                  htmlFor="revenue-composition-payment-method"
                >
                  Forma de pagamento
                </label>
                <PopoverSelect
                  id="revenue-composition-payment-method"
                  value={paymentMethod}
                  disabled={disabled}
                  onChange={(value) => onPaymentMethodChange(value as RevenuePaymentMethod)}
                  placeholder="Selecione…"
                  options={[
                    { value: "", label: "Selecione…" },
                    ...PAYMENT_METHOD_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    })),
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {!autoBillingCalculation && totalsMismatch && (
          <p className="text-xs text-amber-700">
            O total do faturamento ({formatarMoeda(billingTotal)}) difere do total de custos ({formatarMoeda(netTotal)}).
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
                      disabled={disabled || isPastBillingDate(line.dueDate)}
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
                      min={todayLocalIso()}
                      disabled={disabled || isPastBillingDate(line.dueDate)}
                      onChange={(e) => updateBillingDueDate(line.clientId, e.target.value)}
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
                      disabled={disabled || isPastBillingDate(line.dueDate)}
                      onChange={(e) => updateBillingAmount(line.clientId, e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={
                        disabled ||
                        billingLines.length <= 1 ||
                        isPastBillingDate(line.dueDate)
                      }
                      className="text-red-600 disabled:opacity-40"
                      onClick={() => {
                        const next = renumberBillingInstallments(
                          billingLines.filter((row) => row.clientId !== line.clientId),
                        );
                        onBillingLinesChange(
                          autoBillingCalculation
                            ? applyAutoBillingAmounts(netTotal, next, true)
                            : next,
                        );
                      }}
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
            const next = renumberBillingInstallments([
              ...billingLines,
              {
                clientId: newClientId(),
                milestone: "",
                installmentNumber: String(billingLines.length + 1),
                dueDate: autoBillingCalculation ? nextBillingDueFromLines(billingLines) : "",
                amount: "",
              },
            ]);
            onBillingLinesChange(
              autoBillingCalculation
                ? applyAutoBillingAmounts(netTotal, next, true)
                : next,
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
    taxTypeId: "",
  };
}

export function mapApiToDraft(revenue: {
  costLines?: Array<{ id: string; skill: string; hourlyRate: number; hours: number; isDiscount?: boolean }>;
  billingLines?: Array<{
    id: string;
    milestone: string | null;
    installmentNumber: number;
    dueDate: string;
    amount: number;
  }>;
  autoBillingCalculation?: boolean;
  taxTypeId?: string | null;
}) {
  const costLines =
    revenue.costLines && revenue.costLines.length > 0
      ? revenue.costLines.map((line) => ({
          clientId: line.id,
          skill: line.skill,
          hourlyRate: String(line.hourlyRate),
          hours: String(line.hours),
          isDiscount: line.isDiscount === true,
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
    taxTypeId: revenue.taxTypeId ?? "",
  };
}

export function draftToPayload(
  costLines: CostLineDraft[],
  billingLines: BillingLineDraft[],
  autoBillingCalculation: boolean,
  taxTypeId?: string | null,
) {
  return {
    autoBillingCalculation,
    taxTypeId: taxTypeId?.trim() || null,
    costLines: costLines
      .filter((line) => (line.isDiscount ? Number(line.hourlyRate) > 0 : line.skill.trim()))
      .map((line, index) => ({
        skill: line.skill.trim() || (line.isDiscount ? "Desconto" : ""),
        hourlyRate: Number(line.hourlyRate) || 0,
        hours: line.isDiscount ? 1 : Number(line.hours) || 0,
        isDiscount: line.isDiscount === true,
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
