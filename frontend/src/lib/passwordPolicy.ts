export const PASSWORD_POLICY_HINT =
  "Mínimo 8 caracteres, com pelo menos 1 letra maiúscula, 1 número e 1 caractere especial.";

/** Retorna mensagem de erro se a senha não atender à política; null se válida. */
export function validatePasswordPolicy(password: string): string | null {
  if (
    password.length < 8 ||
    !/[A-ZÀ-Ý]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-zÀ-ÿ0-9]/.test(password)
  ) {
    return PASSWORD_POLICY_HINT;
  }
  return null;
}

export function passwordsMatch(a: string, b: string): boolean {
  return a === b;
}
