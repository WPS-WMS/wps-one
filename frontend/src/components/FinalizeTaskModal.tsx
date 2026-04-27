"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

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

  const motivos = useMemo(() => Array.from(MOTIVOS), []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Finalizar tarefa</h2>
            <p className="text-sm text-slate-500 mt-1">
              Selecione o motivo da finalização.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Motivo <span className="text-red-500">*</span>
            </label>
            <select
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (error) setError("");
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {motivos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

