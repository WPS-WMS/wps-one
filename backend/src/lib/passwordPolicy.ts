export const PASSWORD_POLICY_HINT =
  "A nova senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 número e 1 caractere especial.";

/** Retorna mensagem de erro se a senha não atender à política; null se válida. */
export function validatePasswordPolicy(password: unknown): string | null {
  const value = String(password ?? "");
  if (
    value.length < 8 ||
    !/[A-ZÀ-Ý]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[^A-Za-zÀ-ÿ0-9]/.test(value)
  ) {
    return PASSWORD_POLICY_HINT;
  }
  return null;
}
