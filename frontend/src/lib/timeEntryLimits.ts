const HORAS_META = 8;

const DOW_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

/** Limite diário do usuário para uma data civil (dia da semana em horário local). */
export function getDailyLimitFromUserForDate(
  user: { limiteHorasPorDia?: string | null; limiteHorasDiarias?: number | null } | null | undefined,
  date: Date,
): number {
  const dow = date.getDay();
  const defaultDaily = dow === 0 || dow === 6 ? 0 : HORAS_META;
  if (!user) return defaultDaily;

  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : HORAS_META;
  const raw = user.limiteHorasPorDia;
  if (!raw) {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const key = DOW_KEYS[dow] as string;
    const v = map[key];
    if (typeof v === "number" && v >= 0) return v;
    return dow === 0 || dow === 6 ? 0 : fallback;
  } catch {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
}
