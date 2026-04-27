"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

const MOTIVOS = [
  "Encerrado pelo cliente",
  "Em produção",
  "Orçamento reprovado",
  "Sem resposta do cliente",
  "Tarefa criada incorretamente",
  "Atividade da tarefa finalizada",
] as const;

export type FinalizePayload = { motivo: string };

export function FinalizeTaskModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: FinalizePayload) => void;
}) {
  const [motivo, setMotivo] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const motivos = useMemo(() => Array.from(MOTIVOS), []);

  useEffect(() => {
    if (!open) return;
    setMotivo("");
    setError("");
    setMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = menuRef.current;
      const target = e.target as Node | null;
      if (el && target && !el.contains(target)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--surface)] rounded-2xl border border-[color:var(--border)] w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[color:var(--border)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Finalizar tarefa</h2>
            <p className="text-sm text-[color:var(--muted-foreground)] mt-1">
              Selecione o motivo da finalização.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[color:var(--muted-foreground)] hover:bg-black/5"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div ref={menuRef} className="relative">
            <label className="block text-sm font-semibold text-[color:var(--foreground)] mb-2">
              Motivo <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              id="finalize-motivo-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
            >
              <span className={motivo ? "truncate" : "truncate text-[color:var(--muted-foreground)]"}>
                {motivo || "Selecione..."}
              </span>
              <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div
                className="absolute z-[70] mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
                aria-labelledby="finalize-motivo-trigger"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMotivo("");
                    if (error) setError("");
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--background)]/60 transition"
                >
                  Selecione...
                </button>
                <div className="my-1 border-t border-[color:var(--border)]" />
                {motivos.map((m) => {
                  const active = motivo === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setMotivo(m);
                        if (error) setError("");
                        setMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm text-[color:var(--foreground)] hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold bg-[color:var(--background)]/40" : ""
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] hover:bg-[color:var(--background)]/40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!motivo.trim()) {
                setError("Motivo é obrigatório.");
                return;
              }
              onConfirm({ motivo: motivo.trim() });
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}
