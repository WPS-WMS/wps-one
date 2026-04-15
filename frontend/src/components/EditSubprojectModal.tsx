"use client";

import { useState, useEffect, useCallback } from "react";
import { X, FileText, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PackageTicket } from "./PackageCard";
import { TopicMembersPicker, type TopicMemberUser } from "@/components/TopicMembersPicker";
import {
  FormModalSection,
  formModalBackdropClass,
  formModalPanelNarrowClass,
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type EditSubprojectModalProps = {
  ticket: PackageTicket;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSaved: () => void;
};

export function EditSubprojectModal({
  ticket,
  projectName,
  onClose,
  onSaved,
}: EditSubprojectModalProps) {
  const [users, setUsers] = useState<TopicMemberUser[]>([]);
  const [name, setName] = useState(ticket.title || "");
  const [budget, setBudget] = useState(
    ticket.estimativaHoras != null ? String(ticket.estimativaHoras) : "",
  );
  const [responsibleIds, setResponsibleIds] = useState<string[]>(
    ticket.responsibles?.map((r) => r.user.id) || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    if (loadingTicket || !ticket.id) return;
    if (Array.isArray(ticket.responsibles) && ticket.responsibles.length > 0) {
      setResponsibleIds((prev) => {
        if (prev.length > 0) return prev;
        return ticket.responsibles!.map((r) => r.user.id);
      });
    }
  }, [ticket.id, ticket.responsibles, loadingTicket]);

  const resolveMember = useCallback(
    (id: string): TopicMemberUser | null => {
      const fromList = users.find((u) => u.id === id);
      if (fromList) return fromList;
      const r = ticket.responsibles?.find((x) => x.user?.id === id);
      if (r?.user?.name) {
        return {
          id: r.user.id,
          name: r.user.name,
          email: r.user.email,
          avatarUrl: r.user.avatarUrl ?? null,
          updatedAt: r.user.updatedAt,
        };
      }
      if (ticket.createdBy?.id === id && ticket.createdBy.name) {
        return {
          id,
          name: ticket.createdBy.name,
          email: ticket.createdBy.email,
          avatarUrl: ticket.createdBy.avatarUrl ?? null,
          updatedAt: ticket.createdBy.updatedAt,
        };
      }
      if (ticket.assignedTo?.id === id && ticket.assignedTo.name) {
        return {
          id,
          name: ticket.assignedTo.name,
          email: ticket.assignedTo.email,
          avatarUrl: ticket.assignedTo.avatarUrl ?? null,
          updatedAt: ticket.assignedTo.updatedAt,
        };
      }
      return null;
    },
    [users, ticket.responsibles, ticket.createdBy, ticket.assignedTo],
  );

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

  return (
    <div
      className={formModalBackdropClass + " animate-in fade-in duration-200"}
      onClick={onClose}
    >
      <div
        className={formModalPanelNarrowClass + " animate-in zoom-in-95 duration-200"}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 px-6 md:px-8 pt-5 pb-4 border-b bg-[color:var(--surface)]/92 backdrop-blur-xl"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0"
                style={{
                  borderColor: "rgba(92, 0, 225, 0.35)",
                  background: "linear-gradient(135deg, rgba(92, 0, 225, 0.18), rgba(87, 66, 118, 0.18))",
                  boxShadow: "0 12px 26px rgba(92, 0, 225, 0.10)",
                }}
              >
                <FileText className="h-5 w-5" style={{ color: "var(--primary)" }} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-[color:var(--foreground)]">Editar tópico</h2>
                <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-0.5">
                  {loadingTicket ? "Carregando..." : "Atualize os dados do tópico."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border transition hover:opacity-90 shrink-0"
              style={{
                borderColor: "var(--border)",
                background: "rgba(0,0,0,0.06)",
                color: "var(--muted-foreground)",
              }}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col bg-[color:var(--background)] min-h-0" noValidate>
          {error && (
            <div className="px-6 md:px-8 pt-4 shrink-0">
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.10)",
                  color: "var(--foreground)",
                }}
              >
                <span className="font-semibold">Atenção:</span>{" "}
                <span className="text-[color:var(--muted-foreground)]">{error}</span>
              </div>
            </div>
          )}

          <div className="px-6 md:px-8 py-6 space-y-6 flex-1 overflow-y-auto">
            <FormModalSection title="Dados do tópico">
              <div>
                <label className={formModalLabelClass}>Nome do tópico *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: false }));
                  }}
                  className={formModalInputClass(!!fieldErrors.name)}
                  placeholder="Ex: Módulo de relatórios"
                  disabled={loadingTicket}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Orçado (horas)</label>
                <input
                  type="number"
                  step="0.5"
                  value={budget}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    if (fieldErrors.budget) setFieldErrors((prev) => ({ ...prev, budget: false }));
                  }}
                  className={formModalInputClass(!!fieldErrors.budget)}
                  placeholder="Ex: 40"
                  disabled={loadingTicket}
                />
                <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
                  Opcional. Estimativa total de horas para este tópico.
                </p>
              </div>
              <div>
                <label className={formModalLabelClass}>Projeto</label>
                <input
                  type="text"
                  value={projectName}
                  readOnly
                  className={formModalInputClass(false) + " cursor-not-allowed opacity-90"}
                  style={{ background: "rgba(0,0,0,0.04)" }}
                />
              </div>
            </FormModalSection>

            <TopicMembersPicker
              users={users}
              value={responsibleIds}
              onChange={setResponsibleIds}
              resolveMember={resolveMember}
              hint="Opcional. Membros associados a este tópico."
            />
          </div>

          <div
            className="sticky bottom-0 z-10 border-t px-6 md:px-8 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl flex justify-end gap-3 shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border text-sm font-semibold transition hover:opacity-90"
              style={{
                borderColor: "var(--border)",
                background: "transparent",
                color: "var(--foreground)",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loadingTicket}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-opacity hover:opacity-95 flex items-center gap-2"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {saving ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Salvar alterações
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
