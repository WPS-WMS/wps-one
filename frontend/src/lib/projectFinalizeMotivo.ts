/**
 * Tipos de projeto em que é obrigatório informar motivo ao passar a tarefa para Encerrado
 * (Kanban, modal de edição e validação na API).
 */
export function projectRequiresFinalizeMotivo(tipoProjeto: string | null | undefined): boolean {
  const t = String(tipoProjeto ?? "").trim();
  return t === "AMS" || t === "TIME_MATERIAL" || t === "FIXED_PRICE" || t === "INTERNO";
}
