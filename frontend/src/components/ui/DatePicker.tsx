"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatarData } from "@/lib/brFormatters";

type MenuRect = {
  left: number;
  top: number;
  width: number;
};

const VIEWPORT_GAP = 8;
const PANEL_WIDTH = 288;
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const m = ISO_DATE_RE.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayParts(): { y: number; m: number; d: number } {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function startOfMonthWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}

function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clampMonth(y: number, m: number): { y: number; m: number } {
  if (m < 1) return { y: y - 1, m: 12 };
  if (m > 12) return { y: y + 1, m: 1 };
  return { y, m };
}

function monthTitle(y: number, m: number): string {
  const raw = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type DayCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
};

function buildMonthGrid(
  y: number,
  m: number,
  min?: string,
  max?: string,
): DayCell[] {
  const firstWeekday = startOfMonthWeekday(y, m);
  const dim = daysInMonth(y, m);
  const prev = clampMonth(y, m - 1);
  const prevDim = daysInMonth(prev.y, prev.m);
  const next = clampMonth(y, m + 1);

  const cells: DayCell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevDim - i;
    const iso = toIsoDate(prev.y, prev.m, day);
    cells.push({
      iso,
      day,
      inMonth: false,
      disabled:
        (min != null && compareIso(iso, min) < 0) ||
        (max != null && compareIso(iso, max) > 0),
    });
  }

  for (let day = 1; day <= dim; day++) {
    const iso = toIsoDate(y, m, day);
    cells.push({
      iso,
      day,
      inMonth: true,
      disabled:
        (min != null && compareIso(iso, min) < 0) ||
        (max != null && compareIso(iso, max) > 0),
    });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const iso = toIsoDate(next.y, next.m, nextDay);
    cells.push({
      iso,
      day: nextDay,
      inMonth: false,
      disabled:
        (min != null && compareIso(iso, min) < 0) ||
        (max != null && compareIso(iso, max) > 0),
    });
    nextDay += 1;
    if (cells.length >= 42) break;
  }

  return cells;
}

export type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Classe do botão trigger (ex.: inputClass / reportsInputClass). */
  buttonClassName?: string;
  min?: string;
  max?: string;
  /** Exibe ação para limpar (útil em filtros opcionais). Default: true. */
  clearable?: boolean;
  title?: string;
  "aria-label"?: string;
};

export function DatePicker({
  id: idProp,
  value,
  onChange,
  disabled = false,
  placeholder = "dd/mm/aaaa",
  buttonClassName = "",
  min,
  max,
  clearable = true,
  title,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const reactId = useId();
  const panelId = idProp ?? `datepicker-${reactId}`;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const [focusIso, setFocusIso] = useState<string>("");

  const parsed = useMemo(() => (value ? parseIsoDate(value) : null), [value]);
  const today = useMemo(() => todayParts(), []);
  const todayIso = toIsoDate(today.y, today.m, today.d);

  const initialView = parsed ?? today;
  const [viewY, setViewY] = useState(initialView.y);
  const [viewM, setViewM] = useState(initialView.m);

  useEffect(() => {
    if (!open) return;
    const base = parsed ?? today;
    setViewY(base.y);
    setViewM(base.m);
    setFocusIso(value && parseIsoDate(value) ? value : toIsoDate(base.y, base.m, base.d));
  }, [open, parsed, today, value]);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const panelH = 340;
      const spaceBelow = viewportH - r.bottom - VIEWPORT_GAP;
      const spaceAbove = r.top - VIEWPORT_GAP;
      const preferBelow = spaceBelow >= panelH || spaceBelow >= spaceAbove;
      const width = PANEL_WIDTH;
      const left = Math.min(
        Math.max(VIEWPORT_GAP, r.left),
        Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
      );
      const top = preferBelow
        ? r.bottom + VIEWPORT_GAP
        : Math.max(VIEWPORT_GAP, r.top - VIEWPORT_GAP - panelH);
      setMenuRect({ left, top, width });
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
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const anchor = anchorRef.current;
      const menu = document.getElementById(panelId);
      const inside =
        (anchor && target && anchor.contains(target)) ||
        (menu && target && menu.contains(target));
      if (!inside) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, panelId]);

  const cells = useMemo(
    () => buildMonthGrid(viewY, viewM, min, max),
    [viewY, viewM, min, max],
  );

  const displayLabel = parsed ? formatarData(value) : "";

  const shiftMonth = (delta: number) => {
    const next = clampMonth(viewY, viewM + delta);
    setViewY(next.y);
    setViewM(next.m);
  };

  const selectDay = (iso: string) => {
    onChange(iso);
    setOpen(false);
    anchorRef.current?.focus();
  };

  const clearValue = () => {
    onChange("");
    setOpen(false);
    anchorRef.current?.focus();
  };

  const moveFocus = (deltaDays: number) => {
    const base = parseIsoDate(focusIso) ?? parsed ?? today;
    const dt = new Date(base.y, base.m - 1, base.d + deltaDays);
    const iso = toIsoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    setFocusIso(iso);
    setViewY(dt.getFullYear());
    setViewM(dt.getMonth() + 1);
  };

  const onGridKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(7);
        break;
      case "PageUp":
        e.preventDefault();
        shiftMonth(e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        e.preventDefault();
        shiftMonth(e.shiftKey ? 12 : 1);
        break;
      case "Home": {
        e.preventDefault();
        const p = parseIsoDate(focusIso) ?? today;
        const wd = new Date(p.y, p.m - 1, p.d).getDay();
        moveFocus(-wd);
        break;
      }
      case "End": {
        e.preventDefault();
        const p = parseIsoDate(focusIso) ?? today;
        const wd = new Date(p.y, p.m - 1, p.d).getDay();
        moveFocus(6 - wd);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const cell = cells.find((c) => c.iso === focusIso);
        if (cell && !cell.disabled) selectDay(cell.iso);
        break;
      }
      default:
        break;
    }
  };

  const defaultButton =
    "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] " +
    "focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 focus:border-[color:var(--primary)] text-left inline-flex items-center justify-between gap-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-sm";

  const triggerClass = buttonClassName
    ? `${buttonClassName} inline-flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`
    : defaultButton;

  return (
    <>
      {typeof document !== "undefined" && open && menuRect
        ? createPortal(
            <div
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label="Selecionar data"
              style={{
                position: "fixed",
                left: menuRect.left,
                top: menuRect.top,
                width: menuRect.width,
                zIndex: 10050,
              }}
            >
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-xl ring-1 ring-black/5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted-foreground)] transition-colors hover:bg-black/[0.04] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    {monthTitle(viewY, viewM)}
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted-foreground)] transition-colors hover:bg-black/[0.04] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                    onClick={() => shiftMonth(1)}
                    aria-label="Próximo mês"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-0.5" aria-hidden>
                  {WEEKDAY_LABELS.map((label) => (
                    <div
                      key={label}
                      className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div
                  className="grid grid-cols-7 gap-0.5"
                  role="grid"
                  aria-label={monthTitle(viewY, viewM)}
                  onKeyDown={onGridKeyDown}
                >
                  {cells.map((cell) => {
                    const selected = Boolean(value) && cell.iso === value;
                    const isToday = cell.iso === todayIso;
                    const isFocused = cell.iso === focusIso;
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        disabled={cell.disabled}
                        aria-selected={selected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={formatarData(cell.iso)}
                        onClick={() => {
                          if (!cell.disabled) selectDay(cell.iso);
                        }}
                        onFocus={() => setFocusIso(cell.iso)}
                        className={[
                          "relative h-9 w-full rounded-lg text-sm transition-colors",
                          "focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/40 focus:ring-offset-1",
                          cell.disabled
                            ? "cursor-not-allowed opacity-35"
                            : "hover:bg-black/[0.05]",
                          !cell.inMonth && !selected
                            ? "text-[color:var(--muted-foreground)]/70"
                            : "text-[color:var(--foreground)]",
                          selected
                            ? "bg-[color:var(--primary)] font-semibold text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary)]"
                            : "",
                          isToday && !selected
                            ? "font-semibold ring-1 ring-inset ring-[color:var(--primary)]/50"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--border)] pt-2">
                  <button
                    type="button"
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                    onClick={() => {
                      if (
                        (min != null && compareIso(todayIso, min) < 0) ||
                        (max != null && compareIso(todayIso, max) > 0)
                      ) {
                        return;
                      }
                      selectDay(todayIso);
                    }}
                  >
                    Hoje
                  </button>
                  {clearable && value ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-black/[0.04] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                      onClick={clearValue}
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <button
        ref={anchorRef}
        type="button"
        id={idProp}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel ?? (displayLabel ? `Data ${displayLabel}` : "Selecionar data")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`${triggerClass}${open ? " shadow-sm" : ""}`}
      >
        <span className={`min-w-0 flex-1 truncate ${displayLabel ? "" : "text-[color:var(--muted-foreground)]"}`}>
          {displayLabel || placeholder}
        </span>
        <Calendar className="h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)]" aria-hidden />
      </button>
    </>
  );
}
