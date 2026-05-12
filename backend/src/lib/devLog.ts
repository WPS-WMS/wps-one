function envFlagTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * `console.log` apenas fora de `production` (menos ruído em prod).
 */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(...args);
}

/**
 * `console.log` se **não** for `production`, **ou** se a variável de ambiente `flag` for verdadeira
 * (`1`, `true`, `yes`, `on`). Útil para staging com `NODE_ENV=production` e logs pontuais.
 *
 * Ex.: `DEBUG_TIME_ENTRIES=true` para logs de `time-entries`.
 */
export function devDebugLog(flag: string, ...args: unknown[]): void {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !envFlagTruthy(process.env[flag])) return;
  console.log(...args);
}

/** Nome da env para logs verbosos de apontamentos (`GET`/`POST`/`PATCH` em `time-entries`). */
export const DEBUG_TIME_ENTRIES = "DEBUG_TIME_ENTRIES";
