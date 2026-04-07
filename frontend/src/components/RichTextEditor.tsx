"use client";

import { useRef, useState, useEffect } from "react";
import { Bold, Italic, List, ListOrdered, Type, Image as ImageIcon } from "lucide-react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  onImageUpload?: (file: File) => Promise<string>;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Escrever comentário...",
  maxLength = 5000,
  onImageUpload,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
      setCharCount(editorRef.current.innerText.length);
    }
  }, [value]);

  function execCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateContent();
  }

  function updateContent() {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      // Conta apenas caracteres de texto, não tags HTML
      const textLength = editorRef.current.innerText.length;
      setCharCount(textLength);
      if (textLength <= maxLength) {
        onChange(content);
      } else {
        // Reverte se exceder o limite
        const previousContent = value;
        if (editorRef.current.innerHTML !== previousContent) {
          editorRef.current.innerHTML = previousContent;
          setCharCount(editorRef.current.innerText.length);
        }
      }
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecione apenas arquivos de imagem.");
      return;
    }

    // Limita tamanho da imagem (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      const imageUrl = await onImageUpload(file);
      // Insere a imagem no editor
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
        // Move o cursor após a imagem
        range.setStartAfter(img);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (editorRef.current) {
        editorRef.current.appendChild(img);
      }
      
      updateContent();
      editorRef.current?.focus();
    } catch (error) {
      alert("Erro ao fazer upload da imagem.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    if (onImageUpload) {
      const imageItem = Array.from(items).find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (!file) return;
        e.preventDefault();

        // Limita tamanho da imagem (5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert("A imagem deve ter no máximo 5MB.");
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

    // Fallback: mantém o comportamento atual (só texto)
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
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
    const currentSize = parseInt(getFontSize());
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
          // Se não conseguir envolver, tenta inserir o span
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
      }
    }
    updateContent();
  }

  function decreaseFontSize() {
    const currentSize = parseInt(getFontSize());
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
          // Se não conseguir envolver, tenta inserir o span
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
      }
    }
    updateContent();
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => execCommand("bold")}
          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
          title="Negrito"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("italic")}
          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
          title="Itálico"
        >
          <Italic className="h-4 w-4" />
        </button>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={increaseFontSize}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
            title="Aumentar fonte"
          >
            <div className="flex items-center">
              <Type className="h-4 w-4" />
              <span className="text-[10px] ml-0.5 leading-none">+</span>
            </div>
          </button>
          <button
            type="button"
            onClick={decreaseFontSize}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
            title="Diminuir fonte"
          >
            <div className="flex items-center">
              <Type className="h-4 w-4" />
              <span className="text-[10px] ml-0.5 leading-none">-</span>
            </div>
          </button>
        </div>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <button
          type="button"
          onClick={() => execCommand("insertUnorderedList")}
          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("insertOrderedList")}
          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        {onImageUpload && (
          <>
            <div className="w-px h-6 bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-50"
              title="Adicionar imagem"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={updateContent}
        onPaste={handlePaste}
        className="min-h-[120px] max-h-[300px] overflow-y-auto p-3 text-sm text-slate-800 focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400"
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      {/* Character count */}
      <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-right">
        {charCount}/{maxLength} caracteres
      </div>
    </div>
  );
}
