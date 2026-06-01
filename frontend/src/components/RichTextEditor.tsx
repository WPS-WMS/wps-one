"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizePastedPlainText, readClipboardPlainText } from "@/lib/plainTextPaste";
import { Bold, Italic, Underline, List, ListOrdered, Type, Image as ImageIcon, AtSign } from "lucide-react";

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
  const mentionRangeRef = useRef<Range | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
      setCharCount(editorRef.current.innerText.length);
    }
  }, [value]);

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
    const content = editorRef.current.innerHTML;
    const textLength = editorRef.current.innerText.length;
    setCharCount(textLength);
    if (textLength <= maxLength) {
      onChange(content);
    } else {
      const previousContent = value;
      if (editorRef.current.innerHTML !== previousContent) {
        editorRef.current.innerHTML = previousContent;
        setCharCount(editorRef.current.innerText.length);
      }
    }
  }, [disabled, maxLength, onChange, value]);

  const execCommand = useCallback(
    (command: string, val?: string) => {
      if (disabled || !editorRef.current) return;
      editorRef.current.focus();
      document.execCommand(command, false, val);
      updateContent();
    },
    [disabled, updateContent],
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
    mentionRangeRef.current = null;
  }, []);

  const checkMentionTrigger = useCallback(() => {
    if (disabled || !mentionUsers.length || !editorRef.current) {
      closeMention();
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      closeMention();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
      closeMention();
      return;
    }
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      closeMention();
      return;
    }
    const text = node.textContent ?? "";
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (!atMatch) {
      closeMention();
      return;
    }
    mentionRangeRef.current = range.cloneRange();
    setMentionQuery(atMatch[1]);
    setMentionOpen(true);
    const rect = range.getBoundingClientRect();
    setMentionPos({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
    });
  }, [closeMention, disabled, mentionUsers.length]);

  const insertMention = useCallback(
    (user: MentionUserOption) => {
      const sel = window.getSelection();
      if (!sel || !editorRef.current) return;
      const range = mentionRangeRef.current ?? (sel.rangeCount > 0 ? sel.getRangeAt(0) : null);
      if (!range) return;

      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;

      const text = node.textContent ?? "";
      const offset = range.startOffset;
      const before = text.slice(0, offset);
      const atMatch = before.match(/@([^\s@]*)$/);
      if (!atMatch) return;

      const start = offset - atMatch[0].length;
      const deleteRange = document.createRange();
      deleteRange.setStart(node, start);
      deleteRange.setEnd(node, offset);
      deleteRange.deleteContents();

      const span = document.createElement("span");
      span.className = "wps-mention";
      span.setAttribute("data-mention-id", user.id);
      span.setAttribute("data-mention-name", user.name);
      span.textContent = `@${user.name}`;

      deleteRange.insertNode(span);
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
    const text = normalizePastedPlainText(readClipboardPlainText(e.clipboardData));
    document.execCommand("insertText", false, text);
    updateContent();
  }

  function getFontSize() {
    if (!editorRef.current) return "14px";
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "14px";
    const element = selection.anchorNode?.parentElement;
    if (!element) return "14px";
    return window.getComputedStyle(element).fontSize || "14px";
  }

  function increaseFontSize() {
    const currentSize = parseInt(getFontSize(), 10);
    const newSize = Math.min(currentSize + 2, 24);
    execCommand("fontSize", "7");
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = `${newSize}px`;
        try {
          range.surroundContents(span);
        } catch {
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
      }
    }
    updateContent();
  }

  function decreaseFontSize() {
    const currentSize = parseInt(getFontSize(), 10);
    const newSize = Math.max(currentSize - 2, 10);
    execCommand("fontSize", "1");
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = `${newSize}px`;
        try {
          range.surroundContents(span);
        } catch {
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
      }
    }
    updateContent();
  }

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

  const toolbarBtn =
    "p-2 rounded-lg text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--primary)]/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="wps-rich-text-editor rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-2 border-b border-[color:var(--border)] bg-[color:var(--background)]/40">
        <button type="button" onClick={() => execCommand("bold")} disabled={disabled} className={toolbarBtn} title="Negrito">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand("italic")} disabled={disabled} className={toolbarBtn} title="Itálico">
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("underline")}
          disabled={disabled}
          className={toolbarBtn}
          title="Sublinhado"
        >
          <Underline className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-[color:var(--border)] mx-1" />
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={increaseFontSize} disabled={disabled} className={toolbarBtn} title="Aumentar fonte">
            <div className="flex items-center">
              <Type className="h-4 w-4" />
              <span className="text-[10px] ml-0.5 leading-none">+</span>
            </div>
          </button>
          <button type="button" onClick={decreaseFontSize} disabled={disabled} className={toolbarBtn} title="Diminuir fonte">
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
        {mentionUsers.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            className={toolbarBtn}
            title="Mencionar (@)"
            onClick={() => {
              editorRef.current?.focus();
              document.execCommand("insertText", false, "@");
              updateContent();
              requestAnimationFrame(() => checkMentionTrigger());
            }}
          >
            <AtSign className="h-4 w-4" />
          </button>
        )}
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

      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={() => {
          updateContent();
          checkMentionTrigger();
        }}
        onKeyUp={checkMentionTrigger}
        onKeyDown={handleEditorKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          window.setTimeout(() => closeMention(), 150);
        }}
        className={`wps-rich-text-editor__body min-h-[128px] max-h-[320px] overflow-y-auto px-4 py-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--primary)]/20 [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[color:var(--muted-foreground)] ${
          disabled ? "bg-[color:var(--background)]/50 text-[color:var(--muted-foreground)] cursor-not-allowed" : ""
        }`}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

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
            className="fixed z-[10050] w-64 max-h-52 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl py-1"
            style={{ top: mentionPos.top, left: mentionPos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filteredMentionUsers.length === 0 ? (
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
