/** Enquanto digita: só dígitos, formata HH:MM a partir do 3º dígito. */
export function formatHorasInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Ao sair do campo: completa hora parcial para HH:MM.
 * Ex.: "8" / "08" → "08:00"; "830" → "08:30"; "08:3" → "08:30".
 * Campo vazio permanece vazio. Valor inválido (hora > 23 etc.) permanece como estava.
 */
export function completeHorasInputOnBlur(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return raw;

  let hh: number;
  let mm: number;

  if (digits.length <= 2) {
    hh = Number(digits);
    mm = 0;
  } else if (digits.length === 3) {
    hh = Number(digits.slice(0, 2));
    mm = Number(digits.slice(2).padEnd(2, "0"));
  } else {
    hh = Number(digits.slice(0, 2));
    mm = Number(digits.slice(2));
  }

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return raw;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
