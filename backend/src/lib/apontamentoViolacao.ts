export type ApontamentoViolacaoModo = "NAO_PERMITIR" | "ENVIAR_APROVACAO";

export type ApontamentoViolationRule =
  | "MAIS_HORAS"
  | "FIM_DE_SEMANA_FERIADO"
  | "OUTRO_PERIODO";

export function normalizeApontamentoViolacaoModo(raw: unknown): ApontamentoViolacaoModo {
  return String(raw ?? "").trim().toUpperCase() === "ENVIAR_APROVACAO"
    ? "ENVIAR_APROVACAO"
    : "NAO_PERMITIR";
}

export function getMaxPastDaysFromUser(user: {
  diasPermitidos?: string | null;
  permitirOutroPeriodo?: boolean | null;
}): number {
  if (!user.permitirOutroPeriodo) return 0;
  const raw = user.diasPermitidos;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 0) return n;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    // ignore
  }
  return 0;
}

export function detectApontamentoViolations(input: {
  permitirMaisHoras?: boolean | null;
  permitirFimDeSemana?: boolean | null;
  permitirOutroPeriodo?: boolean | null;
  entryYmd: string;
  todayYmd: string;
  isWeekend: boolean;
  isHoliday: boolean;
  willExceedByEntry: boolean;
  willExceedByDay: boolean;
}): ApontamentoViolationRule[] {
  const rules: ApontamentoViolationRule[] = [];
  if (
    !input.permitirMaisHoras &&
    (input.willExceedByEntry || input.willExceedByDay)
  ) {
    rules.push("MAIS_HORAS");
  }
  if (!input.permitirFimDeSemana && (input.isWeekend || input.isHoliday)) {
    rules.push("FIM_DE_SEMANA_FERIADO");
  }
  if (!input.permitirOutroPeriodo && input.entryYmd !== input.todayYmd) {
    rules.push("OUTRO_PERIODO");
  }
  return rules;
}

export function getViolationBlockMessage(rule: ApontamentoViolationRule): string {
  switch (rule) {
    case "MAIS_HORAS":
      return "Este apontamento excede o limite diário permitido para o seu usuário.";
    case "FIM_DE_SEMANA_FERIADO":
      return "Você não tem permissão para apontar em finais de semana ou feriados.";
    case "OUTRO_PERIODO":
      return "Você não tem permissão para apontar em outras datas fora da data atual.";
    default:
      return "Você não tem permissão para realizar este apontamento.";
  }
}

export function getViolationRuleLabel(rule: ApontamentoViolationRule | string | null | undefined): string {
  switch (String(rule ?? "").toUpperCase()) {
    case "MAIS_HORAS":
      return "Acima do limite diário";
    case "FIM_DE_SEMANA_FERIADO":
      return "Final de semana ou feriado";
    case "OUTRO_PERIODO":
      return "Fora da data atual";
    default:
      return "Apontamento especial";
  }
}

export function resolveApontamentoViolations(params: {
  modo: ApontamentoViolacaoModo;
  violations: ApontamentoViolationRule[];
}): "ALLOW" | "BLOCK" | "APPROVAL" {
  if (params.violations.length === 0) return "ALLOW";
  return params.modo === "ENVIAR_APROVACAO" ? "APPROVAL" : "BLOCK";
}
