/**
 * Acesso ao painel da plataforma (WPS): vê todos os tenants.
 * Mesma regra em QA e produção — apenas o perfil `PLATFORM_ADMIN`.
 */
export async function isPlatformAdmin(user: {
  email?: string;
  role: string;
  tenantId?: string;
}): Promise<boolean> {
  return String(user.role || "").toUpperCase() === "PLATFORM_ADMIN";
}
