/** Converte valor em reais para extenso (pt-BR). */
const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
];
const ESPECIAIS = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function joinAnd(parts: string[]): string {
  const clean = parts.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(" ")} e ${clean[clean.length - 1]}`;
}

function groupToWords(n: number): string {
  if (n <= 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (c > 0) parts.push(CENTENAS[c]!);
  if (d === 1) {
    parts.push(ESPECIAIS[u]!);
  } else {
    if (d > 1) parts.push(DEZENAS[d]!);
    if (u > 0) parts.push(UNIDADES[u]!);
  }
  return joinAnd(parts);
}

function integerToWords(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const parts: string[] = [];
  if (milhoes > 0) {
    parts.push(milhoes === 1 ? "um milhão" : `${groupToWords(milhoes)} milhões`);
  }
  if (milhares > 0) {
    parts.push(milhares === 1 ? "mil" : `${groupToWords(milhares)} mil`);
  }
  if (resto > 0) parts.push(groupToWords(resto));
  return joinAnd(parts);
}

export function valorPorExtensoBRL(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "zero reais";
  const centsTotal = Math.round(amount * 100);
  const reais = Math.floor(centsTotal / 100);
  const centavos = centsTotal % 100;
  const reaisTxt =
    reais === 0 ? "" : reais === 1 ? "um real" : `${integerToWords(reais)} reais`;
  const centavosTxt =
    centavos === 0
      ? ""
      : centavos === 1
        ? "um centavo"
        : `${integerToWords(centavos)} centavos`;
  if (!reaisTxt) return centavosTxt || "zero reais";
  if (!centavosTxt) return reaisTxt;
  return `${reaisTxt} e ${centavosTxt}`;
}
