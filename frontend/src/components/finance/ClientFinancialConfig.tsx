"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarTelefone } from "@/lib/brFormatters";

type ClientFinancial = {
  razaoSocial: string | null;
  ie: string | null;
  ieIsento: boolean;
  condicoesPagamento: string | null;
  prazoMedioPagamentoDias: number | null;
  moedaContrato: string;
  retencaoImpostos: string | null;
  dadosFaturamento: string | null;
  contatoFinNome: string | null;
  contatoFinEmail: string | null;
  contatoFinCel: string | null;
};

type ClientFinancialConfigProps = {
  clientId: string;
};

const MOEDAS = ["BRL", "USD", "EUR"];

const emptyForm = {
  razaoSocial: "",
  ie: "",
  ieIsento: false,
  condicoesPagamento: "",
  prazoMedioPagamentoDias: "",
  moedaContrato: "BRL",
  retencaoImpostos: "",
  dadosFaturamento: "",
  contatoFinNome: "",
  contatoFinEmail: "",
  contatoFinCel: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const labelClass = "block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5";

export function ClientFinancialConfig({ clientId }: ClientFinancialConfigProps) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/clients/${clientId}/financial`);
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Erro ao carregar dados financeiros.");
      }
      const f: ClientFinancial | null = data?.financial ?? null;
      if (f) {
        setForm({
          razaoSocial: f.razaoSocial ?? "",
          ie: f.ie ?? "",
          ieIsento: f.ieIsento,
          condicoesPagamento: f.condicoesPagamento ?? "",
          prazoMedioPagamentoDias: f.prazoMedioPagamentoDias != null ? String(f.prazoMedioPagamentoDias) : "",
          moedaContrato: f.moedaContrato || "BRL",
          retencaoImpostos: f.retencaoImpostos ?? "",
          dadosFaturamento: f.dadosFaturamento ?? "",
          contatoFinNome: f.contatoFinNome ?? "",
          contatoFinEmail: f.contatoFinEmail ?? "",
          contatoFinCel: f.contatoFinCel ?? "",
        });
      } else {
        setForm(emptyForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSuccess(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await apiFetch(`/api/clients/${clientId}/financial`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razaoSocial: form.razaoSocial.trim() || null,
          ie: form.ieIsento ? null : form.ie.trim() || null,
          ieIsento: form.ieIsento,
          condicoesPagamento: form.condicoesPagamento.trim() || null,
          prazoMedioPagamentoDias: form.prazoMedioPagamentoDias.trim() || null,
          moedaContrato: form.moedaContrato,
          retencaoImpostos: form.retencaoImpostos.trim() || null,
          dadosFaturamento: form.dadosFaturamento.trim() || null,
          contatoFinNome: form.contatoFinNome.trim() || null,
          contatoFinEmail: form.contatoFinEmail.trim() || null,
          contatoFinCel: form.contatoFinCel.trim() || null,
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível salvar.");
      }
      setSuccess("Dados financeiros salvos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Dados Financeiros</h2>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Carregando...</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Razão social</label>
              <input value={form.razaoSocial} onChange={(e) => setField("razaoSocial", e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className={labelClass}>Inscrição estadual</label>
                <input
                  value={form.ie}
                  onChange={(e) => setField("ie", e.target.value)}
                  disabled={form.ieIsento}
                  className={inputClass}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input type="checkbox" checked={form.ieIsento} onChange={(e) => setField("ieIsento", e.target.checked)} />
                Isento
              </label>
            </div>
            <div>
              <label className={labelClass}>Moeda do contrato</label>
              <select value={form.moedaContrato} onChange={(e) => setField("moedaContrato", e.target.value)} className={inputClass}>
                {MOEDAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Condições de pagamento</label>
              <input
                value={form.condicoesPagamento}
                onChange={(e) => setField("condicoesPagamento", e.target.value)}
                placeholder="Ex.: 30/60/90 dias"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Prazo médio de pagamento (dias)</label>
              <input
                type="number"
                min={0}
                value={form.prazoMedioPagamentoDias}
                onChange={(e) => setField("prazoMedioPagamentoDias", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Retenção de impostos</label>
              <input
                value={form.retencaoImpostos}
                onChange={(e) => setField("retencaoImpostos", e.target.value)}
                placeholder="Ex.: ISS, IRRF, PIS/COFINS"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Dados de faturamento</label>
              <input
                value={form.dadosFaturamento}
                onChange={(e) => setField("dadosFaturamento", e.target.value)}
                placeholder="Instruções de nota/faturamento"
                className={inputClass}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contato financeiro</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Nome</label>
                <input value={form.contatoFinNome} onChange={(e) => setField("contatoFinNome", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>E-mail</label>
                <input value={form.contatoFinEmail} onChange={(e) => setField("contatoFinEmail", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Celular</label>
                <input
                  value={form.contatoFinCel}
                  onChange={(e) => setField("contatoFinCel", formatarTelefone(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
