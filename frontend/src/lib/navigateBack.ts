import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Volta para a tela anterior do histórico. Se não houver histórico navegável
 * (ex.: abertura direta em nova aba), usa o fallback.
 */
export function navigateBack(router: AppRouterInstance, fallbackHref: string) {
  if (typeof window === "undefined") {
    router.push(fallbackHref);
    return;
  }

  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === "number" && idx > 0) {
    router.back();
    return;
  }

  if (window.history.length > 1) {
    router.back();
    return;
  }

  router.push(fallbackHref);
}
