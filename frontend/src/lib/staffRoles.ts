/** Alinhado ao backend `isConsultantLikeRole`: visão operacional tipo consultor. */
export function isConsultantLikeRole(role: string | undefined | null): boolean {
  return role === "CONSULTOR" || role === "ADMIN_PORTAL";
}
