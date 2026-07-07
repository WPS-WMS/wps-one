"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  formModalBackdropClass,
  formModalInputClass,
  formModalLabelClass,
  formModalPanelExtraWideClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";
import { ClientFinancialFields } from "@/components/finance/ClientFinancialFields";
import {
  clientFinancialFormToPayload,
  emptyClientFinancialForm,
  hasClientFinancialInput,
  type ClientFinancialFormState,
} from "@/lib/clientFinancialForm";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";

type NewClientModalProps = {
  onClose: () => void;
  onSaved: () => void;
};

export function NewClientModal({ onClose, onSaved }: NewClientModalProps) {
  const overlayPointerDownRef = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [financialForm, setFinancialForm] = useState<ClientFinancialFormState>(emptyClientFinancialForm);
  const showFinancialFields = isFinanceiroModuleEnabled();
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  async function buscarCep() {
    if (!cep || cep.replace(/\D/g, "").length !== 8) return;

    setLoadingCep(true);
    setError("");
    try {
      const cepLimpo = cep.replace(/\D/g, "");
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (data.erro) {
        setError("CEP não encontrado");
        return;
      }

      setEndereco(data.logradouro || "");
      setBairro(data.bairro || "");
      setCidade(data.localidade || "");
      setEstado(data.uf || "");
    } catch {
      setError("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  }

  function formatarTelefone(value: string) {
    const numeros = value.replace(/\D/g, "");
    if (numeros.length <= 10) {
      return numeros.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return numeros.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }

  function formatarCep(value: string) {
    const numeros = value.replace(/\D/g, "");
    return numeros.replace(/(\d{5})(\d{3})/, "$1-$2");
  }

  function formatarCnpj(value: string) {
    const numeros = value.replace(/\D/g, "").slice(0, 14);
    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 5) return numeros.replace(/(\d{2})(\d{1,3})/, "$1.$2");
    if (numeros.length <= 8) return numeros.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
    if (numeros.length <= 12) return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
    return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
  }

  function setFinancialField<K extends keyof ClientFinancialFormState>(
    key: K,
    value: ClientFinancialFormState[K],
  ) {
    setFinancialForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const errors: Record<string, boolean> = {};
    const missingFields: string[] = [];

    if (!name.trim()) {
      errors.name = true;
      missingFields.push("Nome do cliente");
    }

    if (!email.trim()) {
      errors.email = true;
      missingFields.push("E-mail de contato");
    }

    if (Object.keys(errors).length > 0) {
      const errorMessage = `Por favor, preencha os seguintes campos obrigatórios: ${missingFields.join(", ")}.`;
      setFieldErrors(errors);
      setError(errorMessage);
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        email: email.trim(),
        cnpj: cnpj.replace(/\D/g, "") || undefined,
        telefone: telefone.replace(/\D/g, "") || undefined,
        cep: cep.replace(/\D/g, "") || undefined,
        endereco: endereco.trim() || undefined,
        numero: numero.trim() || undefined,
        complemento: complemento.trim() || undefined,
        bairro: bairro.trim() || undefined,
        cidade: cidade.trim() || undefined,
        estado: estado.trim() || undefined,
      };

      const res = await apiFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao criar cliente");
        return;
      }

      const clientId = typeof data?.id === "string" ? data.id : null;
      if (showFinancialFields && clientId && hasClientFinancialInput(financialForm)) {
        const finRes = await apiFetch(`/api/clients/${clientId}/financial`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientFinancialFormToPayload(financialForm)),
        });
        const finData = await finRes.json().catch(() => null);
        if (!finRes.ok) {
          setError(
            typeof finData?.error === "string"
              ? finData.error
              : "Cliente criado, mas não foi possível salvar os dados financeiros.",
          );
          return;
        }
      }

      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={formModalBackdropClass}
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
        overlayPointerDownRef.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        className={formModalPanelExtraWideClass}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-client-modal-title"
      >
        <header className="shrink-0 px-5 pt-5 pb-4 md:px-6 border-b border-[color:var(--border)]">
          <h2
            id="new-client-modal-title"
            className="text-lg md:text-xl font-semibold text-[color:var(--foreground)]"
          >
            Novo cliente
          </h2>
          <p className="text-sm text-[color:var(--muted-foreground)] mt-1.5 leading-relaxed">
            Cadastre a empresa no portal. Campos com asterisco são obrigatórios; demais ajudam em relatórios e contato.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 space-y-5">
            {error ? (
              <div className="wps-apontamento-consultor-error rounded-xl border px-4 py-3 shrink-0">
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : null}

            <FormModalSection title="Identificação e contato">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={formModalLabelClass}>
                    Nome do cliente <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) {
                        setFieldErrors((prev) => ({ ...prev, name: false }));
                      }
                    }}
                    className={formModalInputClass(!!fieldErrors.name)}
                    aria-invalid={fieldErrors.name ? "true" : "false"}
                    placeholder="Ex.: Empresa ABC Ltda"
                  />
                  {fieldErrors.name ? (
                    <p className="mt-1 text-xs text-red-600">Campo obrigatório.</p>
                  ) : null}
                </div>
                <div>
                  <label className={formModalLabelClass}>
                    E-mail de contato <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: false }));
                      }
                    }}
                    className={formModalInputClass(!!fieldErrors.email)}
                    aria-invalid={fieldErrors.email ? "true" : "false"}
                    placeholder="Ex.: contato@empresa.com.br"
                  />
                  {fieldErrors.email ? (
                    <p className="mt-1 text-xs text-red-600">Campo obrigatório.</p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={formModalLabelClass}>CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                    className={formModalInputClass(false)}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    maxLength={18}
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Telefone</label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) => {
                      const formatted = formatarTelefone(e.target.value);
                      setTelefone(formatted);
                    }}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: (11) 98765-4321"
                    maxLength={15}
                  />
                </div>
              </div>
            </FormModalSection>

            <FormModalSection title="Endereço">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr] gap-4">
                <div>
                  <label className={formModalLabelClass}>CEP</label>
                  <div className="flex gap-2 items-center min-h-[3rem]">
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => {
                        const formatted = formatarCep(e.target.value);
                        setCep(formatted);
                      }}
                      onBlur={buscarCep}
                      className={`${formModalInputClass(false)} min-w-0 flex-1`}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {loadingCep ? (
                      <Loader2
                        className="size-5 shrink-0 text-[color:var(--muted-foreground)] animate-spin"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                </div>
                <div className="md:min-w-0">
                  <label className={formModalLabelClass}>Logradouro</label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: Rua das Flores"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={formModalLabelClass}>Número</label>
                  <input
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: 123"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Complemento</label>
                  <input
                    type="text"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: Sala 45"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>Bairro</label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: Centro"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <label className={formModalLabelClass}>Cidade</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className={formModalInputClass(false)}
                    placeholder="Ex.: São Paulo"
                  />
                </div>
                <div>
                  <label className={formModalLabelClass}>UF</label>
                  <input
                    type="text"
                    value={estado}
                    onChange={(e) => setEstado(e.target.value.toUpperCase())}
                    className={formModalInputClass(false)}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </FormModalSection>

            {showFinancialFields ? (
              <FormModalSection
                title="Dados financeiros"
                description="Informações para faturamento, condições de pagamento e contato financeiro."
              >
                <ClientFinancialFields form={financialForm} onChange={setFinancialField} />
              </FormModalSection>
            ) : null}
          </div>

          <footer className="shrink-0 flex gap-3 px-5 py-4 md:px-6 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[color:var(--border)] text-[color:var(--foreground)] font-medium hover:opacity-90 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[color:var(--primary)] font-semibold text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {saving ? "Salvando..." : "Salvar cliente"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
