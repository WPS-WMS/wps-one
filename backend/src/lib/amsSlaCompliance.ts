/**
 * SLA AMS: resposta = da abertura até o 1º comentário PÚBLICO de consultor/gestor/super admin;
 * solução = desse comentário até a finalização (ENCERRADO).
 * Usa sempre os prazos configurados no projeto (inclui alterações posteriores).
 */

export const SLA_STAFF_ROLES = ["SUPER_ADMIN", "GESTOR_PROJETOS", "CONSULTOR", "ADMIN_PORTAL"] as const;

export type ProjectSlaFields = {
  slaRespostaBaixa: number | null;
  slaSolucaoBaixa: number | null;
  slaRespostaMedia: number | null;
  slaSolucaoMedia: number | null;
  slaRespostaAlta: number | null;
  slaSolucaoAlta: number | null;
  slaRespostaCritica: number | null;
  slaSolucaoCritica: number | null;
};

export function normalizeAmsPriorityForSla(value: string | null | undefined): "BAIXA" | "MEDIA" | "ALTA" | "CRITICA" | null {
  if (!value) return null;
  const raw = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (raw === "BAIXA" || raw === "MEDIA" || raw === "ALTA" || raw === "CRITICA") return raw;
  if (raw === "URGENTE" || raw === "CRITICO") return "CRITICA";
  return null;
}

export function getSlaHorasPorPrioridade(
  project: ProjectSlaFields,
  criticidade: string | null,
): { resposta: number | null; solucao: number | null } {
  const norm = normalizeAmsPriorityForSla(criticidade);
  if (norm === "BAIXA") {
    return { resposta: project.slaRespostaBaixa, solucao: project.slaSolucaoBaixa };
  }
  if (norm === "MEDIA") {
    return { resposta: project.slaRespostaMedia, solucao: project.slaSolucaoMedia };
  }
  if (norm === "ALTA") {
    return { resposta: project.slaRespostaAlta, solucao: project.slaSolucaoAlta };
  }
  if (norm === "CRITICA") {
    return { resposta: project.slaRespostaCritica, solucao: project.slaSolucaoCritica };
  }
  return { resposta: null, solucao: null };
}

export function slaHorasAplicavel(resposta: number | null, solucao: number | null): boolean {
  const r = resposta != null && Number(resposta) > 0;
  const s = solucao != null && Number(solucao) > 0;
  return r || s;
}

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/** Chamado AMS finalizado, com SLA configurado para a prioridade; retorna se cumpriu todas as fases configuradas. */
export function isFinalizedAmsTicketWithinSla(params: {
  createdAt: Date;
  firstStaffPublicCommentAt: Date | null;
  closedAt: Date | null;
  respostaHoras: number | null;
  solucaoHoras: number | null;
}): boolean {
  const { createdAt, firstStaffPublicCommentAt, closedAt, respostaHoras, solucaoHoras } = params;
  const r = respostaHoras != null && Number(respostaHoras) > 0 ? Number(respostaHoras) : null;
  const s = solucaoHoras != null && Number(solucaoHoras) > 0 ? Number(solucaoHoras) : null;
  if (r == null && s == null) return false;
  if (!closedAt) return false;

  if (r != null) {
    if (!firstStaffPublicCommentAt) return false;
    if (hoursBetween(createdAt, firstStaffPublicCommentAt) > r) return false;
  }

  if (s != null) {
    if (!firstStaffPublicCommentAt) return false;
    if (hoursBetween(firstStaffPublicCommentAt, closedAt) > s) return false;
  }

  return true;
}
