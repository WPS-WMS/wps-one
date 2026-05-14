"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type PopoverSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
  /** Tailwind: classe da bolinha à esquerda (ex.: bg-blue-500), opcional */
  dotClassName?: string;
};

export function PopoverSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Selecione",
  buttonClassName = "",
  menuMaxHeightClassName = "max-h-56",
}: {
  id: string;
  value: string;
  options: PopoverSelectOption[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  menuMaxHeightClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const selectedLabel = selected?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
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

  const baseButton =
    "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-4 text-sm text-[color:var(--foreground)] " +
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
                className={`rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl overflow-auto ${menuMaxHeightClassName} py-1 animate-in fade-in slide-in-from-top-2 duration-200`}
                role="listbox"
              >
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <button
                      key={o.value === "" ? "__empty__" : o.value}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "bg-[color:var(--background)]/35 text-[color:var(--foreground)]"
                          : "text-[color:var(--foreground)] hover:bg-black/5"
                      } ${o.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={o.title}
                      aria-selected={active}
                      role="option"
                    >
                      {o.dotClassName ? (
                        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${o.dotClassName}`} aria-hidden />
                      ) : null}
                      <span className="truncate block flex-1">{o.label}</span>
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.dotClassName ? (
            <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${selected.dotClassName}`} aria-hidden />
          ) : null}
          <span className={`truncate ${selectedLabel ? "" : "text-[color:var(--muted-foreground)]"}`}>
            {selectedLabel || placeholder}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </>
  );
}
