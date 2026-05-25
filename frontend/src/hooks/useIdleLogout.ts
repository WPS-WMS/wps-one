"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getToken } from "@/lib/api";
import {
  IDLE_ACTIVITY_STORAGE_KEY,
  IDLE_SESSION_MS,
  isSessionIdle,
  touchSessionActivity,
} from "@/lib/idleSession";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
] as const;

const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_THROTTLE_MS = 1_000;

/** Rotas públicas: sem contagem de inatividade. */
const PUBLIC_PATH_PREFIXES = ["/login", "/reset-senha"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Encerra a sessão após {@link IDLE_SESSION_MS} sem interação (sincronizado entre abas via localStorage).
 */
export function useIdleLogout(enabled: boolean, onIdle: () => void): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!enabled || !getToken() || isPublicPath(pathname)) return;

    let lastBump = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastBump < ACTIVITY_THROTTLE_MS) return;
      lastBump = now;
      touchSessionActivity();
    };

    const checkIdle = () => {
      if (isSessionIdle(IDLE_SESSION_MS)) onIdleRef.current();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === IDLE_ACTIVITY_STORAGE_KEY) checkIdle();
    };
    window.addEventListener("storage", onStorage);

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkIdle();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    // Verifica inatividade antes de qualquer evento — não renovar o prazo ao abrir o app.
    checkIdle();

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [enabled, pathname]);
}
