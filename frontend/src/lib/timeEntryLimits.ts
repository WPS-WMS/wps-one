const HORAS_META = 8;

const DOW_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

/**
 * Limite diário do usuário para uma data civil do apontamento (dia da semana em UTC).
 * As colunas da semana usam meia-noite UTC; getDay() local deslocava sáb↔sex no Brasil.
 */
export function getDailyLimitFromUserForDate(
  user: { limiteHorasPorDia?: string | null; limiteHorasDiarias?: number | null } | null | undefined,
  date: Date,
): number {
  const dow = date.getUTCDay();
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
