/** Horas planejadas: inteiros não negativos. */
export function parsePlannedInt(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function validateWeekSumNotExceedingMonth(
  mesVal: number | null | undefined,
  weekArr: (number | null)[] | undefined
): string | null {
  if (mesVal == null || mesVal === undefined || !weekArr) return null;
  const sum = weekArr.reduce((acc, w) => acc + (w ?? 0), 0);
  if (sum > mesVal) {
    return "A soma do planejado semanal não pode ultrapassar o mês planejado.";
  }
  return null;
}
