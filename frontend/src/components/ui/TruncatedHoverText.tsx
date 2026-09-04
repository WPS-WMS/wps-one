"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Texto em uma linha com reticências; no hover mostra o conteúdo completo. */
export function TruncatedHoverText({
  text,
  empty = "—",
  className = "",
}: {
  text: string | null | undefined;
  empty?: string;
  className?: string;
}) {
  const value = String(text ?? "").trim();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; showAbove: boolean } | null>(null);

  function show() {
    if (!value) return;
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const maxW = 360;
    const left = Math.min(box.left, Math.max(8, window.innerWidth - maxW - 8));
    const showAbove = box.bottom > window.innerHeight - 140;
    const top = showAbove ? Math.max(8, box.top - 8) : box.bottom + 6;
    setRect({ top, left, showAbove });
    setOpen(true);
  }

  return (
    <>
      <span
        ref={ref}
        className={`block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
      >
        {value || empty}
      </span>
      {open && value && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[10000] max-w-[360px] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm shadow-lg"
              style={{
                top: rect.showAbove ? undefined : rect.top,
                bottom: rect.showAbove ? window.innerHeight - rect.top : undefined,
                left: rect.left,
                borderColor: "var(--border)",
                background: "var(--popover, var(--surface))",
                color: "var(--foreground)",
              }}
            >
              {value}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
