"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { PackageTicket } from "./PackageCard";
import { resolveTicketResponsibleMembers } from "@/lib/ticketMemberNames";

type UserOption = { id: string; name: string; email?: string };

type EditSubprojectModalProps = {
  ticket: PackageTicket;
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

export function EditSubprojectModal({
  ticket,
  projectId,
  projectName,
  onClose,
  onSaved,
}: EditSubprojectModalProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [name, setName] = useState(ticket.title || "");
  const [budget, setBudget] = useState(
    ticket.estimativaHoras != null ? String(ticket.estimativaHoras) : "",
  );
  const [responsibleIds, setResponsibleIds] = useState<string[]>(
    ticket.responsibles?.map((r) => r.user.id) || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(true);

  useEffect(() => {
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers);
  }, []);

  useEffect(() => {
    if (!ticket.id) {
      setLoadingTicket(false);
      return;
    }
    setLoadingTicket(true);
    apiFetch(`/api/tickets/${ticket.id}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) {
          setName(data.title || "");
          setBudget(data.estimativaHoras != null ? String(data.estimativaHoras) : "");
          if (Array.isArray(data.responsibles)) {
            setResponsibleIds(data.responsibles.map((r: { user: { id: string } }) => r.user.id));
          }
        }
      })
      .finally(() => setLoadingTicket(false));
  }, [ticket.id]);

  // Fallback: se após carregar ainda não tiver membros e o ticket (prop) tiver responsibles, usa o prop (ex.: consultor vindo da lista)
  useEffect(() => {
    if (loadingTicket || !ticket.id) return;
    if (Array.isArray(ticket.responsibles) && ticket.responsibles.length > 0) {
      setResponsibleIds((prev) => {
        if (prev.length > 0) return prev;
        return ticket.responsibles!.map((r) => r.user.id);
      });
    }
  }, [ticket.id, ticket.responsibles, loadingTicket]);

  const displayedResponsibleMembers = useMemo(
    () =>
      resolveTicketResponsibleMembers({
        responsibleIds,
        users,
        ticket: {
          responsibles: ticket.responsibles,
          createdBy: ticket.createdBy ?? null,
          assignedTo: ticket.assignedTo ?? null,
        },
      }),
    [responsibleIds, users, ticket.responsibles, ticket.createdBy, ticket.assignedTo],
  );
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
    if (!name.trim()) {
      errors.name = true;
    }
    const trimmedBudget = budget.trim();
    const budgetNum =
      trimmedBudget === "" ? null : Number.isNaN(Number(trimmedBudget)) ? null : Number(trimmedBudget);
    if (budgetNum !== null && (budgetNum <= 0 || budgetNum > 10000)) {
      errors.budget = true;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const msgs: string[] = [];
      if (errors.name) {
        msgs.push("Por favor, preencha os seguintes campos obrigatórios: Nome do tópico.");
      }
      if (errors.budget) {
        msgs.push("O valor de Orçado (horas) deve ser maior que 0 e no máximo 10000.");
      }
      setError(msgs.join(" "));
      return;
    }
    const estimativa = budgetNum;
    setSaving(true);
    try {
      const body = {
        title: name.trim(),
        estimativaHoras: estimativa,
        responsibleIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      };
      const res = await apiFetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erro ao editar tópico");
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Editar tópico</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {loadingTicket ? "Carregando..." : "Atualize os dados do tópico."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>
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
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: false }));
              }}
              className={getInputClass(!!fieldErrors.name)}
              placeholder="Ex: Módulo de relatórios"
            />
          </div>
          <div>
            <label className={labelClass}>Orçado (horas)</label>
            <input
              type="number"
              step="0.5"
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                if (fieldErrors.budget) setFieldErrors((prev) => ({ ...prev, budget: false }));
              }}
              className={getInputClass(!!fieldErrors.budget)}
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
              className={getInputClass(false) + " bg-slate-50 text-slate-600 cursor-not-allowed"}
            />
          </div>
          <div>
            <label className={labelClass}>Membros</label>
            <div className="flex flex-wrap items-center gap-2">
              {displayedResponsibleMembers.map((u) => (
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
                  <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 max-h-[min(20rem,70vh)] overflow-y-auto overscroll-contain">
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
              disabled={saving || loadingTicket}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
