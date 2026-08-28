import { ROLE_LABELS, isKnownRole } from "./roles.js";

export const USER_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  role: "Perfil",
  cargo: "Cargo",
  avatarUrl: "Foto",
  hourlyRate: "Taxa hora",
  employmentType: "Tipo de contrato",
  cargaHorariaSemanal: "Carga horária semanal",
  limiteHorasDiarias: "Limite diário de horas",
  limiteHorasPorDia: "Limite de horas por dia da semana",
  permitirMaisHoras: "Permitir apontar mais horas",
  permitirFimDeSemana: "Permitir apontar em fim de semana",
  permitirOutroPeriodo: "Permitir apontar em outro período",
  violacaoApontamentoModo: "Ação na violação de apontamento",
  diasPermitidos: "Dias permitidos para apontamento",
  dataInicioAtividades: "Início das atividades",
  birthDate: "Data de nascimento",
  ativo: "Situação",
  inativacaoMotivo: "Motivo da inativação",
  clientAccess: "Empresas vinculadas",
};

const TRACKED_FIELDS = Object.keys(USER_FIELD_LABELS);

const BOOLEAN_FIELDS = new Set([
  "permitirMaisHoras",
  "permitirFimDeSemana",
  "permitirOutroPeriodo",
]);
const DATE_FIELDS = new Set(["dataInicioAtividades", "birthDate"]);

const VIOLACAO_LABELS: Record<string, string> = {
  NAO_PERMITIR: "Não permitir",
  ENVIAR_APROVACAO: "Enviar para aprovação",
};

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export function formatUserFieldValue(field: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (field === "ativo") return value ? "Ativo" : "Inativo";
  if (BOOLEAN_FIELDS.has(field)) return value ? "Sim" : "Não";
  if (field === "hourlyRate") return formatMoney(Number(value));
  if (field === "role") return isKnownRole(value) ? ROLE_LABELS[value] : String(value);
  if (field === "violacaoApontamentoModo") {
    return VIOLACAO_LABELS[String(value)] ?? String(value);
  }
  if (DATE_FIELDS.has(field)) return formatDate(value as Date | string);
  if (field === "avatarUrl") return "Imagem";
  return String(value);
}

export type UserHistoryEntry = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

/**
 * Compara o cadastro antes/depois e devolve só os campos que realmente mudaram,
 * já com os valores formatados para leitura na aba de histórico.
 */
export function buildUserHistoryEntries(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): UserHistoryEntry[] {
  const entries: UserHistoryEntry[] = [];
  for (const field of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const oldValue = formatUserFieldValue(field, before[field]);
    const newValue = formatUserFieldValue(field, after[field]);
    if (oldValue === newValue) continue;
    entries.push({ field, oldValue, newValue });
  }
  return entries;
}
