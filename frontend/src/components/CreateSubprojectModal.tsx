"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type UserOption = { id: string; name: string; email?: string };

type CreateSubprojectModalProps = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSaved: () => void;
};

function getIniciais(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CreateSubprojectModal({
  projectId,
  projectName,
  onClose,
  onSaved,
}: CreateSubprojectModalProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [showUserPicker, setShowUserPicker] = useState(false);

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers);
  }, []);

  const selectedUsers = users.filter((u) => responsibleIds.includes(u.id));
  const availableToAdd = users.filter((u) => !responsibleIds.includes(u.id));

  function addResponsible(userId: string) {
    if (!responsibleIds.includes(userId)) setResponsibleIds((ids) => [...ids, userId]);
    setShowUserPicker(false);
  }
  function removeResponsible(userId: string) {
    setResponsibleIds((ids) => ids.filter((id) => id !== userId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const errors: Record<string, boolean> = {};
    const missingFields: string[] = [];

    if (!name.trim()) {
      errors.name = true;
      missingFields.push("Nome do tópico");
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(`Por favor, preencha os seguintes campos obrigatórios: ${missingFields.join(", ")}.`);
      return;
    }
    const trimmedBudget = budget.trim();
    const estimativa =
      trimmedBudget === "" ? null : Number.isNaN(Number(trimmedBudget)) ? null : Number(trimmedBudget);
    setSaving(true);
    try {
      const body = {
        projectId,
        title: name.trim(),
        // Mantém o tipo técnico SUBPROJETO para compatibilidade com o backend,
        // mas a interface exibe como "Tópico".
        type: "SUBPROJETO",
        estimativaHoras: estimativa,
        responsibleIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      };
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao criar tópico");
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

  const inputClassBase =
    "w-full px-4 py-2.5 rounded-xl border bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2";
  const getInputClass = (hasError: boolean) =>
    `${inputClassBase} ${
      hasError
        ? "border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50/50"
        : "border-slate-200 focus:ring-blue-400 focus:border-blue-400"
    }`;
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Criar tópico</h2>
          <p className="text-sm text-slate-500 mt-0.5">Preencha os dados do novo tópico.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className={labelClass}>Nome do tópico *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: false }));
                }
              }}
              className={getInputClass(!!fieldErrors.name)}
              placeholder="Ex: Módulo de relatórios"
            />
          </div>
          <div>
            <label className={labelClass}>Orçado (horas)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={getInputClass(false)}
              placeholder="Ex: 40"
            />
            <p className="text-xs text-slate-500 mt-1">
              Opcional. Estimativa total de horas para este tópico.
            </p>
          </div>
          <div>
            <label className={labelClass}>Projeto</label>
            <input
              type="text"
              value={projectName}
              readOnly
              className={
                getInputClass(false) + " bg-slate-50 text-slate-600 cursor-not-allowed"
              }
            />
          </div>
          <div>
            <label className={labelClass}>Membros</label>
            <div className="flex flex-wrap items-center gap-2">
              {selectedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-1.5 rounded-full bg-slate-100 pl-1 pr-2 py-1 border border-slate-200"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold"
                    title={u.name}
                  >
                    {getIniciais(u.name)}
                  </span>
                  <span className="text-sm text-slate-700 max-w-[120px] truncate">{u.name}</span>
                  <button
                    type="button"
                    onClick={() => removeResponsible(u.id)}
                    className="ml-0.5 text-slate-400 hover:text-red-600 p-0.5"
                    aria-label="Remover"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserPicker(!showUserPicker)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  title="Adicionar membro"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm">
                    +
                  </span>
                  <span>Adicionar membro</span>
                </button>
                {showUserPicker && (
                  <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 max-h-48 overflow-y-auto">
                    {availableToAdd.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">Todos já adicionados</p>
                    ) : (
                      availableToAdd.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => addResponsible(u.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                            {getIniciais(u.name)}
                          </span>
                          {u.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

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
              {saving ? "Criando..." : "Criar tópico"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
