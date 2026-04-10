/**
 * Tópicos (SUBPROJETO) guardam um código interno alfanumérico no backend; não exibimos como # de chamado.
 */

export function isTopicTicket(type: string | undefined | null): boolean {
  return String(type ?? "") === "SUBPROJETO";
}

/** "Código: título" ou só título para tópico (ou código interno tp_* sem type na resposta). */
export function ticketCodeTitleLine(
  type: string | undefined | null,
  code: string,
  title: string,
): string {
  if (isTopicTicket(type)) return title;
  const c = String(code).trim();
  if ((type == null || type === "") && /^tp_[a-f0-9]+$/i.test(c)) return title;
  return c ? `${c}: ${title}` : title;
}
