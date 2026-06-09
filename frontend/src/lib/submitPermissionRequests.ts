import type { ApontamentoViolationRule } from "./apontamentoViolacao";
import type { TimeEntryPermissionPayload } from "@/components/TimeEntryPermissionModal";

export async function submitPermissionRequestsForViolations(
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>,
  payload: TimeEntryPermissionPayload,
  rules: ApontamentoViolationRule[],
  justification: string,
  submissionBatchId: string,
): Promise<void> {
  for (const violationRule of rules) {
    const res = await apiFetch("/api/permission-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        justification,
        date: payload.date,
        horaInicio: payload.horaInicio,
        horaFim: payload.horaFim,
        intervaloInicio: payload.intervaloInicio,
        intervaloFim: payload.intervaloFim,
        totalHoras: payload.totalHoras,
        description: payload.description,
        projectId: payload.projectId,
        ticketId: payload.ticketId,
        activityId: payload.activityId,
        replacesTimeEntryId: payload.replacesTimeEntryId,
        violationRule,
        submissionBatchId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "Erro ao enviar solicitação para aprovação.");
    }
  }
}

export function getApprovalRulesSummary(rules: ApontamentoViolationRule[]): string {
  const labels: Record<ApontamentoViolationRule, string> = {
    MAIS_HORAS: "acima do limite diário",
    FIM_DE_SEMANA_FERIADO: "final de semana ou feriado",
    OUTRO_PERIODO: "fora da data atual",
  };
  const parts = rules.map((r) => labels[r]);
  if (parts.length === 0) return "regras especiais de apontamento";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
