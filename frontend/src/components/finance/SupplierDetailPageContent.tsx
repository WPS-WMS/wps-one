"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Paperclip, Save, Trash2, Upload } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import {
  formatarCep,
  formatarDocumento,
  formatarTelefone,
  displayDocumento,
} from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
  FormModalSection,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import { FinancePageHeader } from "@/components/finance/FinancePageHeader";

type SupplierDetail = {
  id: string;
  personType: "PJ" | "PF";
  nomeApelido: string;
  razaoSocial: string | null;
  cnpjCpf: string;
  ie: string | null;
  ieIsento: boolean;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  email: string | null;
  telefone: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pixKey: string | null;
  contatoFinNome: string | null;
  contatoFinEmail: string | null;
  contatoFinCel: string | null;
  contatoTecNome: string | null;
  contatoTecEmail: string | null;
  contatoTecCel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryAllowMultipleUsers?: boolean;
  linkedUserId: string | null;
  linkedUserIds?: string[];
  linkedUsers?: { id: string; name: string; email: string }[];
  linkedUser: { id: string; name: string; email: string } | null;
  status: "ATIVO" | "INATIVO";
  observacoes: string | null;
  attachmentsCount: number;
  historyCount: number;
};

type CategoryOption = { id: string; name: string; isActive: boolean; allowMultipleUsers?: boolean };
type UserLinkOption = { id: string; name: string; email: string; linkedSupplierId?: string | null };

type AttachmentRow = {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type HistoryRow = {
  id: string;
  action: string;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type SupplierDetailPageProps = {
  supplierId: string;
};

export function SupplierDetailPageContent({ supplierId }: SupplierDetailPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { can, permissionsReady } = useAuth();
  const canAccess = useMemo(() => canFinanceFeature(can, "financeiro.fornecedores"), [can]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"dados" | "anexos" | "historico">("dados");
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<UserLinkOption[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);

  const [form, setForm] = useState({
    personType: "PJ" as "PJ" | "PF",
    nomeApelido: "",
    razaoSocial: "",
    cnpjCpf: "",
    ie: "",
    ieIsento: false,
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    email: "",
    telefone: "",
    banco: "",
    agencia: "",
    conta: "",
    pixKey: "",
    contatoFinNome: "",
    contatoFinEmail: "",
    contatoFinCel: "",
    contatoTecNome: "",
    contatoTecEmail: "",
    contatoTecCel: "",
    categoryId: "",
    linkedUserIds: [] as string[],
    status: "ATIVO" as "ATIVO" | "INATIVO",
    observacoes: "",
  });

  function applySupplierToForm(s: SupplierDetail) {
    const linkedUserIds =
      s.linkedUserIds?.length
        ? s.linkedUserIds
        : s.linkedUsers?.map((u) => u.id) ??
          (s.linkedUserId ? [s.linkedUserId] : []);
    setForm({
      personType: s.personType,
      nomeApelido: s.nomeApelido,
      razaoSocial: s.razaoSocial ?? "",
      cnpjCpf: displayDocumento(s.personType, s.cnpjCpf),
      ie: s.ie ?? "",
      ieIsento: s.ieIsento,
      cep: s.cep ? formatarCep(s.cep) : "",
      endereco: s.endereco ?? "",
      numero: s.numero ?? "",
      complemento: s.complemento ?? "",
      bairro: s.bairro ?? "",
      cidade: s.cidade ?? "",
      estado: s.estado ?? "",
      email: s.email ?? "",
      telefone: s.telefone ?? "",
      banco: s.banco ?? "",
      agencia: s.agencia ?? "",
      conta: s.conta ?? "",
      pixKey: s.pixKey ?? "",
      contatoFinNome: s.contatoFinNome ?? "",
      contatoFinEmail: s.contatoFinEmail ?? "",
      contatoFinCel: s.contatoFinCel ?? "",
      contatoTecNome: s.contatoTecNome ?? "",
      contatoTecEmail: s.contatoTecEmail ?? "",
      contatoTecCel: s.contatoTecCel ?? "",
      categoryId: s.categoryId ?? "",
      linkedUserIds,
      status: s.status,
      observacoes: s.observacoes ?? "",
    });
  }

  const loadSupplier = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/suppliers/${supplierId}`);
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Fornecedor não encontrado.");
      setSupplier(data as SupplierDetail);
      applySupplierToForm(data as SupplierDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fornecedor.");
      setSupplier(null);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  const loadAttachments = useCallback(async () => {
    const r = await apiFetch(`/api/suppliers/${supplierId}/attachments`);
    const data = await r.json().catch(() => []);
    setAttachments(Array.isArray(data) ? data : []);
  }, [supplierId]);

  const loadHistory = useCallback(async () => {
    const r = await apiFetch(`/api/suppliers/${supplierId}/history`);
    const data = await r.json().catch(() => []);
    setHistory(Array.isArray(data) ? data : []);
  }, [supplierId]);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void loadSupplier();
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
  }, [permissionsReady, canAccess, loadSupplier]);

  const allowMultipleUsers = useMemo(() => {
    const cat = categories.find((c) => c.id === form.categoryId);
    return Boolean(cat?.allowMultipleUsers);
  }, [categories, form.categoryId]);

  const linkedUserOptions = useMemo(() => {
    return linkableUsers
      .filter(
        (u) =>
          !u.linkedSupplierId ||
          u.linkedSupplierId === supplierId ||
          form.linkedUserIds.includes(u.id),
      )
      .map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      }));
  }, [linkableUsers, supplierId, form.linkedUserIds]);

  function setLinkedUserIds(next: string[]) {
    setForm((f) => ({ ...f, linkedUserIds: next }));
  }

  function toggleLinkedUser(userId: string) {
    setForm((f) => {
      const has = f.linkedUserIds.includes(userId);
      if (has) return { ...f, linkedUserIds: f.linkedUserIds.filter((id) => id !== userId) };
      if (!allowMultipleUsers) return { ...f, linkedUserIds: [userId] };
      return { ...f, linkedUserIds: [...f.linkedUserIds, userId] };
    });
  }

  function onCategoryChange(nextCategoryId: string) {
    const cat = categories.find((c) => c.id === nextCategoryId);
    setForm((f) => ({
      ...f,
      categoryId: nextCategoryId,
      linkedUserIds:
        cat?.allowMultipleUsers || f.linkedUserIds.length <= 1
          ? f.linkedUserIds
          : f.linkedUserIds.slice(0, 1),
    }));
  }

  useEffect(() => {
    if (!supplier || tab !== "anexos") return;
    void loadAttachments();
  }, [supplier, tab, loadAttachments]);

  useEffect(() => {
    if (!supplier || tab !== "historico") return;
    void loadHistory();
  }, [supplier, tab, loadHistory]);

  async function buscarCep() {
    if (!form.cep || form.cep.replace(/\D/g, "").length !== 8) return;
    setLoadingCep(true);
    try {
      const cepLimpo = form.cep.replace(/\D/g, "");
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          endereco: data.logradouro || f.endereco,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade || f.cidade,
          estado: data.uf || f.estado,
        }));
      }
    } finally {
      setLoadingCep(false);
    }
  }

  async function saveSupplier() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await apiFetch(`/api/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType: form.personType,
          nomeApelido: form.nomeApelido.trim(),
          razaoSocial: form.razaoSocial.trim() || null,
          cnpjCpf: form.cnpjCpf.replace(/\D/g, ""),
          ie: form.ieIsento ? null : form.ie.trim() || null,
          ieIsento: form.ieIsento,
          cep: form.cep.replace(/\D/g, "") || null,
          endereco: form.endereco.trim() || null,
          numero: form.numero.trim() || null,
          complemento: form.complemento.trim() || null,
          bairro: form.bairro.trim() || null,
          cidade: form.cidade.trim() || null,
          estado: form.estado.trim() || null,
          email: form.email.trim() || null,
          telefone: form.telefone.trim() || null,
          banco: form.banco.trim() || null,
          agencia: form.agencia.trim() || null,
          conta: form.conta.trim() || null,
          pixKey: form.pixKey.trim() || null,
          contatoFinNome: form.contatoFinNome.trim() || null,
          contatoFinEmail: form.contatoFinEmail.trim() || null,
          contatoFinCel: form.contatoFinCel.trim() || null,
          contatoTecNome: form.contatoTecNome.trim() || null,
          contatoTecEmail: form.contatoTecEmail.trim() || null,
          contatoTecCel: form.contatoTecCel.trim() || null,
          categoryId: form.categoryId || null,
          linkedUserIds: form.linkedUserIds,
          status: form.status,
          observacoes: form.observacoes.trim() || null,
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível salvar.");
      setSupplier(data as SupplierDetail);
      applySupplierToForm(data as SupplierDetail);
      setSuccess("Alterações salvas.");
      if (tab === "historico") void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const r = await apiFetch(`/api/suppliers/${supplierId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileData,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof body?.error === "string" ? body.error : "Erro no upload.");
      await loadAttachments();
      if (tab === "historico") void loadHistory();
      setSuccess("Anexo enviado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(att: AttachmentRow) {
    const res = await apiFetchBlob(`/api/suppliers/${supplierId}/attachments/${att.id}/file`);
    if (!res.ok) {
      setError("Não foi possível baixar o anexo.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAttachment(att: AttachmentRow) {
    if (!confirm(`Remover anexo "${att.filename}"?`)) return;
    const r = await apiFetch(`/api/suppliers/${supplierId}/attachments/${att.id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) {
      const body = await r.json().catch(() => ({}));
      setError(typeof body?.error === "string" ? body.error : "Erro ao excluir anexo.");
      return;
    }
    await loadAttachments();
    if (tab === "historico") void loadHistory();
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (!permissionsReady) {
    return <div className="flex-1 flex items-center justify-center py-16 text-sm text-[color:var(--muted-foreground)]">Carregando...</div>;
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <p className="text-sm text-[color:var(--muted-foreground)]">Acesso negado.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-16 text-sm text-[color:var(--muted-foreground)]">Carregando fornecedor...</div>;
  }

  if (!supplier) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        <button type="button" onClick={() => router.push(`${basePath}/fornecedores`)} className="self-end text-sm">
          Voltar
        </button>
        <p className="text-sm text-red-600">{error ?? "Fornecedor não encontrado."}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <button
        type="button"
        onClick={() => router.push(`${basePath}/fornecedores`)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <FinancePageHeader
        variant="bar"
        eyebrow="Financeiro · Fornecedores"
        title={supplier.nomeApelido}
        subtitle={`${displayDocumento(supplier.personType, supplier.cnpjCpf)}${
          supplier.categoryName ? ` · ${supplier.categoryName}` : ""
        }`}
      />

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto md:py-5">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["dados", "Dados"],
                  ["anexos", `Anexos (${supplier.attachmentsCount})`],
                  ["historico", `Histórico (${supplier.historyCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium ${
                    tab === key
                      ? "text-[color:var(--primary-foreground)]"
                      : "border border-[color:var(--border)] text-[color:var(--foreground)]"
                  }`}
                  style={tab === key ? { background: "var(--primary)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "dados" ? (
              <button
                type="button"
                onClick={() => void saveSupplier()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              {success}
            </div>
          ) : null}

          {tab === "dados" ? (
            <div className="space-y-4">
              <FormModalSection title="Identificação">
                <div className="flex flex-wrap gap-2">
                  {(["PJ", "PF"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setField("personType", t);
                        setField("cnpjCpf", "");
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium ${
                        form.personType === t
                          ? "text-[color:var(--primary-foreground)]"
                          : "border border-[color:var(--border)]"
                      }`}
                      style={form.personType === t ? { background: "var(--primary)" } : undefined}
                    >
                      {t === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={formModalLabelClass}>Nome / apelido</label>
                    <input value={form.nomeApelido} onChange={(e) => setField("nomeApelido", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  {form.personType === "PJ" ? (
                    <div>
                      <label className={formModalLabelClass}>Razão social</label>
                      <input value={form.razaoSocial} onChange={(e) => setField("razaoSocial", e.target.value)} className={formModalInputClass(false)} />
                    </div>
                  ) : null}
                  <div>
                    <label className={formModalLabelClass}>{form.personType === "PF" ? "CPF" : "CNPJ"}</label>
                    <input
                      value={form.cnpjCpf}
                      onChange={(e) => setField("cnpjCpf", formatarDocumento(form.personType, e.target.value))}
                      className={formModalInputClass(false)}
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Categoria</label>
                    <PopoverSelect
                      id="supplier-category-menu"
                      value={form.categoryId}
                      onChange={onCategoryChange}
                      placeholder="Selecione..."
                      options={[
                        { value: "", label: "Selecione..." },
                        ...categories.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Status</label>
                    <PopoverSelect
                      id="supplier-status-menu"
                      value={form.status}
                      onChange={(v) => setField("status", v as "ATIVO" | "INATIVO")}
                      options={[
                        { value: "ATIVO", label: "Ativo" },
                        { value: "INATIVO", label: "Inativo" },
                      ]}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={formModalLabelClass}>
                      {allowMultipleUsers ? "Usuários vinculados" : "Usuário vinculado"}
                    </label>
                    {allowMultipleUsers ? (
                      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] max-h-48 overflow-y-auto p-2 space-y-1">
                        {linkedUserOptions.length === 0 ? (
                          <p className="px-2 py-1.5 text-sm text-[color:var(--muted-foreground)]">
                            Nenhum usuário disponível.
                          </p>
                        ) : (
                          linkedUserOptions.map((opt) => {
                            const checked = form.linkedUserIds.includes(opt.value);
                            return (
                              <label
                                key={opt.value}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[color:var(--foreground)] hover:bg-black/[0.04] cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleLinkedUser(opt.value)}
                                  className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--primary)]"
                                />
                                <span className="truncate">{opt.label}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <PopoverSelect
                        id="supplier-linked-user-menu"
                        value={form.linkedUserIds[0] ?? ""}
                        onChange={(v) => setLinkedUserIds(v ? [v] : [])}
                        placeholder="Nenhum (opcional)"
                        options={[{ value: "", label: "Nenhum" }, ...linkedUserOptions]}
                      />
                    )}
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      {allowMultipleUsers
                        ? "Esta categoria permite vincular vários profissionais ao mesmo fornecedor."
                        : "Vincule um profissional do sistema para usar os dados deste fornecedor em contas a pagar e emissão de NF."}
                    </p>
                  </div>
                </div>
                {form.personType === "PJ" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className={formModalLabelClass}>Inscrição estadual</label>
                      <input value={form.ie} onChange={(e) => setField("ie", e.target.value)} disabled={form.ieIsento} className={formModalInputClass(false)} />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm pb-3">
                      <input type="checkbox" checked={form.ieIsento} onChange={(e) => setField("ieIsento", e.target.checked)} />
                      Isento de IE
                    </label>
                  </div>
                ) : null}
              </FormModalSection>

              <FormModalSection title="Contato e endereço">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={formModalLabelClass}>E-mail</label>
                    <input value={form.email} onChange={(e) => setField("email", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Telefone</label>
                    <input value={form.telefone} onChange={(e) => setField("telefone", formatarTelefone(e.target.value))} className={formModalInputClass(false)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr] gap-4">
                  <div>
                    <label className={formModalLabelClass}>CEP</label>
                    <div className="flex gap-2 items-center">
                      <input
                        value={form.cep}
                        onChange={(e) => setField("cep", formatarCep(e.target.value))}
                        onBlur={() => void buscarCep()}
                        className={`${formModalInputClass(false)} flex-1`}
                      />
                      {loadingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    </div>
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Logradouro</label>
                    <input value={form.endereco} onChange={(e) => setField("endereco", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={formModalLabelClass}>Número</label>
                    <input value={form.numero} onChange={(e) => setField("numero", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Complemento</label>
                    <input value={form.complemento} onChange={(e) => setField("complemento", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Bairro</label>
                    <input value={form.bairro} onChange={(e) => setField("bairro", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={formModalLabelClass}>Cidade</label>
                    <input value={form.cidade} onChange={(e) => setField("cidade", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>UF</label>
                    <input value={form.estado} onChange={(e) => setField("estado", e.target.value.toUpperCase().slice(0, 2))} className={formModalInputClass(false)} maxLength={2} />
                  </div>
                </div>
              </FormModalSection>

              <FormModalSection title="Dados bancários">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={formModalLabelClass}>Banco</label>
                    <input value={form.banco} onChange={(e) => setField("banco", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Agência</label>
                    <input value={form.agencia} onChange={(e) => setField("agencia", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Conta</label>
                    <input value={form.conta} onChange={(e) => setField("conta", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Chave PIX</label>
                    <input value={form.pixKey} onChange={(e) => setField("pixKey", e.target.value)} className={formModalInputClass(false)} />
                  </div>
                </div>
              </FormModalSection>

              <FormModalSection title="Contatos">
                {(
                  [
                    {
                      title: "Financeiro",
                      fields: [
                        { key: "contatoFinNome" as const, placeholder: "Nome" },
                        { key: "contatoFinEmail" as const, placeholder: "E-mail" },
                        { key: "contatoFinCel" as const, placeholder: "Telefone" },
                      ],
                    },
                    {
                      title: "Técnico",
                      fields: [
                        { key: "contatoTecNome" as const, placeholder: "Nome" },
                        { key: "contatoTecEmail" as const, placeholder: "E-mail" },
                        { key: "contatoTecCel" as const, placeholder: "Telefone" },
                      ],
                    },
                  ] as const
                ).map((group) => (
                  <div key={group.title} className="space-y-2">
                    <p className={formModalLabelClass}>{group.title}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {group.fields.map(({ key, placeholder }) => (
                        <input
                          key={key}
                          value={form[key]}
                          onChange={(e) =>
                            setField(
                              key,
                              key.endsWith("Cel") ? formatarTelefone(e.target.value) : e.target.value,
                            )
                          }
                          placeholder={placeholder}
                          className={formModalInputClass(false)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </FormModalSection>

              <FormModalSection title="Observações">
                <textarea value={form.observacoes} onChange={(e) => setField("observacoes", e.target.value)} rows={3} className={formModalInputClass(false)} />
              </FormModalSection>
            </div>
          ) : null}

          {tab === "anexos" ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
                  <Paperclip className="h-4 w-4" />
                  Contratos, certidões e documentos do fornecedor
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] disabled:opacity-50"
                    style={{ background: "var(--primary)" }}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Enviar anexo
                  </button>
                </div>
              </div>
              {attachments.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">Nenhum anexo.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] text-left text-xs uppercase text-[color:var(--muted-foreground)]">
                      <th className="py-2 pr-4">Arquivo</th>
                      <th className="py-2 pr-4">Enviado por</th>
                      <th className="py-2 pr-4">Data</th>
                      <th className="py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attachments.map((att) => (
                      <tr key={att.id} className="border-b border-[color:var(--border)]/60">
                        <td className="py-3 pr-4">{att.filename}</td>
                        <td className="py-3 pr-4 text-[color:var(--muted-foreground)]">{att.user.name}</td>
                        <td className="py-3 pr-4 text-[color:var(--muted-foreground)]">
                          {new Date(att.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3 text-right">
                          <button type="button" onClick={() => void downloadAttachment(att)} className="p-2 rounded-lg hover:bg-[color:var(--background)]" title="Baixar">
                            <Download className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void deleteAttachment(att)} className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {tab === "historico" ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
              {history.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-foreground)] py-8 text-center">Nenhum registro.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] bg-[color:var(--background)]/50 text-left text-xs uppercase text-[color:var(--muted-foreground)]">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Usuário</th>
                      <th className="px-4 py-3">Alteração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-[color:var(--border)]/60">
                        <td className="px-4 py-3 text-[color:var(--muted-foreground)] whitespace-nowrap">
                          {new Date(h.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">{h.user.name}</td>
                        <td className="px-4 py-3">
                          <div className="text-[color:var(--foreground)]">{h.details || h.action}</div>
                          {h.fieldLabel && (h.oldValue || h.newValue) ? (
                            <div className="text-xs text-[color:var(--muted-foreground)] mt-1">
                              {h.oldValue ? `${h.oldValue} → ` : ""}
                              {h.newValue ?? "—"}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
