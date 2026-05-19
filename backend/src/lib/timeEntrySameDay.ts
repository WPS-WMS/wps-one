export const MSG_HORA_FIM_MENOR = "A hora fim deve ser maior que a hora início.";

export type SameDayApontamentoResult =
  | { ok: true; totalMinutes: number }
  | { ok: false; error: string };

const MINUTES_PER_DAY = 24 * 60;

function parseMinutes(h: string): number {
  const s = String(h ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}

/** Posiciona um horário na linha do tempo do apontamento (suporta virada de dia). */
function normalizeToWorkTimeline(
  clockMin: number,
  startMin: number,
  crossesMidnight: boolean,
): number {
  if (!crossesMidnight) return clockMin;
  if (clockMin >= startMin) return clockMin;
  return clockMin + MINUTES_PER_DAY;
}

/**
 * Calcula o total de minutos de um apontamento.
 * Se a hora fim for menor ou igual à hora início, considera virada de dia (fim no dia seguinte).
 */
export function calcSameDayApontamentoMinutes(
  horaInicio: string,
  horaFim: string,
  intervaloInicio?: string | null,
  intervaloFim?: string | null,
): SameDayApontamentoResult {
  const startMin = parseMinutes(horaInicio);
  const endMin = parseMinutes(horaFim);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return {
      ok: false as const,
      error: "Hora início e hora fim devem estar no formato HH:MM (00:00 a 23:59).",
    };
  }

  const crossesMidnight = endMin <= startMin;
  const effectiveEndMin = crossesMidnight ? endMin + MINUTES_PER_DAY : endMin;

  if (effectiveEndMin <= startMin) {
    return { ok: false as const, error: "Total de horas deve ser positivo" };
  }

  const intIni = String(intervaloInicio ?? "").trim();
  const intFim = String(intervaloFim ?? "").trim();
  if ((intIni && !intFim) || (!intIni && intFim)) {
    return { ok: false as const, error: "Preencha início e fim do intervalo ou deixe ambos em branco." };
  }

  let totalMin = effectiveEndMin - startMin;

  if (intIni && intFim) {
    const intervalStartMin = parseMinutes(intIni);
    const intervalEndMin = parseMinutes(intFim);
    if (!Number.isFinite(intervalStartMin) || !Number.isFinite(intervalEndMin)) {
      return {
        ok: false as const,
        error: "Intervalo início e fim devem estar no formato HH:MM (00:00 a 23:59).",
      };
    }

    let normIntervalStart = normalizeToWorkTimeline(intervalStartMin, startMin, crossesMidnight);
    let normIntervalEnd = normalizeToWorkTimeline(intervalEndMin, startMin, crossesMidnight);
    if (normIntervalEnd <= normIntervalStart) {
      normIntervalEnd += MINUTES_PER_DAY;
    }

    if (normIntervalStart < startMin || normIntervalEnd > effectiveEndMin) {
      return {
        ok: false as const,
        error:
          "O intervalo deve estar totalmente dentro do período apontado (entre a hora de início e a hora de fim).",
      };
    }
    totalMin -= normIntervalEnd - normIntervalStart;
  }

  if (totalMin <= 0) {
    return { ok: false as const, error: "Total de horas deve ser positivo" };
  }

  return { ok: true as const, totalMinutes: totalMin };
}
