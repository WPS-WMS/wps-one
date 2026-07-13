import type { Supplier } from "@prisma/client";

export type SupplierPersonType = "PJ" | "PF";
export type SupplierStatus = "ATIVO" | "INATIVO";

export function normalizePersonType(raw: unknown): SupplierPersonType | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "PJ" || t === "PF") return t;
  return null;
}

export function normalizeSupplierStatus(raw: unknown): SupplierStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "ATIVO" || s === "INATIVO") return s;
  return null;
}

export function normalizeOptionalString(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  return v.length > 0 ? v : null;
}

export function normalizeDocument(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function normalizeCep(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 8);
  return digits.length > 0 ? digits : null;
}

export function validateDocument(personType: SupplierPersonType, doc: string): boolean {
  if (personType === "PF") return doc.length === 11;
  return doc.length === 14;
}

export function documentValidationError(personType: SupplierPersonType): string {
  return personType === "PF"
    ? "CPF inválido. Informe 11 dígitos."
    : "CNPJ inválido. Informe 14 dígitos.";
}

export const SUPPLIER_FIELD_LABELS: Record<string, string> = {
  personType: "Tipo de pessoa",
  nomeApelido: "Nome / apelido",
  razaoSocial: "Razão social",
  cnpjCpf: "CNPJ/CPF",
  ie: "Inscrição estadual",
  ieIsento: "Isento de IE",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  email: "E-mail",
  telefone: "Telefone",
  banco: "Banco",
  agencia: "Agência",
  conta: "Conta",
  pixKey: "Chave PIX",
  contatoFinNome: "Contato financeiro — nome",
  contatoFinEmail: "Contato financeiro — e-mail",
  contatoFinCel: "Contato financeiro — celular",
  contatoTecNome: "Contato técnico — nome",
  contatoTecEmail: "Contato técnico — e-mail",
  contatoTecCel: "Contato técnico — celular",
  categoryId: "Categoria",
  linkedUserId: "Usuário vinculado",
  status: "Status",
  observacoes: "Observações",
};

const TRACKED_FIELDS = [
  "personType",
  "nomeApelido",
  "razaoSocial",
  "cnpjCpf",
  "ie",
  "ieIsento",
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "email",
  "telefone",
  "banco",
  "agencia",
  "conta",
  "pixKey",
  "contatoFinNome",
  "contatoFinEmail",
  "contatoFinCel",
  "contatoTecNome",
  "contatoTecEmail",
  "contatoTecCel",
  "categoryId",
  "linkedUserId",
  "status",
  "observacoes",
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

function displayValue(field: TrackedField, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (field === "ieIsento") return value ? "Sim" : "Não";
  if (field === "personType") return String(value) === "PF" ? "Pessoa física" : "Pessoa jurídica";
  if (field === "status") return String(value) === "INATIVO" ? "Inativo" : "Ativo";
  return String(value);
}

export function buildSupplierHistoryEntries(
  before: Supplier,
  after: Partial<Supplier>,
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const entries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const oldRaw = before[field as keyof Supplier];
    const newRaw = after[field as keyof Supplier];
    const oldVal = displayValue(field, oldRaw);
    const newVal = displayValue(field, newRaw);
    if (oldVal === newVal) continue;
    entries.push({ field, oldValue: oldVal, newValue: newVal });
  }
  return entries;
}

export type SupplierWriteBody = {
  personType?: SupplierPersonType;
  nomeApelido?: string;
  razaoSocial?: string | null;
  cnpjCpf?: string;
  ie?: string | null;
  ieIsento?: boolean;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  email?: string | null;
  telefone?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pixKey?: string | null;
  contatoFinNome?: string | null;
  contatoFinEmail?: string | null;
  contatoFinCel?: string | null;
  contatoTecNome?: string | null;
  contatoTecEmail?: string | null;
  contatoTecCel?: string | null;
  categoryId?: string | null;
  linkedUserId?: string | null;
  status?: SupplierStatus;
  observacoes?: string | null;
};

export function parseSupplierWriteBody(body: unknown, mode: "create" | "update"): SupplierWriteBody | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: SupplierWriteBody = {};

  if (mode === "create" || b.personType != null) {
    const personType = normalizePersonType(b.personType);
    if (!personType) return { error: "Tipo de pessoa inválido. Use PJ ou PF." };
    out.personType = personType;
  }

  if (mode === "create" || b.nomeApelido != null) {
    const nomeApelido = normalizeOptionalString(b.nomeApelido);
    if (!nomeApelido) return { error: "Nome / apelido é obrigatório." };
    out.nomeApelido = nomeApelido;
  }

  if (b.razaoSocial !== undefined) out.razaoSocial = normalizeOptionalString(b.razaoSocial);
  if (mode === "create" || b.cnpjCpf != null) {
    const cnpjCpf = normalizeDocument(b.cnpjCpf);
    if (!cnpjCpf) return { error: "CNPJ/CPF é obrigatório." };
    out.cnpjCpf = cnpjCpf;
  }

  if (b.ie !== undefined) out.ie = normalizeOptionalString(b.ie);
  if (typeof b.ieIsento === "boolean") out.ieIsento = b.ieIsento;
  if (b.cep !== undefined) out.cep = normalizeCep(b.cep);
  if (b.endereco !== undefined) out.endereco = normalizeOptionalString(b.endereco);
  if (b.numero !== undefined) out.numero = normalizeOptionalString(b.numero);
  if (b.complemento !== undefined) out.complemento = normalizeOptionalString(b.complemento);
  if (b.bairro !== undefined) out.bairro = normalizeOptionalString(b.bairro);
  if (b.cidade !== undefined) out.cidade = normalizeOptionalString(b.cidade);
  if (b.estado !== undefined) out.estado = normalizeOptionalString(b.estado)?.slice(0, 2).toUpperCase() ?? null;
  if (b.email !== undefined) out.email = normalizeOptionalString(b.email);
  if (b.telefone !== undefined) out.telefone = normalizeOptionalString(b.telefone);
  if (b.banco !== undefined) out.banco = normalizeOptionalString(b.banco);
  if (b.agencia !== undefined) out.agencia = normalizeOptionalString(b.agencia);
  if (b.conta !== undefined) out.conta = normalizeOptionalString(b.conta);
  if (b.pixKey !== undefined) out.pixKey = normalizeOptionalString(b.pixKey);
  if (b.contatoFinNome !== undefined) out.contatoFinNome = normalizeOptionalString(b.contatoFinNome);
  if (b.contatoFinEmail !== undefined) out.contatoFinEmail = normalizeOptionalString(b.contatoFinEmail);
  if (b.contatoFinCel !== undefined) out.contatoFinCel = normalizeOptionalString(b.contatoFinCel);
  if (b.contatoTecNome !== undefined) out.contatoTecNome = normalizeOptionalString(b.contatoTecNome);
  if (b.contatoTecEmail !== undefined) out.contatoTecEmail = normalizeOptionalString(b.contatoTecEmail);
  if (b.contatoTecCel !== undefined) out.contatoTecCel = normalizeOptionalString(b.contatoTecCel);
  if (b.categoryId !== undefined) {
    out.categoryId = b.categoryId ? String(b.categoryId) : null;
  }
  if (b.linkedUserId !== undefined) {
    out.linkedUserId = b.linkedUserId ? String(b.linkedUserId) : null;
  }
  if (b.status != null) {
    const status = normalizeSupplierStatus(b.status);
    if (!status) return { error: "Status inválido. Use ATIVO ou INATIVO." };
    out.status = status;
  }
  if (b.observacoes !== undefined) out.observacoes = normalizeOptionalString(b.observacoes);

  return out;
}
