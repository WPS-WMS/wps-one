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

type MenuRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const VIEWPORT_GAP = 8;
const DEFAULT_MENU_MAX = 256; // ~max-h-64
const SELECT_ALL_VALUE = "__all__";

type PopoverSelectBaseProps = {
  id: string;
  options: PopoverSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  menuMaxHeightClassName?: string;
  /** Visual com checkbox (lista de tarefas / multi). */
  checklist?: boolean;
};

type PopoverSelectSingleProps = PopoverSelectBaseProps & {
  multi?: false;
  value: string;
  onChange: (nextValue: string) => void;
  values?: never;
  onValuesChange?: never;
  selectAllLabel?: never;
};

type PopoverSelectMultiProps = PopoverSelectBaseProps & {
  multi: true;
  values: string[];
  onValuesChange: (nextValues: string[]) => void;
  value?: never;
  onChange?: never;
  /** Inclui opção "Todos" no topo (padrão: "Todos"). */
  selectAllLabel?: string;
};

export type PopoverSelectProps = PopoverSelectSingleProps | PopoverSelectMultiProps;

export function PopoverSelect(props: PopoverSelectProps) {
  const {
    id,
    options,
    disabled = false,
    placeholder = "Selecione",
    buttonClassName = "",
    menuMaxHeightClassName = "max-h-64",
    checklist = false,
  } = props;
  const multi = props.multi === true;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);

  const selectableOptions = useMemo(
    () => options.filter((o) => o.value !== "" && o.value !== SELECT_ALL_VALUE && !o.disabled),
    [options],
  );
  const selectedValues = useMemo(
    () => (multi ? props.values : props.value ? [props.value] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- discriminated union
    [multi, multi ? props.values : props.value],
  );
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const allSelected =
    selectableOptions.length > 0 && selectableOptions.every((o) => selectedSet.has(o.value));

  const selectedLabel = useMemo(() => {
    if (multi) {
      if (selectedValues.length === 0) return "";
      if (allSelected) return props.selectAllLabel ?? "Todos";
      const labels = selectableOptions
        .filter((o) => selectedSet.has(o.value))
        .map((o) => o.label);
      if (labels.length <= 2) return labels.join(", ");
      return `${labels.length} selecionados`;
    }
    return options.find((o) => o.value === props.value)?.label ?? "";
  }, [
    multi,
    selectedValues,
    allSelected,
    selectableOptions,
    selectedSet,
    options,
    props,
  ]);

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
      const spaceBelow = viewportH - r.bottom - VIEWPORT_GAP;
      const spaceAbove = r.top - VIEWPORT_GAP;
      const preferBelow = spaceBelow >= Math.min(DEFAULT_MENU_MAX, 160) || spaceBelow >= spaceAbove;
      const available = preferBelow ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(120, Math.min(DEFAULT_MENU_MAX, available));
      const width = Math.max(r.width, 180);
      const left = Math.min(
        Math.max(VIEWPORT_GAP, r.left),
        Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP),
      );

      if (preferBelow) {
        setMenuRect({
          left,
          top: r.bottom + VIEWPORT_GAP,
          width,
          maxHeight,
        });
      } else {
        setMenuRect({
          left,
          top: Math.max(VIEWPORT_GAP, r.top - VIEWPORT_GAP - maxHeight),
          width,
          maxHeight,
        });
      }
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

  const menuOptions = useMemo(() => {
    if (!multi) return options;
    const selectAllLabel = props.selectAllLabel ?? "Todos";
    return [{ value: SELECT_ALL_VALUE, label: selectAllLabel }, ...options.filter((o) => o.value !== "")];
  }, [multi, options, props]);

  function handlePick(optionValue: string) {
    if (multi) {
      if (optionValue === SELECT_ALL_VALUE) {
        props.onValuesChange(
          allSelected ? [] : selectableOptions.map((o) => o.value),
        );
        return;
      }
      const next = selectedSet.has(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      props.onValuesChange(next);
      return;
    }
    props.onChange(optionValue);
    setOpen(false);
  }

  const showChecklist = checklist || multi;
  const selectedSingle = !multi ? options.find((o) => o.value === props.value) : undefined;

  const baseButton =
    "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] " +
    "focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 focus:border-[color:var(--primary)] text-left inline-flex items-center justify-between gap-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-sm";

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
                zIndex: 10050,
                maxHeight: menuRect.maxHeight,
              }}
            >
              <div
                className={`h-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl overflow-auto p-1.5 ring-1 ring-black/5 ${menuMaxHeightClassName}`}
                style={{ maxHeight: menuRect.maxHeight }}
                role="listbox"
                aria-multiselectable={multi || undefined}
              >
                {menuOptions.map((o) => {
                  const isSelectAll = o.value === SELECT_ALL_VALUE;
                  const active = isSelectAll
                    ? allSelected
                    : multi
                      ? selectedSet.has(o.value)
                      : o.value === props.value;
                  return (
                    <button
                      key={o.value === "" ? "__empty__" : o.value}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => handlePick(o.value)}
                      className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "bg-[color:var(--primary)]/10 text-[color:var(--foreground)] font-medium"
                          : "text-[color:var(--foreground)] hover:bg-black/[0.04]"
                      } ${o.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={o.title}
                      aria-selected={active}
                      role="option"
                    >
                      {showChecklist ? (
                        <input
                          type="checkbox"
                          checked={active}
                          readOnly
                          className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--primary)]"
                          tabIndex={-1}
                          aria-hidden
                        />
                      ) : o.dotClassName ? (
                        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${o.dotClassName}`} aria-hidden />
                      ) : null}
                      <span
                        className={`truncate block flex-1 ${
                          o.value === "" || isSelectAll ? "font-medium" : ""
                        }`}
                      >
                        {o.label}
                      </span>
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
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {!showChecklist && selectedSingle?.dotClassName ? (
            <span
              className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${selectedSingle.dotClassName}`}
              aria-hidden
            />
          ) : null}
          <span className={`truncate ${selectedLabel ? "" : "text-[color:var(--muted-foreground)]"}`}>
            {selectedLabel || placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </>
  );
}
