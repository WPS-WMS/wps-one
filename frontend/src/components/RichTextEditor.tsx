"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteCharsBeforeCaret,
  getCaretRectForMention,
  getMentionMatchAtCaret,
} from "@/lib/mentionAtCaret";
import { getClipboardPastePayload, insertHtmlAtSelection } from "@/lib/richTextPaste";
import { getPlainTextFromHtml, linkifyElementContent } from "@/lib/linkifyContent";
import { RichHtmlBody } from "@/components/RichHtmlBody";
import {
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_MAX_MB,
} from "@/lib/ticketAttachmentLimits";
import { Bold, Italic, Underline, List, ListOrdered, Type, Image as ImageIcon } from "lucide-react";

export type MentionUserOption = { id: string; name: string; email?: string };

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  onImageUpload?: (file: File) => Promise<string>;
  disabled?: boolean;
  /** Usuários disponíveis para menção com @ */
  mentionUsers?: MentionUserOption[];
};

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const DEFAULT_FONT_PX = 14;
const MIN_FONT_PX = 10;
const MAX_FONT_PX = 28;

function getFontSizePxAtCaret(node: Node | null, editor: HTMLElement): number {
  if (!node) return DEFAULT_FONT_PX;
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  while (el && el !== editor) {
    const inline = el.style?.fontSize;
    if (inline) {
      const parsed = parseInt(inline, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    el = el.parentElement;
  }
  const parent =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof HTMLElement ? node : null;
  if (parent) {
    const computed = parseInt(window.getComputedStyle(parent).fontSize, 10);
    if (!Number.isNaN(computed)) return computed;
  }
  return DEFAULT_FONT_PX;
}

function applyFontSizePx(range: Range, editor: HTMLElement, sizePx: number) {
  const size = `${sizePx}px`;
  const span = document.createElement("span");
  span.style.fontSize = size;
  span.style.lineHeight = "1.45";

  if (range.collapsed) {
    span.appendChild(document.createTextNode("\u200b"));
    range.insertNode(span);
    const caret = document.createRange();
    caret.setStart(span.firstChild!, 1);
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
    return;
  }

  const fragment = range.extractContents();
  span.appendChild(fragment);
  range.insertNode(span);
  const sel = window.getSelection();
  if (sel) {
    const next = document.createRange();
    next.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(next);
  }
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Escrever comentário...",
  maxLength = 5000,
  onImageUpload,
  disabled = false,
  mentionUsers = [],
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const [formatActive, setFormatActive] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => {
    if (disabled) {
      setCharCount(getPlainTextFromHtml(value).length);
      return;
    }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
      setCharCount(editorRef.current.innerText.length);
    }
  }, [value, disabled]);

  useEffect(() => {
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* ignore */
    }
  }, []);

  const updateContent = useCallback(() => {
    if (disabled || !editorRef.current) return;
    // Limpa artefatos (ex.: \u200b e spans vazios) para evitar “espaço” sobrando
    const editor = editorRef.current;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    for (const t of textNodes) {
      const v = t.nodeValue;
      if (v && v.includes("\u200b")) t.nodeValue = v.replace(/\u200b/g, "");
    }
    editor.querySelectorAll("span").forEach((el) => {
      const ht = el as HTMLElement;
      if (ht.style?.lineHeight) ht.style.lineHeight = "1.45";
      const isEmpty = (el.textContent ?? "").replace(/\u200b/g, "").trim() === "" && el.children.length === 0;
      if (isEmpty) el.remove();
    });

    const content = editor.innerHTML;
    const textLength = editor.innerText.length;
    setCharCount(textLength);
    if (textLength <= maxLength) {
      onChange(content);
    } else {
      const previousContent = value;
      if (editor.innerHTML !== previousContent) {
        editor.innerHTML = previousContent;
        setCharCount(editor.innerText.length);
      }
    }
  }, [disabled, maxLength, onChange, value]);

  const refreshFormatState = useCallback(() => {
    if (disabled || !editorRef.current) return;
    try {
      setFormatActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    } catch {
      /* ignore */
    }
  }, [disabled]);

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const anchor = sel?.anchorNode;
      if (!anchor || !editorRef.current?.contains(anchor)) return;
      refreshFormatState();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [refreshFormatState]);

  const execCommand = useCallback(
    (command: string, val?: string) => {
      if (disabled || !editorRef.current) return;
      editorRef.current.focus();
      document.execCommand(command, false, val);
      updateContent();
      refreshFormatState();
    },
    [disabled, updateContent, refreshFormatState],
  );

  const insertList = useCallback(
    (ordered: boolean) => {
      if (disabled || !editorRef.current) return;
      editorRef.current.focus();
      document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList", false);
      updateContent();
    },
    [disabled, updateContent],
  );

  const filteredMentionUsers = useMemo(() => {
    if (!mentionUsers.length) return [];
    const q = normalizeForSearch(mentionQuery);
    if (!q) return mentionUsers.slice(0, 12);
    return mentionUsers
      .filter((u) => {
        const name = normalizeForSearch(u.name);
        const email = normalizeForSearch(u.email ?? "");
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 12);
  }, [mentionUsers, mentionQuery]);

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery("");
  }, []);

  const checkMentionTrigger = useCallback(() => {
    if (disabled || !editorRef.current) {
      closeMention();
      return;
    }
    const editor = editorRef.current;
    const match = getMentionMatchAtCaret(editor);
    if (!match) {
      closeMention();
      return;
    }
    const sel = window.getSelection();
    if (!sel?.rangeCount) {
      closeMention();
      return;
    }
    setMentionQuery(match.query);
    setMentionOpen(true);

    const range = sel.getRangeAt(0);
    const rect =
      getCaretRectForMention(range) ??
      editor.getBoundingClientRect();
    setMentionPos({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
    });
  }, [closeMention, disabled]);

  const insertMention = useCallback(
    (user: MentionUserOption) => {
      const sel = window.getSelection();
      if (!sel || !editorRef.current) return;

      const match = getMentionMatchAtCaret(editorRef.current);
      if (!match) return;

      if (!deleteCharsBeforeCaret(match.tokenLength)) return;

      const span = document.createElement("span");
      span.className = "wps-mention";
      span.setAttribute("data-mention-id", user.id);
      span.setAttribute("data-mention-name", user.name);
      span.textContent = `@${user.name}`;

      if (sel.rangeCount > 0) {
        const insertRange = sel.getRangeAt(0);
        insertRange.insertNode(span);
      } else {
        editorRef.current.appendChild(span);
      }

      const space = document.createTextNode("\u00a0");
      span.after(space);

      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      closeMention();
      updateContent();
      editorRef.current.focus();
    },
    [closeMention, updateContent],
  );

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecione apenas arquivos de imagem.");
      return;
    }

    if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
      alert(`A imagem deve ter no máximo ${TICKET_ATTACHMENT_MAX_MB}MB.`);
      return;
    }

    setIsUploading(true);
    try {
      const imageUrl = await onImageUpload(file);
      const img = document.createElement("img");
      img.src = imageUrl;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.borderRadius = "0.5rem";
      img.style.marginTop = "0.5rem";
      img.style.marginBottom = "0.5rem";

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (editorRef.current) {
        editorRef.current.appendChild(img);
      }

      updateContent();
      editorRef.current?.focus();
    } catch {
      alert("Erro ao fazer upload da imagem.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    if (onImageUpload) {
      const imageItem = Array.from(items).find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (!file) return;
        e.preventDefault();
        if (file.size > 10 * 1024 * 1024) {
          alert("A imagem deve ter no máximo 10MB.");
          return;
        }
        setIsUploading(true);
        try {
          const imageUrl = await onImageUpload(file);
          const img = document.createElement("img");
          img.src = imageUrl;
          img.style.maxWidth = "100%";
          img.style.height = "auto";
          img.style.borderRadius = "0.5rem";
          img.style.marginTop = "0.5rem";
          img.style.marginBottom = "0.5rem";
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.insertNode(img);
            range.setStartAfter(img);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          } else if (editorRef.current) {
            editorRef.current.appendChild(img);
          }
          updateContent();
          editorRef.current?.focus();
        } catch {
          alert("Erro ao fazer upload da imagem.");
        } finally {
          setIsUploading(false);
        }
        return;
      }
    }

    e.preventDefault();
    const payload = getClipboardPastePayload(e.clipboardData);
    if (payload.type === "html") {
      const inserted = insertHtmlAtSelection(payload.html, editorRef.current);
      if (!inserted && editorRef.current) {
        editorRef.current.insertAdjacentHTML("beforeend", payload.html);
      }
    } else {
      document.execCommand("insertText", false, payload.text);
    }
    if (editorRef.current) {
      linkifyElementContent(editorRef.current);
    }
    updateContent();
  }

  const changeFontSize = useCallback(
    (delta: number) => {
      if (disabled || !editorRef.current) return;
      editorRef.current.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      const currentPx = getFontSizePxAtCaret(range.startContainer, editorRef.current);
      const newSize = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, currentPx + delta));

      if (range.collapsed) {
        const node = range.startContainer;
        const parent =
          node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof HTMLElement ? node : null;
        if (
          parent &&
          parent !== editorRef.current &&
          parent.tagName === "SPAN" &&
          parent.style.fontSize &&
          editorRef.current.contains(parent)
        ) {
          parent.style.fontSize = `${newSize}px`;
          parent.style.lineHeight = "1.45";
          updateContent();
          refreshFormatState();
          return;
        }
      }

      applyFontSizePx(range, editorRef.current, newSize);
      updateContent();
      refreshFormatState();
    },
    [disabled, updateContent, refreshFormatState],
  );

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
        return;
      }
      if (e.key === "Enter" && filteredMentionUsers.length > 0) {
        e.preventDefault();
        insertMention(filteredMentionUsers[0]);
        return;
      }
    }
  }

  function handleEditorLinkMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a[href]");
    if (!anchor || !editorRef.current?.contains(anchor)) return;
    const href = anchor.getAttribute("href")?.trim();
    if (!href || /^javascript:/i.test(href)) return;
    e.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const toolbarBtn =
    "p-2 rounded-lg text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--primary)]/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const toolbarBtnClass = (active: boolean) =>
    active
      ? `${toolbarBtn} bg-[color:var(--primary)]/15 text-[color:var(--primary)] ring-1 ring-[color:var(--primary)]/20`
      : toolbarBtn;

  return (
    <div className="wps-rich-text-editor rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
      {!disabled && (
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-2 border-b border-[color:var(--border)] bg-[color:var(--background)]/40">
        <button
          type="button"
          onClick={() => execCommand("bold")}
          disabled={disabled}
          className={toolbarBtnClass(formatActive.bold)}
          title="Negrito"
          aria-pressed={formatActive.bold}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("italic")}
          disabled={disabled}
          className={toolbarBtnClass(formatActive.italic)}
          title="Itálico"
          aria-pressed={formatActive.italic}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("underline")}
          disabled={disabled}
          className={toolbarBtnClass(formatActive.underline)}
          title="Sublinhado"
          aria-pressed={formatActive.underline}
        >
          <Underline className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-[color:var(--border)] mx-1" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => changeFontSize(2)}
            disabled={disabled}
            className={toolbarBtn}
            title="Aumentar fonte"
          >
            <div className="flex items-center">
              <Type className="h-4 w-4" />
              <span className="text-[10px] ml-0.5 leading-none">+</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => changeFontSize(-2)}
            disabled={disabled}
            className={toolbarBtn}
            title="Diminuir fonte"
          >
            <div className="flex items-center">
              <Type className="h-4 w-4" />
              <span className="text-[10px] ml-0.5 leading-none">-</span>
            </div>
          </button>
        </div>
        <div className="w-px h-6 bg-[color:var(--border)] mx-1" />
        <button
          type="button"
          onClick={() => insertList(false)}
          disabled={disabled}
          className={toolbarBtn}
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => insertList(true)}
          disabled={disabled}
          className={toolbarBtn}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        {onImageUpload && (
          <>
            <div className="w-px h-6 bg-[color:var(--border)] mx-1" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className={toolbarBtn}
              title="Adicionar imagem"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </>
        )}
      </div>
      )}

      {disabled ? (
        <div className="min-h-[128px] max-h-[320px] overflow-y-auto px-4 py-3 bg-[color:var(--background)]/50">
          {value.trim() ? (
            <RichHtmlBody html={value} />
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">{placeholder}</p>
          )}
        </div>
      ) : (
      <div
        ref={editorRef}
        contentEditable
        onInput={() => {
          updateContent();
          checkMentionTrigger();
          refreshFormatState();
        }}
        onKeyUp={() => {
          checkMentionTrigger();
          refreshFormatState();
        }}
        onMouseUp={refreshFormatState}
        onMouseDown={handleEditorLinkMouseDown}
        onKeyDown={handleEditorKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          if (editorRef.current) {
            linkifyElementContent(editorRef.current);
            updateContent();
          }
          window.setTimeout(() => closeMention(), 150);
        }}
        onFocus={refreshFormatState}
        className="wps-rich-text-editor__body min-h-[128px] max-h-[320px] overflow-y-auto px-4 py-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--primary)]/20 [&_a]:cursor-pointer [&_a]:text-[color:var(--primary)] [&_a]:underline [&_a]:break-all [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[color:var(--muted-foreground)]"
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-[color:var(--border)] bg-[color:var(--background)]/30 text-xs text-[color:var(--muted-foreground)]">
        <span>
          {mentionUsers.length > 0 ? "Digite @ para mencionar alguém" : "\u00a0"}
        </span>
        <span>
          {charCount}/{maxLength}
        </span>
      </div>

      {mentionOpen &&
        mentionPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[10050] w-64 max-h-52 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-xl py-1"
            role="listbox"
            style={{ top: mentionPos.top, left: mentionPos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {mentionUsers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">
                Nenhum membro ou responsável no projeto
              </p>
            ) : filteredMentionUsers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[color:var(--muted-foreground)]">Nenhum usuário encontrado</p>
            ) : (
              filteredMentionUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[color:var(--primary)]/[0.08] transition-colors"
                  onClick={() => insertMention(u)}
                >
                  <span className="font-medium text-[color:var(--foreground)]">{u.name}</span>
                  {u.email ? (
                    <span className="text-[11px] text-[color:var(--muted-foreground)] truncate w-full">{u.email}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
