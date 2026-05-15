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

/** Impede que a soma das semanas ultrapasse o teto do mês planejado. */
export function applyWeekPlannedEdit(
  weeks: string[],
  index: number,
  rawValue: string,
  monthCap: number | null
): string[] {
  const next = [...weeks];
  while (next.length <= index) next.push("");
  next[index] = rawValue;

  if (monthCap == null) return next;

  const parsed = parsePlannedIntInput(rawValue);
  if (parsed == null) return next;

  const othersSum = weeks.reduce((sum, w, j) => {
    if (j === index) return sum;
    return sum + (parsePlannedIntInput(w) ?? 0);
  }, 0);

  const maxAllowed = Math.max(0, monthCap - othersSum);
  if (parsed > maxAllowed) next[index] = String(maxAllowed);
  return next;
}

export function buildPlannedSavePayload(
  draftMes: string,
  draftWeeks: string[],
  expectedWeekCount: number
): { mesPlanejado: number | null; weekPlanHoras: number[] } {
  if (draftWeeks.length !== expectedWeekCount) {
    throw new Error("Inconsistência no número de semanas.");
  }

  const mesTrim = draftMes.trim();
  let mesPlanejado: number | null = null;
  if (mesTrim) {
    const n = parsePlannedIntInput(mesTrim);
    if (n == null) throw new Error("Mês planejado inválido. Use um número inteiro de horas.");
    mesPlanejado = n;
  }

  const weekPlanHoras = draftWeeks.map((s) => {
    const t = s.trim();
    if (!t) return 0;
    const n = parsePlannedIntInput(t);
    if (n == null) throw new Error("Planejado semanal inválido. Use números inteiros.");
    return n;
  });

  if (mesPlanejado != null) {
    const sum = weekPlanHoras.reduce((a, b) => a + b, 0);
    if (sum > mesPlanejado) {
      throw new Error("A soma do planejado semanal não pode ultrapassar o mês planejado.");
    }
  }

  return { mesPlanejado, weekPlanHoras };
}
