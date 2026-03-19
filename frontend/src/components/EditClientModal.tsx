"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Client = {
  id: string;
  name: string;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

type EditClientModalProps = {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
};

export function EditClientModal({ client, onClose, onSaved }: EditClientModalProps) {
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email || "");
  const [telefone, setTelefone] = useState(client.telefone || "");
  const [cep, setCep] = useState(client.cep || "");
  const [endereco, setEndereco] = useState(client.endereco || "");
  const [numero, setNumero] = useState(client.numero || "");
  const [complemento, setComplemento] = useState(client.complemento || "");
  const [bairro, setBairro] = useState(client.bairro || "");
  const [cidade, setCidade] = useState(client.cidade || "");
  const [estado, setEstado] = useState(client.estado || "");
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
    } catch (err) {
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
        email: email.trim() || null,
        telefone: telefone.replace(/\D/g, "") || null,
        cep: cep.replace(/\D/g, "") || null,
        endereco: endereco.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado.trim() || null,
      };

      const res = await apiFetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao atualizar cliente");
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const getInputClass = (hasError: boolean) => {
    const baseClass = "w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2";
    const errorClass = hasError 
      ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
      : "border-slate-200 focus:ring-blue-500 focus:border-blue-500";
    return `${baseClass} ${errorClass}`;
  };
  const labelClass = "block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide";

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200/70 w-full max-w-3xl max-h-[90vh] shadow-[0_24px_80px_rgba(15,23,42,0.45)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900">Editar cliente</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Atualize as informações do cliente. O campo marcado é obrigatório.
          </p>
        </div>

        {/* Conteúdo */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          {error ? (
            <div className="px-6 pt-4 pb-2 bg-white">
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          ) : null}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-slate-50">
            {/* Informações básicas */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Informações básicas
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nome do cliente *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) {
                        setFieldErrors((prev) => ({ ...prev, name: false }));
                      }
                    }}
                    className={getInputClass(!!fieldErrors.name)}
                    aria-invalid={fieldErrors.name ? "true" : "false"}
                    placeholder="Ex: Empresa ABC Ltda"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-red-600">Campo obrigatório.</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>E-mail de contato</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: contato@empresa.com.br"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => {
                    const formatted = formatarTelefone(e.target.value);
                    setTelefone(formatted);
                  }}
                  className={getInputClass(false)}
                  placeholder="Ex: (11) 98765-4321"
                  maxLength={15}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Endereço
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className={labelClass}>CEP</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => {
                        const formatted = formatarCep(e.target.value);
                        setCep(formatted);
                      }}
                      onBlur={buscarCep}
                      className={getInputClass(false)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {loadingCep && (
                      <div className="flex items-center px-3 text-xs text-slate-500">
                        Buscando...
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Endereço</label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: Rua das Flores"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr] gap-4">
                <div>
                  <label className={labelClass}>Número</label>
                  <input
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: 123"
                  />
                </div>
                <div>
                  <label className={labelClass}>Complemento</label>
                  <input
                    type="text"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: Sala 45"
                  />
                </div>
                <div>
                  <label className={labelClass}>Bairro</label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: Centro"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <label className={labelClass}>Cidade</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className={getInputClass(false)}
                    placeholder="Ex: São Paulo"
                  />
                </div>
                <div>
                  <label className={labelClass}>Estado</label>
                  <input
                    type="text"
                    value={estado}
                    onChange={(e) => setEstado(e.target.value.toUpperCase())}
                    className={getInputClass(false)}
                    placeholder="Ex: SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-6 py-4 bg-white flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-full bg-blue-600 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
