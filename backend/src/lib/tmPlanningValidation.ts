/** Horas planejadas: inteiros não negativos. */
export function parsePlannedInt(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function sumWeekPlanHoras(weeks: (number | null)[] | undefined): number | null {
  if (!weeks?.length) return null;
  let sum = 0;
  let hasValue = false;
  for (const v of weeks) {
    if (v != null && Number.isFinite(v)) {
      sum += v;
      hasValue = true;
    }
  }
  return hasValue ? sum : null;
}

export function resolveMesPlanejado(
  mes: number | null | undefined,
  weeks: (number | null)[] | undefined,
): number | null {
  if (mes != null && Number.isFinite(mes)) return Number(mes);
  return sumWeekPlanHoras(weeks);
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
