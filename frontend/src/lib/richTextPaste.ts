import DOMPurify from "dompurify";
import { normalizePastedPlainText, readClipboardPlainText } from "@/lib/plainTextPaste";
import { escapeHtmlText, normalizeHref } from "@/lib/linkifyContent";

export type ClipboardPastePayload =
  | { type: "html"; html: string }
  | { type: "plain"; text: string };

function isAllowedLinkHref(href: string): boolean {
  const raw = String(href ?? "").trim();
  if (!raw) return false;
  try {
    const u = new URL(raw, "https://wpsone.com.br");
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function containsAnchorLinks(html: string): boolean {
  if (!html.trim()) return false;
  if (typeof document === "undefined") {
    return /<a\s[^>]*href\s*=\s*["']?https?:/i.test(html);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("a[href]")).some((a) =>
    isAllowedLinkHref(a.getAttribute("href") ?? ""),
  );
}

function isPlainUrl(text: string): boolean {
  const t = text.trim();
  return /^(?:https?:\/\/|www\.)[^\s<>"']+$/i.test(t);
}

function normalizePastedAnchors(html: string): string {
  if (typeof document === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("a[href]").forEach((node) => {
    const anchor = node as HTMLAnchorElement;
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!isAllowedLinkHref(href)) {
      anchor.replaceWith(document.createTextNode(anchor.textContent ?? ""));
      return;
    }
    anchor.setAttribute("href", href);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });
  return root.innerHTML;
}

/** Sanitiza HTML colado no RichTextEditor, preservando links e formatação básica. */
export function sanitizePastedEditorHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const cleaned = DOMPurify.sanitize(String(html || ""), {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "p",
      "br",
      "div",
      "span",
      "ul",
      "ol",
      "li",
      "a",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "style", "class"],
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["svg", "math", "iframe", "object", "embed", "script", "style", "link", "meta"],
  });
  return normalizePastedAnchors(cleaned);
}

function buildAnchorHtml(href: string, label: string): string {
  const safeHref = normalizeHref(href.trim());
  const safeLabel = escapeHtmlText(label.trim() || safeHref);
  return `<a href="${escapeHtmlText(safeHref)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
}

/** Decide como colar: preserva hyperlinks do HTML ou linkifica URL em texto puro. */
export function getClipboardPastePayload(clipboardData: DataTransfer): ClipboardPastePayload {
  const htmlRaw = clipboardData.getData("text/html")?.trim() ?? "";
  const plainRaw = clipboardData.getData("text/plain") ?? "";
  const plain = normalizePastedPlainText(plainRaw);

  if (htmlRaw && containsAnchorLinks(htmlRaw)) {
    const sanitized = sanitizePastedEditorHtml(htmlRaw);
    if (sanitized.trim()) {
      return { type: "html", html: sanitized };
    }
  }

  if (isPlainUrl(plain)) {
    return { type: "html", html: buildAnchorHtml(plain, plain) };
  }

  // Hyperlink copiado: plain = título, html = <a href="...">título</a> (mesmo sem passar no parser)
  if (htmlRaw && plain.trim()) {
    const hrefMatch = htmlRaw.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch?.[1]?.trim() ?? "";
    if (isAllowedLinkHref(href)) {
      return { type: "html", html: buildAnchorHtml(href, plain) };
    }
  }

  return { type: "plain", text: plain || readClipboardPlainText(clipboardData) };
}

export function insertHtmlAtSelection(html: string, root?: HTMLElement | null): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (root && !root.contains(range.commonAncestorContainer)) return false;

  range.deleteContents();
  const template = document.createElement("template");
  template.innerHTML = html;
  const frag = template.content;
  range.insertNode(frag);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
