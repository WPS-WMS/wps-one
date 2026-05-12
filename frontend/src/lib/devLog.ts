function envFlagTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

/** Consola apenas fora de `production` (Next dev / preview local). */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(...args);
}

/**
 * Igual ao backend: loga se não for `production` **ou** se `process.env[flag]` for verdadeiro.
 * No browser, só variáveis `NEXT_PUBLIC_*` estão disponíveis — use por exemplo `NEXT_PUBLIC_DEBUG_UI`.
 */
export function devDebugLog(flag: string, ...args: unknown[]): void {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !envFlagTruthy(process.env[flag])) return;
  console.log(...args);
}
