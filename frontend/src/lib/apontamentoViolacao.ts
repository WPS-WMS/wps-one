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
} | null | undefined): number {
  if (!user?.permitirOutroPeriodo) return 0;
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
  const rules = parseViolationRules(rule);
  if (rules.length === 0) return "Apontamento especial";
  const labels: Record<ApontamentoViolationRule, string> = {
    MAIS_HORAS: "Acima do limite diário",
    FIM_DE_SEMANA_FERIADO: "Final de semana ou feriado",
    OUTRO_PERIODO: "Fora da data atual",
  };
  return rules.map((r) => labels[r]).join(", ");
}

export function resolveApontamentoViolations(params: {
  modo: ApontamentoViolacaoModo;
  violations: ApontamentoViolationRule[];
}): "ALLOW" | "BLOCK" | "APPROVAL" {
  if (params.violations.length === 0) return "ALLOW";
  return params.modo === "ENVIAR_APROVACAO" ? "APPROVAL" : "BLOCK";
}

const VALID_VIOLATION_RULES = new Set<ApontamentoViolationRule>([
  "MAIS_HORAS",
  "FIM_DE_SEMANA_FERIADO",
  "OUTRO_PERIODO",
]);

export function encodeViolationRules(rules: ApontamentoViolationRule[]): string | null {
  const unique = Array.from(new Set(rules.filter((r) => VALID_VIOLATION_RULES.has(r))));
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return JSON.stringify(unique);
}

export function parseViolationRules(raw: unknown): ApontamentoViolationRule[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v ?? "").trim().toUpperCase())
      .filter((v): v is ApontamentoViolationRule => VALID_VIOLATION_RULES.has(v as ApontamentoViolationRule));
  }
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parseViolationRules(parsed);
    } catch {
      // ignore
    }
  }
  const up = s.toUpperCase();
  return VALID_VIOLATION_RULES.has(up as ApontamentoViolationRule)
    ? [up as ApontamentoViolationRule]
    : [];
}

export function permissionRequestDedupeKey(input: {
  userId?: unknown;
  date: unknown;
  horaInicio: unknown;
  horaFim: unknown;
  projectId?: unknown;
  ticketId?: unknown;
  replacesTimeEntryId?: unknown;
  submissionBatchId?: unknown;
}): string {
  const batchId =
    input.submissionBatchId != null && String(input.submissionBatchId).trim()
      ? String(input.submissionBatchId).trim()
      : "";
  if (batchId) return `batch:${batchId}`;
  const ymd = String(input.date ?? "").slice(0, 10);
  return [
    String(input.userId ?? ""),
    ymd,
    String(input.horaInicio ?? ""),
    String(input.horaFim ?? ""),
    String(input.projectId ?? ""),
    String(input.ticketId ?? ""),
    String(input.replacesTimeEntryId ?? ""),
  ].join("|");
}

export function dedupePendingPermissionRequests<
  T extends {
    status: string;
    userId?: unknown;
    date: unknown;
    horaInicio: unknown;
    horaFim: unknown;
    projectId?: unknown;
    ticketId?: unknown;
    project?: { id?: string } | null;
    ticket?: { id?: string } | null;
    replacesTimeEntryId?: unknown;
    violationRule?: string | null;
    submissionBatchId?: string | null;
  },
>(rows: T[]): T[] {
  const pendingByKey = new Map<string, T>();
  const out: T[] = [];
  for (const r of rows) {
    if (r.status === "PENDING") {
      const key = permissionRequestDedupeKey({
        userId: r.userId,
        date: r.date,
        horaInicio: r.horaInicio,
        horaFim: r.horaFim,
        projectId: r.projectId ?? r.project?.id,
        ticketId: r.ticketId ?? r.ticket?.id,
        replacesTimeEntryId: r.replacesTimeEntryId,
        submissionBatchId: r.submissionBatchId,
      });
      const existing = pendingByKey.get(key);
      if (existing) {
        const merged = encodeViolationRules([
          ...parseViolationRules(existing.violationRule),
          ...parseViolationRules(r.violationRule),
        ]);
        if (merged) existing.violationRule = merged;
        continue;
      }
      pendingByKey.set(key, r);
      out.push(r);
      continue;
    }
    out.push(r);
  }
  return out;
}
