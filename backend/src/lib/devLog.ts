/**
 * `console.log` apenas fora de `production` (menos ruído em prod).
 */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(...args);
}

/**
 * `console.log` apenas fora de `production`. Em prod, flags `DEBUG_*` são ignoradas
 * (evita vazamento de query/body em agregadores).
 */
export function devDebugLog(_flag: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(...args);
}

/** Nome da env para logs verbosos de apontamentos (`GET`/`POST`/`PATCH` em `time-entries`). */
export const DEBUG_TIME_ENTRIES = "DEBUG_TIME_ENTRIES";

const MAX_LOG_MSG = 400;

/** Trunca texto para logs (evita dumps enormes em aggregators). */
export function truncateForLog(value: string, max = MAX_LOG_MSG): string {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Resumo seguro de erro para `console.error` em produção (sem stack; mensagem limitada).
 * Útil quando o objeto original pode conter metadados longos ou aninhados.
 */
export function errorSummary(err: unknown): { name?: string; message: string; code?: string } {
  if (err instanceof Error) {
    const anyE = err as NodeJS.ErrnoException;
    const code = typeof anyE.code === "string" ? anyE.code : undefined;
    return {
      name: err.name,
      message: truncateForLog(err.message),
      code,
    };
  }
  if (typeof err === "string") {
    return { message: truncateForLog(err) };
  }
  if (err && typeof err === "object" && "message" in err) {
    const o = err as { message?: unknown; code?: unknown; name?: unknown };
    const msg = String(o.message ?? "").trim();
    const code = typeof o.code === "string" ? o.code : undefined;
    const name = typeof o.name === "string" ? o.name : undefined;
    return {
      name,
      message: truncateForLog(msg || "(sem mensagem)"),
      code,
    };
  }
  try {
    return { message: truncateForLog(JSON.stringify(err)) };
  } catch {
    return { message: truncateForLog(String(err)) };
  }
}

/** E-mail mascarado para logs (menos PII em stdout / agregadores). */
export function redactEmailForLog(email: string | null | undefined): string {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return "(sem e-mail)";
  const at = e.indexOf("@");
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain) return "(inválido)";
  const head = local.slice(0, 2);
  return `${head.length ? `${head}…` : "…"}@${domain}`;
}

/** Assunto de e-mail enxuto para logs. */
export function logLineSubject(subject: string, max = 80): string {
  return truncateForLog(String(subject ?? "").replace(/\s+/g, " ").trim(), max);
}
