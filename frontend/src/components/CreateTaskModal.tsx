"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { createPlainTextPasteHandler } from "@/lib/plainTextPaste";
import { TICKET_DESCRIPTION_MAX_LEN } from "@/lib/ticketDescription";

type CreateTaskModalProps = {
  projectId: string;
  initialStatus?: string;
  parentTicketId?: string; // ID do tópico pai (opcional)
  onClose: () => void;
  onSaved: () => void;
};

const TIPOS_TAREFA = [
  "Suporte PRD",
  "Melhoria",
  "Dúvida",
  "Bug",
  "Feature",
  "Tarefa",
];

const CRITICIDADES = [
  "Baixa",
  "Média",
  "Alta",
];

export function CreateTaskModal({
  projectId,
  initialStatus = "ABERTO",
  parentTicketId,
  onClose,
  onSaved,
}: CreateTaskModalProps) {
  const overlayPointerDownRef = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("");
  const [criticidade, setCriticidade] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim() || !type) {
      setError("Título e tipo são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        criticidade: criticidade || undefined,
        status: initialStatus,
        parentTicketId: parentTicketId || undefined,
      };
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao criar tarefa");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
        overlayPointerDownRef.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Nova Tarefa</h2>
          <p className="text-sm text-slate-500 mt-0.5">Preencha os dados da nova tarefa.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Título da tarefa *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Ex: Implementar relatório de vendas"
              required
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, TICKET_DESCRIPTION_MAX_LEN))}
              onPaste={createPlainTextPasteHandler({
                getValue: () => description,
                onChange: setDescription,
                maxLength: TICKET_DESCRIPTION_MAX_LEN,
              })}
              maxLength={TICKET_DESCRIPTION_MAX_LEN}
              className={inputClass + " min-h-[100px] resize-y"}
              placeholder="Descreva os detalhes da tarefa..."
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Selecione o tipo</option>
                {TIPOS_TAREFA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Criticidade</label>
              <select
                value={criticidade}
                onChange={(e) => setCriticidade(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione</option>
                {CRITICIDADES.map((crit) => (
                  <option key={crit} value={crit}>
                    {crit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
