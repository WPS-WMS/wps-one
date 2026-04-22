import DOMPurify from "dompurify";

// Sanitização no cliente (defesa em profundidade) para HTML vindo do banco.
// O backend já sanitiza, mas mantemos isto para reduzir impacto de regressões.
export function sanitizeClientHtml(html: string): string {
  if (typeof window === "undefined") return String(html || "");
  return DOMPurify.sanitize(String(html || ""), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["svg", "math", "iframe", "object", "embed", "script", "style", "link", "meta"],
  });
}

