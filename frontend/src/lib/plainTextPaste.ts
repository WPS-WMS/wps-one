import type { ClipboardEventHandler } from "react";

const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g;

/** Limpa espaços extras típicos de colagem (Word, e-mail, páginas web). */
export function normalizePastedPlainText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(UNICODE_SPACES, " ")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Prefer HTML→texto quando existir (menos lixo que text/plain de alguns apps). */
export function readClipboardPlainText(clipboardData: DataTransfer): string {
  const html = clipboardData.getData("text/html");
  const plain = clipboardData.getData("text/plain");
  if (html.trim() && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = html;
    const fromHtml = el.innerText ?? el.textContent ?? "";
    if (fromHtml.trim()) return fromHtml;
  }
  return plain;
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
