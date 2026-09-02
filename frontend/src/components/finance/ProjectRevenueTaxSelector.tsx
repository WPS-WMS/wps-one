"use client";

import { useMemo } from "react";
import { Link } from "@/components/Link";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import { formatarMoeda } from "@/lib/brFormatters";

export type TaxTypeOption = {
  id: string;
  name: string;
  ratePercent: number | null;
};

type ProjectRevenueTaxSelectorProps = {
  id?: string;
  taxTypeId: string;
  taxTypes: TaxTypeOption[];
  billingTotal: number;
  onTaxTypeChange: (value: string) => void;
  impostosConfigHref?: string;
  disabled?: boolean;
};

export function ProjectRevenueTaxSelector({
  id = "revenue-tax-type",
  taxTypeId,
  taxTypes,
  billingTotal,
  onTaxTypeChange,
  impostosConfigHref,
  disabled = false,
}: ProjectRevenueTaxSelectorProps) {
  const selectedTax = useMemo(
    () => taxTypes.find((tax) => tax.id === taxTypeId) ?? null,
    [taxTypeId, taxTypes],
  );
  const estimatedTaxAmount = useMemo(() => {
    if (!selectedTax?.ratePercent || billingTotal <= 0) return null;
    return Math.round(billingTotal * (selectedTax.ratePercent / 100) * 100) / 100;
  }, [billingTotal, selectedTax]);

  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}
    >
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--foreground)]">
          Imposto sobre a receita
        </h4>
        <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
          Vincule um imposto cadastrado em Configurações. O valor é debitado do resultado do projeto com base no
          faturamento bruto (parcelas), sem incluir reembolsos.
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
              id={id}
              value={taxTypeId}
              disabled={disabled}
              onChange={onTaxTypeChange}
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
  );
}
