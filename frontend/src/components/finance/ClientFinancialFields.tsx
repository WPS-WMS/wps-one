"use client";

import { formatarTelefone } from "@/lib/brFormatters";
import {
  CLIENT_FINANCIAL_MOEDAS,
  type ClientFinancialFormState,
} from "@/lib/clientFinancialForm";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ClientFinancialFieldsProps = {
  form: ClientFinancialFormState;
  onChange: <K extends keyof ClientFinancialFormState>(
    key: K,
    value: ClientFinancialFormState[K],
  ) => void;
};

export function ClientFinancialFields({ form, onChange }: ClientFinancialFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={formModalLabelClass}>Razão social</label>
          <input
            type="text"
            value={form.razaoSocial}
            onChange={(e) => onChange("razaoSocial", e.target.value)}
            className={formModalInputClass(false)}
            placeholder="Razão social para faturamento"
          />
        </div>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className={formModalLabelClass}>Inscrição estadual</label>
            <input
              type="text"
              value={form.ie}
              onChange={(e) => onChange("ie", e.target.value)}
              disabled={form.ieIsento}
              className={formModalInputClass(false)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)] pb-3">
            <input
              type="checkbox"
              checked={form.ieIsento}
              onChange={(e) => onChange("ieIsento", e.target.checked)}
            />
            Isento
          </label>
        </div>
        <div>
          <label className={formModalLabelClass}>Moeda do contrato</label>
          <select
            value={form.moedaContrato}
            onChange={(e) => onChange("moedaContrato", e.target.value)}
            className={formModalInputClass(false)}
          >
            {CLIENT_FINANCIAL_MOEDAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={formModalLabelClass}>Condições de pagamento</label>
          <input
            type="text"
            value={form.condicoesPagamento}
            onChange={(e) => onChange("condicoesPagamento", e.target.value)}
            placeholder="Ex.: 30/60/90 dias"
            className={formModalInputClass(false)}
          />
        </div>
        <div>
          <label className={formModalLabelClass}>Prazo médio de pagamento (dias)</label>
          <input
            type="number"
            min={0}
            value={form.prazoMedioPagamentoDias}
            onChange={(e) => onChange("prazoMedioPagamentoDias", e.target.value)}
            className={formModalInputClass(false)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={formModalLabelClass}>Retenção de impostos</label>
          <input
            type="text"
            value={form.retencaoImpostos}
            onChange={(e) => onChange("retencaoImpostos", e.target.value)}
            placeholder="Ex.: ISS, IRRF, PIS/COFINS"
            className={formModalInputClass(false)}
          />
        </div>
        <div>
          <label className={formModalLabelClass}>Dados de faturamento</label>
          <input
            type="text"
            value={form.dadosFaturamento}
            onChange={(e) => onChange("dadosFaturamento", e.target.value)}
            placeholder="Instruções de nota/faturamento"
            className={formModalInputClass(false)}
          />
        </div>
      </div>

      <div className="pt-1 border-t border-[color:var(--border)]/80">
        <p className="text-sm font-semibold text-[color:var(--foreground)] mb-3">Contato financeiro</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={formModalLabelClass}>Nome</label>
            <input
              type="text"
              value={form.contatoFinNome}
              onChange={(e) => onChange("contatoFinNome", e.target.value)}
              className={formModalInputClass(false)}
            />
          </div>
          <div>
            <label className={formModalLabelClass}>E-mail</label>
            <input
              type="email"
              value={form.contatoFinEmail}
              onChange={(e) => onChange("contatoFinEmail", e.target.value)}
              className={formModalInputClass(false)}
            />
          </div>
          <div>
            <label className={formModalLabelClass}>Celular</label>
            <input
              type="text"
              value={form.contatoFinCel}
              onChange={(e) => onChange("contatoFinCel", formatarTelefone(e.target.value))}
              className={formModalInputClass(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
