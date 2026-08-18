"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  formatarCep,
  formatarDocumento,
  formatarTelefone,
} from "@/lib/brFormatters";
import {
  formModalBackdropClass,
  formModalInputClass,
  formModalLabelClass,
  formModalPanelWideClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

type CategoryOption = { id: string; name: string; isActive: boolean; allowMultipleUsers?: boolean };
type UserLinkOption = { id: string; name: string; email: string; linkedSupplierId?: string | null };

type NewSupplierModalProps = {
  onClose: () => void;
  onSaved: (supplierId: string) => void;
};

export function NewSupplierModal({ onClose, onSaved }: NewSupplierModalProps) {
  const overlayPointerDownRef = useRef(false);
  const [personType, setPersonType] = useState<"PJ" | "PF">("PJ");
  const [nomeApelido, setNomeApelido] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [ie, setIe] = useState("");
  const [ieIsento, setIeIsento] = useState(false);
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [contatoFinNome, setContatoFinNome] = useState("");
  const [contatoFinEmail, setContatoFinEmail] = useState("");
  const [contatoFinCel, setContatoFinCel] = useState("");
  const [contatoTecNome, setContatoTecNome] = useState("");
  const [contatoTecEmail, setContatoTecEmail] = useState("");
  const [contatoTecCel, setContatoTecCel] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [linkedUserIds, setLinkedUserIds] = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<UserLinkOption[]>([]);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/supplier-categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) =>
        setCategories(Array.isArray(rows) ? rows.filter((c: CategoryOption) => c.isActive !== false) : []),
      )
      .catch(() => setCategories([]));
    apiFetch("/api/users/for-select?scope=relatorios&status=ativos")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setLinkableUsers(Array.isArray(rows) ? rows : []))
      .catch(() => setLinkableUsers([]));
  }, []);

  const allowMultipleUsers = useMemo(() => {
    const cat = categories.find((c) => c.id === categoryId);
    return Boolean(cat?.allowMultipleUsers);
  }, [categories, categoryId]);

  const linkedUserOptions = useMemo(() => {
    return linkableUsers.map((u) => ({
      value: u.id,
      label: u.name,
      title: u.email,
    }));
  }, [linkableUsers]);

  function onCategoryChange(nextCategoryId: string) {
    const cat = categories.find((c) => c.id === nextCategoryId);
    setCategoryId(nextCategoryId);
    if (!cat?.allowMultipleUsers && linkedUserIds.length > 1) {
      setLinkedUserIds(linkedUserIds.slice(0, 1));
    }
  }

  function setLinkedUsers(next: string[]) {
    setLinkedUserIds(allowMultipleUsers ? next : next.slice(0, 1));
  }

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

  async function handleSave() {
    setError("");
    if (!nomeApelido.trim()) {
      setError("Nome / apelido é obrigatório.");
      return;
    }
    if (!cnpjCpf.replace(/\D/g, "")) {
      setError("CNPJ/CPF é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType,
          nomeApelido: nomeApelido.trim(),
          razaoSocial: razaoSocial.trim() || null,
          cnpjCpf: cnpjCpf.replace(/\D/g, ""),
          ie: ieIsento ? null : ie.trim() || null,
          ieIsento,
          cep: cep.replace(/\D/g, "") || null,
          endereco: endereco.trim() || null,
          numero: numero.trim() || null,
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          estado: estado.trim() || null,
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          banco: banco.trim() || null,
          agencia: agencia.trim() || null,
          conta: conta.trim() || null,
          pixKey: pixKey.trim() || null,
          contatoFinNome: contatoFinNome.trim() || null,
          contatoFinEmail: contatoFinEmail.trim() || null,
          contatoFinCel: contatoFinCel.trim() || null,
          contatoTecNome: contatoTecNome.trim() || null,
          contatoTecEmail: contatoTecEmail.trim() || null,
          contatoTecCel: contatoTecCel.trim() || null,
          categoryId: categoryId || null,
          linkedUserIds,
          observacoes: observacoes.trim() || null,
          status: "ATIVO",
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      onSaved(String(body.id));
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
      onPointerUp={(e) => {
        if (overlayPointerDownRef.current && e.target === e.currentTarget) onClose();
        overlayPointerDownRef.current = false;
      }}
    >
      <div className={formModalPanelWideClass} role="dialog" aria-modal="true" aria-labelledby="new-supplier-title">
        <div className="flex-shrink-0 border-b border-[color:var(--border)] px-5 py-4 md:px-6">
          <h2 id="new-supplier-title" className="text-lg font-semibold text-[color:var(--foreground)]">
            Novo fornecedor
          </h2>
          <p className="text-xs text-[color:var(--muted-foreground)] mt-1">
            Cadastre fornecedores PJ ou PF com dados fiscais, bancários e contatos.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 space-y-4">
           {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <FormModalSection title="Identificação">
          <div className="flex flex-wrap gap-2">
            {(["PJ", "PF"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPersonType(t);
                  setCnpjCpf("");
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  personType === t
                    ? "text-[color:var(--primary-foreground)]"
                    : "border border-[color:var(--border)] text-[color:var(--foreground)]"
                }`}
                style={personType === t ? { background: "var(--primary)" } : undefined}
              >
                {t === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={formModalLabelClass}>
                Nome / apelido <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nomeApelido}
                onChange={(e) => setNomeApelido(e.target.value)}
                className={formModalInputClass(false)}
                placeholder={personType === "PJ" ? "Ex.: Fornecedor XYZ" : "Ex.: João Silva"}
              />
            </div>
            {personType === "PJ" ? (
              <div>
                <label className={formModalLabelClass}>Razão social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className={formModalInputClass(false)}
                />
              </div>
            ) : null}
            <div>
              <label className={formModalLabelClass}>
                {personType === "PF" ? "CPF" : "CNPJ"} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(formatarDocumento(personType, e.target.value))}
                className={formModalInputClass(false)}
                inputMode="numeric"
              />
            </div>
            <div>
              <label className={formModalLabelClass}>Categoria</label>
              <PopoverSelect
                id="new-supplier-category"
                value={categoryId}
                onChange={onCategoryChange}
                placeholder="Selecione..."
                options={[
                  { value: "", label: "Selecione..." },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div className="md:col-span-2">
              <label className={formModalLabelClass}>Usuários</label>
              {allowMultipleUsers ? (
                <PopoverSelect
                  id="new-supplier-linked-users"
                  multi
                  checklist
                  values={linkedUserIds}
                  onValuesChange={setLinkedUsers}
                  placeholder="Selecione"
                  selectAllLabel="Todos"
                  options={linkedUserOptions}
                />
              ) : (
                <PopoverSelect
                  id="new-supplier-linked-user"
                  value={linkedUserIds[0] ?? ""}
                  onChange={(v) => setLinkedUserIds(v ? [v] : [])}
                  placeholder="Nenhum (opcional)"
                  options={[{ value: "", label: "Nenhum" }, ...linkedUserOptions]}
                />
              )}
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                {allowMultipleUsers
                  ? "Um usuário pode estar em vários fornecedores. Esta categoria permite vincular vários profissionais ao mesmo fornecedor."
                  : "Opcional. Vincule um profissional para usar os dados deste fornecedor em contas a pagar."}
              </p>
            </div>
          </div>
          {personType === "PJ" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className={formModalLabelClass}>Inscrição estadual</label>
                <input
                  type="text"
                  value={ie}
                  onChange={(e) => setIe(e.target.value)}
                  disabled={ieIsento}
                  className={formModalInputClass(false)}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-[color:var(--foreground)] pb-3">
                <input type="checkbox" checked={ieIsento} onChange={(e) => setIeIsento(e.target.checked)} />
                Isento de IE
              </label>
            </div>
          ) : null}
        </FormModalSection>

        <FormModalSection title="Contato e endereço">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={formModalLabelClass}>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Telefone</label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                className={formModalInputClass(false)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr] gap-4">
            <div>
              <label className={formModalLabelClass}>CEP</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(formatarCep(e.target.value))}
                  onBlur={() => void buscarCep()}
                  className={`${formModalInputClass(false)} flex-1`}
                />
                {loadingCep ? <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted-foreground)]" /> : null}
              </div>
            </div>
            <div>
              <label className={formModalLabelClass}>Logradouro</label>
              <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} className={formModalInputClass(false)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={formModalLabelClass}>Número</label>
              <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Complemento</label>
              <input type="text" value={complemento} onChange={(e) => setComplemento(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Bairro</label>
              <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className={formModalInputClass(false)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={formModalLabelClass}>Cidade</label>
              <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>UF</label>
              <input type="text" value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))} className={formModalInputClass(false)} maxLength={2} />
            </div>
          </div>
        </FormModalSection>

        <FormModalSection title="Dados bancários">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={formModalLabelClass}>Banco</label>
              <input type="text" value={banco} onChange={(e) => setBanco(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Agência</label>
              <input type="text" value={agencia} onChange={(e) => setAgencia(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Conta</label>
              <input type="text" value={conta} onChange={(e) => setConta(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Chave PIX</label>
              <input type="text" value={pixKey} onChange={(e) => setPixKey(e.target.value)} className={formModalInputClass(false)} />
            </div>
          </div>
        </FormModalSection>

        <FormModalSection title="Contatos">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={formModalLabelClass}>Financeiro — nome</label>
              <input type="text" value={contatoFinNome} onChange={(e) => setContatoFinNome(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Financeiro — e-mail</label>
              <input type="email" value={contatoFinEmail} onChange={(e) => setContatoFinEmail(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Financeiro — celular</label>
              <input type="text" value={contatoFinCel} onChange={(e) => setContatoFinCel(formatarTelefone(e.target.value))} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Técnico — nome</label>
              <input type="text" value={contatoTecNome} onChange={(e) => setContatoTecNome(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Técnico — e-mail</label>
              <input type="email" value={contatoTecEmail} onChange={(e) => setContatoTecEmail(e.target.value)} className={formModalInputClass(false)} />
            </div>
            <div>
              <label className={formModalLabelClass}>Técnico — celular</label>
              <input type="text" value={contatoTecCel} onChange={(e) => setContatoTecCel(formatarTelefone(e.target.value))} className={formModalInputClass(false)} />
            </div>
          </div>
        </FormModalSection>

        <FormModalSection title="Observações">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={formModalInputClass(false)}
            placeholder="Notas internas sobre o fornecedor..."
          />
        </FormModalSection>
        </div>

        <div className="flex-shrink-0 border-t border-[color:var(--border)] px-5 py-4 md:px-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[color:var(--background)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
