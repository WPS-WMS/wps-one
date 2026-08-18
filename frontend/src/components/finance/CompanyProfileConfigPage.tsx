"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import { formatarCep, formatarCnpj, formatarTelefone } from "@/lib/brFormatters";
import {
  FormModalSection,
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { ArrowLeft, Loader2 } from "lucide-react";

const PERMISSION = "configuracoes.financeiro.empresa";
const API_PATH = "/api/company-profile";

const REGIME_OPTIONS = [
  { value: "", label: "Selecione..." },
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro presumido" },
  { value: "LUCRO_REAL", label: "Lucro real" },
  { value: "MEI", label: "MEI" },
  { value: "OUTRO", label: "Outro" },
] as const;

type CompanyProfileForm = {
  nomeFantasia: string;
  razaoSocial: string;
  email: string;
  telefone: string;
  site: string;
  cnpj: string;
  ie: string;
  ieIsento: boolean;
  im: string;
  regimeTributario: string;
  cnae: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  codigoMunicipio: string;
  banco: string;
  agencia: string;
  conta: string;
  pixKey: string;
  titularConta: string;
  pais: string;
  invoiceBanco: string;
  invoiceTitularConta: string;
  iban: string;
  bancoSwift: string;
  bancoEndereco: string;
  intermediarioBanco: string;
  intermediarioSwift: string;
  intermediarioMoeda: string;
  invoicePrefix: string;
  invoiceNextNumber: string;
  invoicePadLength: string;
  debitNotePrefix: string;
  debitNoteNextNumber: string;
  debitNotePadLength: string;
  debitNoteIncludeYear: boolean;
};

const EMPTY_FORM: CompanyProfileForm = {
  nomeFantasia: "",
  razaoSocial: "",
  email: "",
  telefone: "",
  site: "",
  cnpj: "",
  ie: "",
  ieIsento: false,
  im: "",
  regimeTributario: "",
  cnae: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  codigoMunicipio: "",
  banco: "",
  agencia: "",
  conta: "",
  pixKey: "",
  titularConta: "",
  pais: "Brazil",
  invoiceBanco: "",
  invoiceTitularConta: "",
  iban: "",
  bancoSwift: "",
  bancoEndereco: "",
  intermediarioBanco: "",
  intermediarioSwift: "",
  intermediarioMoeda: "",
  invoicePrefix: "",
  invoiceNextNumber: "1",
  invoicePadLength: "8",
  debitNotePrefix: "",
  debitNoteNextNumber: "1",
  debitNotePadLength: "8",
  debitNoteIncludeYear: true,
};

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numStr(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const parsed = Number.parseInt(str(value), 10);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function formatDocPreview(params: {
  prefix: string;
  next: string;
  pad: string;
  defaultPad: number;
  maxPad: number;
  year?: number;
  includeYear?: boolean;
  padWithZeros?: boolean;
}): string {
  const maxDigits = Math.min(
    params.maxPad,
    Math.max(1, Number.parseInt(params.pad, 10) || params.defaultPad),
  );
  const maxValue = 10 ** maxDigits - 1;
  const n = Math.min(maxValue, Math.max(1, Number.parseInt(params.next, 10) || 1));
  const core = params.padWithZeros === false ? String(n) : String(n).padStart(maxDigits, "0");
  const withYear = params.includeYear && params.year != null ? `${core}/${params.year}` : core;
  const prefix = params.prefix.trim();
  return prefix ? `${prefix}${withYear}` : withYear;
}

function formFromApi(body: Record<string, unknown> | null): CompanyProfileForm {
  if (!body) return { ...EMPTY_FORM };
  return {
    nomeFantasia: str(body.nomeFantasia),
    razaoSocial: str(body.razaoSocial),
    email: str(body.email),
    telefone: body.telefone ? formatarTelefone(str(body.telefone)) : "",
    site: str(body.site),
    cnpj: body.cnpj ? formatarCnpj(str(body.cnpj)) : "",
    ie: str(body.ie),
    ieIsento: Boolean(body.ieIsento),
    im: str(body.im),
    regimeTributario: str(body.regimeTributario),
    cnae: str(body.cnae),
    cep: body.cep ? formatarCep(str(body.cep)) : "",
    endereco: str(body.endereco),
    numero: str(body.numero),
    complemento: str(body.complemento),
    bairro: str(body.bairro),
    cidade: str(body.cidade),
    estado: str(body.estado).toUpperCase(),
    codigoMunicipio: str(body.codigoMunicipio),
    banco: str(body.banco),
    agencia: str(body.agencia),
    conta: str(body.conta),
    pixKey: str(body.pixKey),
    titularConta: str(body.titularConta),
    pais: str(body.pais) || "Brazil",
    invoiceBanco: str(body.invoiceBanco),
    invoiceTitularConta: str(body.invoiceTitularConta),
    iban: str(body.iban),
    bancoSwift: str(body.bancoSwift),
    bancoEndereco: str(body.bancoEndereco),
    intermediarioBanco: str(body.intermediarioBanco),
    intermediarioSwift: str(body.intermediarioSwift),
    intermediarioMoeda: str(body.intermediarioMoeda),
    invoicePrefix: str(body.invoicePrefix),
    invoiceNextNumber: numStr(body.invoiceNextNumber, "1"),
    invoicePadLength: numStr(body.invoicePadLength, "8"),
    debitNotePrefix: str(body.debitNotePrefix),
    debitNoteNextNumber: numStr(body.debitNoteNextNumber, "1"),
    debitNotePadLength: numStr(body.debitNotePadLength, "8"),
    debitNoteIncludeYear: body.debitNoteIncludeYear !== false,
  };
}

type BankReplicate = "none" | "debit-to-invoice" | "invoice-to-debit";

function copyDebitNoteBankToInvoice(
  form: CompanyProfileForm,
): Pick<CompanyProfileForm, "invoiceBanco" | "invoiceTitularConta" | "iban"> {
  return {
    invoiceBanco: form.banco,
    invoiceTitularConta: form.titularConta,
    iban: form.conta,
  };
}

function copyInvoiceBankToDebitNote(
  form: CompanyProfileForm,
): Pick<CompanyProfileForm, "banco" | "titularConta" | "conta"> {
  return {
    banco: form.invoiceBanco,
    titularConta: form.invoiceTitularConta,
    conta: form.iban,
  };
}

export function CompanyProfileConfigPage() {
  const { loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const canAccess = useMemo(
    () => isFinanceiroModuleEnabled() && can(PERMISSION),
    [can],
  );

  const [form, setForm] = useState<CompanyProfileForm>(EMPTY_FORM);
  const [loadingForm, setLoadingForm] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [bankReplicate, setBankReplicate] = useState<BankReplicate>("none");

  const patch = useCallback(<K extends keyof CompanyProfileForm>(key: K, value: CompanyProfileForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patchBank = useCallback(
    (key: keyof CompanyProfileForm, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (bankReplicate === "debit-to-invoice") {
          return { ...next, ...copyDebitNoteBankToInvoice(next) };
        }
        if (bankReplicate === "invoice-to-debit") {
          return { ...next, ...copyInvoiceBankToDebitNote(next) };
        }
        return next;
      });
    },
    [bankReplicate],
  );

  const load = useCallback(async () => {
    setLoadingForm(true);
    try {
      const r = await apiFetch(API_PATH);
      const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível carregar o cadastro da empresa.");
        return;
      }
      setError(null);
      setForm(formFromApi(body));
      setBankReplicate("none");
    } finally {
      setLoadingForm(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  async function buscarCep() {
    const cepLimpo = form.cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        complemento?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        ibge?: string;
      };
      if (data?.erro) return;
      setForm((prev) => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: (data.uf || prev.estado).toUpperCase().slice(0, 2),
        codigoMunicipio: data.ibge || prev.codigoMunicipio,
      }));
    } catch {
      /* ViaCEP indisponível — o usuário preenche manualmente */
    } finally {
      setLoadingCep(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await apiFetch(API_PATH, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ie: form.ieIsento ? "" : form.ie,
        }),
      });
      const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setForm(formFromApi(body));
      setOkMsg("Cadastro da empresa salvo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FinanceiroModuleGuard>
      <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
        <button
          type="button"
          onClick={() => navigateBack(router, `${basePath}/configuracoes/financeiro`)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{
            borderColor: "var(--border)",
            background: "rgba(0,0,0,0.06)",
            color: "var(--foreground)",
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-xl font-semibold text-[color:var(--foreground)] md:text-2xl">
              Cadastro da empresa
            </h1>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)] md:text-sm">
              Dados da sua empresa no WPS One. Serão usados na emissão de notas de débito e invoices.
            </p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            {!canAccess ? (
              <p className="mt-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</p>
            ) : loading || loadingForm ? (
              <div className="mt-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
              </div>
            ) : (
              <form
                className="space-y-5 pb-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
                {okMsg && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {okMsg}
                  </p>
                )}

                <FormModalSection
                  title="Cadastro da empresa"
                  description="Identificação e contato da pessoa jurídica."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={formModalLabelClass}>Nome fantasia</label>
                      <input
                        type="text"
                        value={form.nomeFantasia}
                        onChange={(e) => patch("nomeFantasia", e.target.value)}
                        className={formModalInputClass()}
                        placeholder="Ex.: WPS One"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Razão social</label>
                      <input
                        type="text"
                        value={form.razaoSocial}
                        onChange={(e) => patch("razaoSocial", e.target.value)}
                        className={formModalInputClass()}
                        placeholder="Ex.: WPS Tecnologia Ltda"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>E-mail</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => patch("email", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Telefone</label>
                      <input
                        type="text"
                        value={form.telefone}
                        onChange={(e) => patch("telefone", formatarTelefone(e.target.value))}
                        className={formModalInputClass()}
                        inputMode="tel"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={formModalLabelClass}>Site</label>
                      <input
                        type="text"
                        value={form.site}
                        onChange={(e) => patch("site", e.target.value)}
                        className={formModalInputClass()}
                        placeholder="https://"
                      />
                    </div>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Dados fiscais"
                  description="CNPJ e inscrições usados em documentos fiscais e invoices."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={formModalLabelClass}>CNPJ</label>
                      <input
                        type="text"
                        value={form.cnpj}
                        onChange={(e) => patch("cnpj", formatarCnpj(e.target.value))}
                        className={formModalInputClass()}
                        inputMode="numeric"
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>CNAE</label>
                      <input
                        type="text"
                        value={form.cnae}
                        onChange={(e) => patch("cnae", e.target.value.replace(/\D/g, "").slice(0, 7))}
                        className={formModalInputClass()}
                        inputMode="numeric"
                        placeholder="0000000"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Inscrição estadual</label>
                      <input
                        type="text"
                        value={form.ie}
                        onChange={(e) => patch("ie", e.target.value)}
                        disabled={form.ieIsento}
                        className={formModalInputClass()}
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)] md:pt-8">
                      <input
                        type="checkbox"
                        checked={form.ieIsento}
                        onChange={(e) => patch("ieIsento", e.target.checked)}
                      />
                      Isento de IE
                    </label>
                    <div>
                      <label className={formModalLabelClass}>Inscrição municipal</label>
                      <input
                        type="text"
                        value={form.im}
                        onChange={(e) => patch("im", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Regime tributário</label>
                      <select
                        value={form.regimeTributario}
                        onChange={(e) => patch("regimeTributario", e.target.value)}
                        className={formModalInputClass()}
                      >
                        {REGIME_OPTIONS.map((opt) => (
                          <option key={opt.value || "empty"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Endereço"
                  description="Endereço da empresa. O CEP preenche cidade, UF e código IBGE automaticamente."
                >
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr] gap-4">
                    <div>
                      <label className={formModalLabelClass}>CEP</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={form.cep}
                          onChange={(e) => patch("cep", formatarCep(e.target.value))}
                          onBlur={() => void buscarCep()}
                          className={`${formModalInputClass()} flex-1`}
                          inputMode="numeric"
                        />
                        {loadingCep ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted-foreground)]" />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Endereço</label>
                      <input
                        type="text"
                        value={form.endereco}
                        onChange={(e) => patch("endereco", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={formModalLabelClass}>Número</label>
                      <input
                        type="text"
                        value={form.numero}
                        onChange={(e) => patch("numero", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={formModalLabelClass}>Complemento</label>
                      <input
                        type="text"
                        value={form.complemento}
                        onChange={(e) => patch("complemento", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={formModalLabelClass}>Bairro</label>
                      <input
                        type="text"
                        value={form.bairro}
                        onChange={(e) => patch("bairro", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Cidade</label>
                      <input
                        type="text"
                        value={form.cidade}
                        onChange={(e) => patch("cidade", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>UF</label>
                      <input
                        type="text"
                        value={form.estado}
                        onChange={(e) => patch("estado", e.target.value.toUpperCase().slice(0, 2))}
                        className={formModalInputClass()}
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Código município (IBGE)</label>
                    <input
                      type="text"
                      value={form.codigoMunicipio}
                      onChange={(e) =>
                        patch("codigoMunicipio", e.target.value.replace(/\D/g, "").slice(0, 7))
                      }
                      className={formModalInputClass()}
                      inputMode="numeric"
                      placeholder="Preenchido pelo CEP"
                    />
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Banco da nota de débito"
                  description="Conta no Brasil usada só na nota de débito."
                >
                  <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={bankReplicate === "debit-to-invoice"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBankReplicate("debit-to-invoice");
                          setForm((prev) => ({ ...prev, ...copyDebitNoteBankToInvoice(prev) }));
                        } else {
                          setBankReplicate((cur) => (cur === "debit-to-invoice" ? "none" : cur));
                        }
                      }}
                    />
                    Replicar para a invoice
                  </label>
                  <p className="-mt-2 text-xs text-[color:var(--muted-foreground)]">
                    Copia banco, titular e conta/IBAN. Agência e PIX ficam só na nota de débito.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={formModalLabelClass}>Banco</label>
                      <input
                        type="text"
                        value={form.banco}
                        onChange={(e) => patchBank("banco", e.target.value)}
                        disabled={bankReplicate === "invoice-to-debit"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Titular da conta</label>
                      <input
                        type="text"
                        value={form.titularConta}
                        onChange={(e) => patchBank("titularConta", e.target.value)}
                        disabled={bankReplicate === "invoice-to-debit"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Agência</label>
                      <input
                        type="text"
                        value={form.agencia}
                        onChange={(e) => patch("agencia", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Conta</label>
                      <input
                        type="text"
                        value={form.conta}
                        onChange={(e) => patchBank("conta", e.target.value)}
                        disabled={bankReplicate === "invoice-to-debit"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={formModalLabelClass}>Chave PIX</label>
                      <input
                        type="text"
                        value={form.pixKey}
                        onChange={(e) => patch("pixKey", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Banco da invoice"
                  description="Conta internacional usada só na invoice (IBAN, SWIFT e banco intermediário)."
                >
                  <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={bankReplicate === "invoice-to-debit"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBankReplicate("invoice-to-debit");
                          setForm((prev) => ({ ...prev, ...copyInvoiceBankToDebitNote(prev) }));
                        } else {
                          setBankReplicate((cur) => (cur === "invoice-to-debit" ? "none" : cur));
                        }
                      }}
                    />
                    Replicar para a nota de débito
                  </label>
                  <p className="-mt-2 text-xs text-[color:var(--muted-foreground)]">
                    Copia banco, titular e IBAN/conta. SWIFT e banco intermediário ficam só na invoice.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={formModalLabelClass}>Banco</label>
                      <input
                        type="text"
                        value={form.invoiceBanco}
                        onChange={(e) => patchBank("invoiceBanco", e.target.value)}
                        disabled={bankReplicate === "debit-to-invoice"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Beneficiary / Titular</label>
                      <input
                        type="text"
                        value={form.invoiceTitularConta}
                        onChange={(e) => patchBank("invoiceTitularConta", e.target.value)}
                        disabled={bankReplicate === "debit-to-invoice"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>País</label>
                      <input
                        type="text"
                        value={form.pais}
                        onChange={(e) => patch("pais", e.target.value)}
                        className={formModalInputClass()}
                        placeholder="Brazil"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Account Number / IBAN</label>
                      <input
                        type="text"
                        value={form.iban}
                        onChange={(e) => patchBank("iban", e.target.value)}
                        disabled={bankReplicate === "debit-to-invoice"}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>SWIFT / BIC do banco</label>
                      <input
                        type="text"
                        value={form.bancoSwift}
                        onChange={(e) => patch("bancoSwift", e.target.value.toUpperCase())}
                        className={formModalInputClass()}
                        placeholder="BKCOBRSP"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Endereço do banco</label>
                      <input
                        type="text"
                        value={form.bancoEndereco}
                        onChange={(e) => patch("bancoEndereco", e.target.value)}
                        className={formModalInputClass()}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Banco intermediário</label>
                      <input
                        type="text"
                        value={form.intermediarioBanco}
                        onChange={(e) => patch("intermediarioBanco", e.target.value)}
                        className={formModalInputClass()}
                        placeholder="J.P. Morgan AG - Frankfurt"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>SWIFT / BIC intermediário</label>
                      <input
                        type="text"
                        value={form.intermediarioSwift}
                        onChange={(e) => patch("intermediarioSwift", e.target.value.toUpperCase())}
                        className={formModalInputClass()}
                        placeholder="CHASDEFX"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Moeda (banco intermediário)</label>
                      <input
                        type="text"
                        value={form.intermediarioMoeda}
                        onChange={(e) => patch("intermediarioMoeda", e.target.value.toUpperCase())}
                        className={formModalInputClass()}
                        placeholder="USD"
                      />
                    </div>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Numeração de documentos"
                  description="Prefixo e próximo número da invoice e da nota de débito. Sem zeros à esquerda, até 8 dígitos. O número avança a cada emissão."
                >
                  <div className="space-y-4">
                    <div
                      className="space-y-3 rounded-lg border p-3"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <p className="text-sm font-medium text-[color:var(--foreground)]">Invoice</p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={formModalLabelClass}>Prefixo (opcional)</label>
                          <input
                            type="text"
                            value={form.invoicePrefix}
                            onChange={(e) => patch("invoicePrefix", e.target.value.slice(0, 20))}
                            className={formModalInputClass()}
                            placeholder="INV-"
                            maxLength={20}
                          />
                        </div>
                        <div>
                          <label className={formModalLabelClass}>Próximo número</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.invoiceNextNumber}
                            onChange={(e) =>
                              patch("invoiceNextNumber", e.target.value.replace(/\D/g, "").slice(0, 8))
                            }
                            className={formModalInputClass()}
                            placeholder="1"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        Prévia:{" "}
                        <span className="font-mono text-[color:var(--foreground)]">
                          {formatDocPreview({
                            prefix: form.invoicePrefix,
                            next: form.invoiceNextNumber,
                            pad: "8",
                            defaultPad: 8,
                            maxPad: 8,
                            padWithZeros: false,
                          })}
                        </span>
                        . Sem zeros à esquerda, até 8 dígitos.
                      </p>
                    </div>

                    <div
                      className="space-y-3 rounded-lg border p-3"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <p className="text-sm font-medium text-[color:var(--foreground)]">
                        Nota de débito
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={formModalLabelClass}>Prefixo (opcional)</label>
                          <input
                            type="text"
                            value={form.debitNotePrefix}
                            onChange={(e) => patch("debitNotePrefix", e.target.value.slice(0, 20))}
                            className={formModalInputClass()}
                            placeholder="ND "
                            maxLength={20}
                          />
                        </div>
                        <div>
                          <label className={formModalLabelClass}>Próximo número</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.debitNoteNextNumber}
                            onChange={(e) =>
                              patch(
                                "debitNoteNextNumber",
                                e.target.value.replace(/\D/g, "").slice(0, 8),
                              )
                            }
                            className={formModalInputClass()}
                            placeholder="1"
                          />
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)]">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={form.debitNoteIncludeYear}
                          onChange={(e) => patch("debitNoteIncludeYear", e.target.checked)}
                        />
                        Incluir o ano no número (ex.: 1/2026)
                      </label>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        Prévia:{" "}
                        <span className="font-mono text-[color:var(--foreground)]">
                          {formatDocPreview({
                            prefix: form.debitNotePrefix,
                            next: form.debitNoteNextNumber,
                            pad: "8",
                            defaultPad: 8,
                            maxPad: 8,
                            year: new Date().getUTCFullYear(),
                            includeYear: form.debitNoteIncludeYear,
                            padWithZeros: false,
                          })}
                        </span>
                        . Sem zeros à esquerda, até 8 dígitos. A sequência recomeça em 1 no ano
                        novo, salvo se você gravar outro próximo número depois da virada.
                      </p>
                    </div>
                  </div>
                </FormModalSection>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Salvar
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </FinanceiroModuleGuard>
  );
}
