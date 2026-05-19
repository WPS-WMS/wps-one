export const MSG_HORA_FIM_MENOR =
  "A hora fim deve ser maior que a hora início no mesmo dia (00:00 a 23:59). Se o trabalho passar da meia-noite, registre até 23:59 neste dia e um novo apontamento no dia seguinte a partir de 00:00.";

export type SameDayApontamentoResult =
  | { ok: true; totalMinutes: number }
  | { ok: false; error: string };

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

/** Calcula o total de minutos de um apontamento no mesmo dia (00:00 a 23:59, sem virada de dia). */
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
  if (endMin <= startMin) {
    return { ok: false as const, error: MSG_HORA_FIM_MENOR };
  }

  const intIni = String(intervaloInicio ?? "").trim();
  const intFim = String(intervaloFim ?? "").trim();
  if ((intIni && !intFim) || (!intIni && intFim)) {
    return { ok: false as const, error: "Preencha início e fim do intervalo ou deixe ambos em branco." };
  }

  let totalMin = endMin - startMin;

  if (intIni && intFim) {
    const intervalStartMin = parseMinutes(intIni);
    const intervalEndMin = parseMinutes(intFim);
    if (!Number.isFinite(intervalStartMin) || !Number.isFinite(intervalEndMin)) {
      return {
        ok: false as const,
        error: "Intervalo início e fim devem estar no formato HH:MM (00:00 a 23:59).",
      };
    }
    if (intervalEndMin <= intervalStartMin) {
      return {
        ok: false as const,
        error: "Horário de início do intervalo deve ser menor que o fim do intervalo.",
      };
    }
    if (intervalStartMin < startMin || intervalEndMin > endMin) {
      return {
        ok: false as const,
        error:
          "O intervalo deve estar totalmente dentro do período apontado (entre a hora de início e a hora de fim).",
      };
    }
    totalMin -= intervalEndMin - intervalStartMin;
  }

  if (totalMin <= 0) {
    return { ok: false as const, error: "Total de horas deve ser positivo" };
  }

  return { ok: true as const, totalMinutes: totalMin };
}
