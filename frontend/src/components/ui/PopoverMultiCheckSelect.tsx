"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type MultiCheckOption = {
  value: string;
  label: string;
};

export function PopoverMultiCheckSelect({
  id,
  values,
  options,
  onChange,
  disabled = false,
  placeholder = "Nenhum",
  buttonClassName = "",
  menuMaxHeightClassName = "max-h-56",
}: {
  id: string;
  values: string[];
  options: MultiCheckOption[];
  onChange: (nextValues: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  menuMaxHeightClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const labelByValue = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const selectedSet = useMemo(() => new Set(values), [values]);

  const summary = useMemo(() => {
    if (values.length === 0) return placeholder;
    const labels = values.map((v) => labelByValue.get(v) ?? v).filter(Boolean);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }, [values, labelByValue, placeholder]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 8, width: Math.max(r.width, 180) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const anchor = anchorRef.current;
      const menu = document.getElementById(id);
      const inside =
        (anchor && target && anchor.contains(target)) || (menu && target && menu.contains(target));
      if (!inside) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, id]);

  function toggleValue(value: string) {
    const has = selectedSet.has(value);
    onChange(has ? values.filter((v) => v !== value) : [...values, value]);
  }

  const baseButton =
    "w-full min-w-[120px] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2 px-3 text-xs text-[color:var(--foreground)] " +
    "focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 focus:border-[color:var(--primary)] text-left inline-flex items-center justify-between gap-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200";

  return (
    <>
      {typeof document !== "undefined" && open && menuRect
        ? createPortal(
            <div
              id={id}
              style={{
                position: "fixed",
                left: menuRect.left,
                top: menuRect.top,
                width: menuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className={`rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl overflow-auto ${menuMaxHeightClassName} py-1`}
                role="listbox"
              >
                {options.map((o) => {
                  const checked = selectedSet.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleValue(o.value)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--background)]/60 transition"
                    >
                      <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${baseButton}${open ? " shadow-sm" : ""}${buttonClassName ? ` ${buttonClassName}` : ""}`}
        aria-expanded={open}
      >
        <span className={`truncate ${values.length === 0 ? "text-[color:var(--muted-foreground)]" : ""}`}>
          {summary}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-[color:var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </>
  );
}
