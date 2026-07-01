const BRASIL_IANA_TIMEZONE = "America/Sao_Paulo";

const brasilYmdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRASIL_IANA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data civil AAAA-MM-DD no calendário de São Paulo — alinhado ao backend. */
export function todayYmdLocal(reference: Date = new Date()): string {
  return brasilYmdFormatter.format(reference);
}

export function ymdFromLocalDate(date: Date): string {
  return brasilYmdFormatter.format(date);
}
