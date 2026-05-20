/** Tempo máximo sem interação antes do logoff automático (10 minutos). */
export const IDLE_SESSION_MS = 10 * 60 * 1000;

const STORAGE_KEY = "wps_last_activity_at";

export function touchSessionActivity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* quota / modo privado */
  }
}

export function getLastSessionActivity(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  } catch {
    return Date.now();
  }
}

export function clearSessionActivity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSessionIdle(idleMs: number = IDLE_SESSION_MS): boolean {
  return Date.now() - getLastSessionActivity() >= idleMs;
}

export const IDLE_ACTIVITY_STORAGE_KEY = STORAGE_KEY;
