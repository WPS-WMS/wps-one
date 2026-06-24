const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

const SKIP_ANCESTOR_TAGS = new Set(["A", "CODE", "PRE", "SCRIPT", "STYLE"]);

function stripTrailingPunctuation(url: string): { href: string; trailing: string } {
  let href = url;
  let trailing = "";
  while (href.length > 0) {
    const last = href[href.length - 1]!;
    if (last === ")" && (href.match(/\(/g)?.length ?? 0) < (href.match(/\)/g)?.length ?? 0)) {
      trailing = last + trailing;
      href = href.slice(0, -1);
      continue;
    }
    if (/[.,;:!?]/.test(last)) {
      trailing = last + trailing;
      href = href.slice(0, -1);
      continue;
    }
    break;
  }
  return { href, trailing };
}

export function normalizeHref(url: string): string {
  return url.startsWith("www.") ? `https://${url}` : url;
}

export function escapeHtmlText(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function looksLikeHtml(content: string): boolean {
  return /<(?:p|div|br|a|span|ul|ol|li|b|strong|i|em|u|img)\b/i.test(content);
}

export function getPlainTextFromHtml(html: string): string {
  if (typeof document === "undefined") {
    return String(html ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").trim();
}

/** Converte URLs em texto puro para HTML com âncoras. */
export function linkifyPlainTextToHtml(text: string): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";

  let result = "";
  let lastIndex = 0;
  const re = new RegExp(URL_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const start = match.index;
    result += escapeHtmlText(raw.slice(lastIndex, start));
    const { href: urlPart, trailing } = stripTrailingPunctuation(match[0]);
    const href = normalizeHref(urlPart);
    result += `<a href="${escapeHtmlText(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(urlPart)}</a>`;
    if (trailing) result += escapeHtmlText(trailing);
    lastIndex = start + match[0].length;
  }
  result += escapeHtmlText(raw.slice(lastIndex));
  return result.replace(/\n/g, "<br>");
}

function shouldSkipTextNode(node: Text): boolean {
  let el = node.parentElement;
  while (el) {
    if (SKIP_ANCESTOR_TAGS.has(el.tagName)) return true;
    if (el.classList.contains("wps-mention")) return true;
    el = el.parentElement;
  }
  return false;
}

/** Linkifica nós de texto dentro de um elemento contenteditable ou HTML existente. */
export function linkifyElementContent(root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const text = textNode.textContent ?? "";
    if (!text.trim()) continue;
    if (shouldSkipTextNode(textNode)) continue;
    URL_REGEX.lastIndex = 0;
    if (!URL_REGEX.test(text)) continue;
    nodes.push(textNode);
  }

  let changed = false;
  for (const textNode of nodes) {
    const text = textNode.textContent ?? "";
    URL_REGEX.lastIndex = 0;
    const re = new RegExp(URL_REGEX.source, "gi");
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let nodeChanged = false;
    const frag = document.createDocumentFragment();

    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }
      const { href: urlPart, trailing } = stripTrailingPunctuation(match[0]);
      const anchor = document.createElement("a");
      anchor.href = normalizeHref(urlPart);
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = urlPart;
      frag.appendChild(anchor);
      if (trailing) frag.appendChild(document.createTextNode(trailing));
      lastIndex = start + match[0].length;
      nodeChanged = true;
    }

    if (!nodeChanged) continue;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
    changed = true;
  }

  return changed;
}

export function linkifyHtmlContent(html: string): string {
  if (typeof document === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  linkifyElementContent(root);
  return root.innerHTML;
}

/** Prepara HTML para exibição: linkifica texto puro ou URLs soltas em HTML existente. */
export function prepareRichHtmlForDisplay(content: string): string {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  if (typeof document === "undefined") {
    if (!looksLikeHtml(raw)) return linkifyPlainTextToHtml(raw);
    return raw;
  }
  const root = document.createElement("div");
  root.innerHTML = looksLikeHtml(raw) ? raw : linkifyPlainTextToHtml(raw);
  linkifyElementContent(root);
  normalizeExistingAnchors(root);
  return root.innerHTML;
}

/** Garante links em HTML antes de salvar (descrição/comentário). Preserva âncoras existentes. */
export function prepareRichHtmlForSave(content: string): string {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  if (typeof document === "undefined") {
    return looksLikeHtml(raw) ? raw : linkifyPlainTextToHtml(raw);
  }
  const root = document.createElement("div");
  root.innerHTML = looksLikeHtml(raw) ? raw : linkifyPlainTextToHtml(raw);
  linkifyElementContent(root);
  normalizeExistingAnchors(root);
  return root.innerHTML;
}

function normalizeExistingAnchors(root: HTMLElement): void {
  root.querySelectorAll("a[href]").forEach((node) => {
    const anchor = node as HTMLAnchorElement;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });
}
