import type { ClipboardEventHandler } from "react";

const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g;
const BLOCK_TAGS = /^(P|DIV|LI|H[1-6]|TR|BLOCKQUOTE|SECTION|ARTICLE)$/i;

/** Converte HTML do clipboard em texto, preservando quebras de parágrafo. */
export function htmlClipboardToPlainText(html: string): string {
  if (typeof document === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parts: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === "BR") {
      parts.push("\n");
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }

    if (BLOCK_TAGS.test(tag)) {
      parts.push("\n\n");
    }
  }

  walk(doc.body);
  return parts.join("");
}

function isJunkTrailingLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 2 && /^[''`´.,;:\-–—]+$/.test(t);
}

/** Limpa espaços extras típicos de colagem (Word, e-mail, páginas web). */
export function normalizePastedPlainText(raw: string): string {
  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(UNICODE_SPACES, " ")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    // Word/HTML às vezes cola "frase.Seguinte" sem espaço após o ponto
    .replace(/\.([A-ZÀ-ÜÁÉÍÓÚÂÊÔÃÇ])/g, ". $1")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n");

  const lines = text.split("\n").map((line) => line.trimEnd());
  const folded: string[] = [];
  for (const line of lines) {
    const empty = line.trim() === "";
    if (empty) {
      if (folded.length > 0 && folded[folded.length - 1] === "") continue;
      folded.push("");
    } else {
      folded.push(line);
    }
  }

  while (folded.length > 0) {
    const last = folded[folded.length - 1]!;
    if (last === "" || isJunkTrailingLine(last)) {
      folded.pop();
      continue;
    }
    break;
  }

  return folded.join("\n");
}

function pickClipboardSource(html: string, plain: string): string {
  if (!html.trim() || typeof document === "undefined") return plain;

  const fromHtml = htmlClipboardToPlainText(html);
  if (!fromHtml.trim()) return plain;

  const htmlNorm = normalizePastedPlainText(fromHtml);
  if (!plain.trim()) return fromHtml;

  const plainNorm = normalizePastedPlainText(plain);

  // Word: HTML costuma trazer dezenas de <p> vazios; text/plain costuma ser mais limpo
  const countBlankRuns = (s: string) => (s.match(/\n\n/g) ?? []).length;
  const htmlBlanks = countBlankRuns(htmlNorm);
  const plainBlanks = countBlankRuns(plainNorm);

  if (htmlBlanks > plainBlanks + 2 && plainNorm.length >= htmlNorm.length * 0.5) {
    return plain;
  }

  if (plainNorm.length > 0 && htmlNorm.length > plainNorm.length * 1.8) {
    return plain;
  }

  return fromHtml;
}

/** Prefer HTML estruturado quando for mais fiel; senão text/plain. */
export function readClipboardPlainText(clipboardData: DataTransfer): string {
  const plain = clipboardData.getData("text/plain");
  const html = clipboardData.getData("text/html");
  return pickClipboardSource(html, plain);
}

export function mergeTextAtSelection(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
  maxLength: number,
): { value: string; cursor: number } {
  const before = current.slice(0, selectionStart);
  const after = current.slice(selectionEnd);
  const room = maxLength - before.length - after.length;
  const clipped = room <= 0 ? "" : insert.slice(0, room);
  const value = before + clipped + after;
  return { value, cursor: selectionStart + clipped.length };
}

export function createPlainTextPasteHandler(options: {
  getValue: () => string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
}): ClipboardEventHandler<HTMLTextAreaElement> {
  return (e) => {
    if (options.disabled) return;
    e.preventDefault();
    const raw = readClipboardPlainText(e.clipboardData);
    const text = normalizePastedPlainText(raw);
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const { value, cursor } = mergeTextAtSelection(
      options.getValue(),
      start,
      end,
      text,
      options.maxLength,
    );
    options.onChange(value);
    requestAnimationFrame(() => {
      ta.setSelectionRange(cursor, cursor);
    });
  };
}
