export function formatarCep(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 8);
  return numeros.replace(/(\d{5})(\d{3})/, "$1-$2");
}

export function formatarCnpj(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 14);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 5) return numeros.replace(/(\d{2})(\d{1,3})/, "$1.$2");
  if (numeros.length <= 8) return numeros.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
  if (numeros.length <= 12) return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
  return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatarCpf(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 11);
  if (numeros.length <= 3) return numeros;
  if (numeros.length <= 6) return numeros.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (numeros.length <= 9) return numeros.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarDocumento(personType: "PJ" | "PF", value: string) {
  return personType === "PF" ? formatarCpf(value) : formatarCnpj(value);
}

export function formatarTelefone(value: string) {
  const numeros = value.replace(/\D/g, "");
  if (numeros.length <= 10) {
    return numeros.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return numeros.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}

export function displayDocumento(personType: "PJ" | "PF", raw: string) {
  return formatarDocumento(personType, raw.replace(/\D/g, ""));
}

export function formatarMoeda(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Converte valor decimal (string ou número) para centavos inteiros. */
export function moedaParaCentavos(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/** Extrai centavos de input mascarado (dígitos; os 2 últimos são centavos). */
export function centavosFromMoedaInput(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formata centavos para exibição em campo de entrada (R$). */
export function formatarMoedaInputFromCentavos(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata valor decimal armazenado para exibição em campo de entrada. */
export function formatarMoedaInput(value: string | number | null | undefined): string {
  return formatarMoedaInputFromCentavos(moedaParaCentavos(value));
}

/** Converte valor decimal armazenado (ex.: "20") para envio à API. */
export function parseDecimalMoedaForApi(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100) / 100;
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Converte input mascarado em string decimal para persistência (ex.: "100.5"). */
export function parseMoedaInputToString(value: string): string {
  const cents = centavosFromMoedaInput(value);
  if (cents == null) return "";
  return String(cents / 100);
}

export function formatarData(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}
