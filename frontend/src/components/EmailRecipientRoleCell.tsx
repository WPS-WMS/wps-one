"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type EmailRecipientRole = "RESPONSAVEL" | "MEMBRO" | "CLIENTE";

const ROLE_META: Record<
  EmailRecipientRole,
  { short: string; label: string; bg: string; text: string; border: string; checkBg: string }
> = {
  RESPONSAVEL: {
    short: "Resp.",
    label: "Responsável",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-200",
    checkBg: "accent-emerald-600",
  },
  MEMBRO: {
    short: "Memb.",
    label: "Membro",
    bg: "bg-sky-100",
    text: "text-sky-800",
    border: "border-sky-200",
    checkBg: "accent-sky-600",
  },
  CLIENTE: {
    short: "Cliente",
    label: "Cliente",
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-200",
    checkBg: "accent-orange-600",
  },
};

const ALL_ROLES: EmailRecipientRole[] = ["RESPONSAVEL", "MEMBRO", "CLIENTE"];

export function EmailRecipientRoleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs border-b" style={{ borderColor: "var(--border)" }}>
      <span className="font-medium text-[color:var(--muted-foreground)]">Legenda:</span>
      {ALL_ROLES.map((role) => (
        <EmailRoleTag key={role} role={role} />
      ))}
    </div>
  );
}

export function EmailRoleTag({ role, size = "sm" }: { role: EmailRecipientRole; size?: "sm" | "md" }) {
  const meta = ROLE_META[role];
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold leading-none ${meta.bg} ${meta.text} ${meta.border} ${pad}`}
    >
      {meta.short}
    </span>
  );
}

export function EmailRecipientRoleCell({
  id,
  values,
  onChange,
  disabled = false,
}: {
  id: string;
  values: EmailRecipientRole[];
  onChange: (next: EmailRecipientRole[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const ordered = ALL_ROLES.filter((r) => selectedSet.has(r));

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, 168) });
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

  function toggle(role: EmailRecipientRole) {
    const has = selectedSet.has(role);
    onChange(has ? values.filter((v) => v !== role) : [...values, role]);
  }

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
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl py-1.5"
                role="listbox"
              >
                {ALL_ROLES.map((role) => {
                  const meta = ROLE_META[role];
                  const checked = selectedSet.has(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggle(role)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[color:var(--background)]/60 transition"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className={`h-4 w-4 rounded ${meta.checkBg}`}
                      />
                      <EmailRoleTag role={role} size="md" />
                      <span className="text-sm text-[color:var(--foreground)]">{meta.label}</span>
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
        aria-expanded={open}
        aria-label={ordered.length ? ordered.map((r) => ROLE_META[r].label).join(", ") : "Nenhum destinatário"}
        className={`group w-full min-h-[2rem] rounded-lg px-1.5 py-1 flex flex-wrap items-center justify-center gap-1 transition ${
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-[color:var(--background)]/50"
        } ${open ? "ring-2 ring-[color:var(--primary)]/30 bg-[color:var(--background)]/40" : ""}`}
      >
        {ordered.length === 0 ? (
          <span className="inline-flex items-center rounded-full border border-dashed border-[color:var(--border)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)] group-hover:border-[color:var(--primary)]/40">
            + vazio
          </span>
        ) : (
          ordered.map((role) => <EmailRoleTag key={role} role={role} />)
        )}
      </button>
    </>
  );
}
