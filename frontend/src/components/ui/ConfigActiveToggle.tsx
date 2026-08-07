"use client";

import { Loader2 } from "lucide-react";

/** Badge estático Ativo/Inativo (padrão das telas de configuração). */
export function ConfigStatusBadge({
  active,
  activeLabel = "Ativo",
  inactiveLabel = "Inativo",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  if (!active) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        {inactiveLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      {activeLabel}
    </span>
  );
}

/**
 * Toggle Ativar/Inativar (ON verde / OFF vermelho).
 * Usado nas ações das telas de Configurações.
 */
export function ConfigActiveToggle({
  active,
  onToggle,
  disabled = false,
  loading = false,
  title,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}) {
  const label = title ?? (active ? "Inativar" : "Ativar");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-emerald-500" : "bg-red-500"
      }`}
    >
      {loading ? (
        <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
      ) : (
        <>
          <span
            className={`pointer-events-none absolute text-[9px] font-bold uppercase tracking-wide text-white ${
              active ? "left-1.5" : "right-1.5"
            }`}
          >
            {active ? "ON" : "OFF"}
          </span>
          <span
            className={`pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
              active ? "translate-x-[1.55rem]" : "translate-x-0.5"
            }`}
          />
        </>
      )}
    </button>
  );
}

/** Classes padrão do ícone Editar (lápis). */
export const configEditIconBtnClass =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-[color:var(--muted-foreground)] transition-colors hover:bg-black/5 hover:text-[color:var(--foreground)] disabled:opacity-50";

/** Classes padrão do ícone Excluir (lixeira vermelha). */
export const configDeleteIconBtnClass =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50";
