/** Texto digitado após @ até o cursor (ex.: "jo" em "@jo"). */
export type MentionMatchAtCaret = {
  query: string;
  /** Comprimento do token completo, incluindo "@". */
  tokenLength: number;
};

/**
 * Detecta menção em andamento usando todo o texto do editor até o cursor
 * (funciona mesmo quando o caret não está num nó de texto).
 */
export function getMentionMatchAtCaret(editor: HTMLElement): MentionMatchAtCaret | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.startContainer)) return null;

  const pre = range.cloneRange();
  pre.selectNodeContents(editor);
  pre.setEnd(range.endContainer, range.endOffset);
  const before = pre.toString();
  const match = before.match(/@([^\s@]*)$/);
  if (!match) return null;
  return { query: match[1], tokenLength: match[0].length };
}

/** Remove os últimos `count` caracteres antes do cursor (suporta vários nós). */
export function deleteCharsBeforeCaret(count: number): boolean {
  if (count <= 0) return true;
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return false;
  try {
    for (let i = 0; i < count; i++) {
      sel.modify("extend", "backward", "character");
    }
    document.execCommand("delete");
    sel.collapseToEnd();
    return true;
  } catch {
    return false;
  }
}

export function getCaretRectForMention(range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) return rect;

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  marker.style.position = "relative";
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = "1em";
  const r = range.cloneRange();
  r.insertNode(marker);
  const mRect = marker.getBoundingClientRect();
  marker.remove();
  return mRect && (mRect.width > 0 || mRect.height > 0) ? mRect : null;
}
