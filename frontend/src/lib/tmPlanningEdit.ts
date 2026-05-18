/** Horas planejadas (mês/semana): apenas inteiros não negativos. */
export function parsePlannedIntInput(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** Divide o total do mês em partes iguais (inteiros); sobra nas primeiras semanas. */
export function distributePlannedToWeekStrings(total: number, weekCount: number): string[] {
  if (weekCount <= 0) return [];
  const safe = Math.max(0, Math.round(total));
  if (safe === 0) return Array.from({ length: weekCount }, () => "0");
  const base = Math.floor(safe / weekCount);
  const remainder = safe - base * weekCount;
  return Array.from({ length: weekCount }, (_, i) => String(base + (i < remainder ? 1 : 0)));
}

export function sumPlannedWeekStrings(weeks: string[]): number {
  return weeks.reduce((acc, s) => acc + (parsePlannedIntInput(s) ?? 0), 0);
}

/** Soma das horas semanais gravadas (ignora células vazias). */
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

/** Soma das semanas tem prioridade; senão usa o valor mensal gravado. */
export function resolveMesPlanejado(
  mes: number | null | undefined,
  weeks: (number | null)[] | undefined,
): number | null {
  const fromWeeks = sumWeekPlanHoras(weeks);
  if (fromWeeks != null) return fromWeeks;
  if (mes != null && Number.isFinite(mes)) return mes;
  return null;
}

export function setPlannedWeekCell(weeks: string[], index: number, rawValue: string): string[] {
  const next = [...weeks];
  while (next.length <= index) next.push("");
  next[index] = rawValue;
  return next;
}

/** Atualiza o rascunho do mês a partir da soma das semanas. */
export function draftMesStringFromWeeks(weeks: string[]): string {
  return String(sumPlannedWeekStrings(weeks));
}

export function buildPlannedSavePayload(
  draftMes: string,
  draftWeeks: string[],
  expectedWeekCount: number
): { mesPlanejado: number | null; weekPlanHoras: number[] } {
  if (draftWeeks.length !== expectedWeekCount) {
    throw new Error("Inconsistência no número de semanas.");
  }

  const weekPlanHoras = draftWeeks.map((s) => {
    const t = s.trim();
    if (!t) return 0;
    const n = parsePlannedIntInput(t);
    if (n == null) throw new Error("Planejado semanal inválido. Use números inteiros.");
    return n;
  });

  const sum = weekPlanHoras.reduce((a, b) => a + b, 0);
  const mesTrim = draftMes.trim();
  let mesPlanejado = sum;
  if (sum === 0 && mesTrim) {
    const n = parsePlannedIntInput(mesTrim);
    if (n == null) throw new Error("Mês planejado inválido. Use um número inteiro de horas.");
    mesPlanejado = n;
  }

  return { mesPlanejado, weekPlanHoras };
}
