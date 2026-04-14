"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Check, X, ArrowLeft } from "lucide-react";
import { notFound, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

type PermissionRequest = {
  id: string;
  userId: string;
  status: string;
  justification: string;
  date: string;
  horaInicio: string;
  horaFim: string;
  totalHoras: number;
  description?: string | null;
  projectId: string;
  ticketId?: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  project: { id: string; name: string };
  ticket?: { id: string; code: string; title: string } | null;
  rejectionReason?: string | null;
};

function formatDatePtBR(dateStr: string): string {
  const ymd = String(dateStr || "").slice(0, 10);
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd || "—";
  const [y, m, d] = parts;
  if (!y || !m || !d) return ymd || "—";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

export default function GestorPermissoesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";
  const { loading: authLoading, user, can, permissionsReady } = useAuth();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PermissionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function load() {
    if (!permissionsReady || !can("configuracoes.permissoes")) return;
    setLoading(true);
    const q = filter === "PENDING" ? "?status=PENDING" : "";
    apiFetch(`/api/permission-requests${q}`)
      .then((r) => r.json())
      .then((data) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [filter, permissionsReady, can]);

  // Ao sair de "Todos", limpa seleção.
  useEffect(() => {
    if (filter !== "ALL") setSelectedIds([]);
  }, [filter]);

  async function handleClearSelected() {
    if (filter !== "ALL") return;
    if (selectedIds.length === 0) return;
    if (!user?.tenantId) return;

    const confirmMsg = `Tem certeza que deseja limpar (${selectedIds.length}) solicitação(ões) selecionada(s)?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await apiFetch("/api/permission-requests/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || "Erro ao limpar solicitações.");
        return;
      }

      const now = Date.now();
      localStorage.setItem(`permission_screen_clean_v1_${user.tenantId}`, String(now));
      setSelectedIds([]);
      load();
    } catch {
      alert("Erro ao limpar solicitações.");
    }
  }

  function handleSelectAll() {
    if (filter !== "ALL") return;
    const eligibleIds = requests
      .filter((r) => r.status === "APPROVED" || r.status === "REJECTED")
      .map((r) => r.id);
    setSelectedIds(eligibleIds);
  }

  // Limpeza automática a cada 3 meses (se não foi limpa manualmente).
  useEffect(() => {
    if (filter !== "ALL") return;
    if (authLoading || !permissionsReady) return;
    if (!user?.tenantId) return;

    const key = `permission_screen_clean_v1_${user.tenantId}`;
    const last = Number(localStorage.getItem(key) || "0");
    const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - last < threeMonthsMs) return;

    apiFetch("/api/permission-requests/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 90 }),
    })
      .then((r) => {
        if (!r.ok) return;
        localStorage.setItem(key, String(now));
        load();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, authLoading, permissionsReady, user?.tenantId]);

  async function handleApprove(id: string) {
    setActingId(id);
    try {
      const res = await apiFetch(`/api/permission-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) {
        load();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || "Erro ao aprovar solicitação.");
      }
    } finally {
      setActingId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejecting) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      alert("Informe o motivo da reprovação.");
      return;
    }
    setActingId(rejecting.id);
    try {
      const res = await apiFetch(`/api/permission-requests/${rejecting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED", rejectionReason: reason }),
      });
      if (res.ok) {
        setRejecting(null);
        setRejectionReason("");
        load();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error || "Erro ao rejeitar solicitação.");
      }
    } finally {
      setActingId(null);
    }
  }

  const pendingCount =
    filter === "ALL" ? requests.filter((r) => r.status === "PENDING").length : requests.length;

  // Evita "flicker" e redirecionamentos: só mostra a UI quando a permissão já foi carregada.
  if (authLoading || !permissionsReady) return null;
  if (!can("configuracoes.permissoes")) notFound();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <button
        type="button"
        onClick={() => router.push(`${basePath}/configuracoes`)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Permissões</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie solicitações de permissão de apontamento de horas.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-end gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilter("PENDING")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filter === "PENDING"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Pendentes {filter === "PENDING" && `(${pendingCount})`}
              </button>
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filter === "ALL"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Todos
              </button>
            </div>
          </div>

          {filter === "ALL" && (
            <div className="mt-3 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={
                  loading ||
                  requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED").length === 0
                }
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={handleClearSelected}
                disabled={selectedIds.length === 0 || loading}
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Limpar
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-500 text-sm">Carregando...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
              Nenhum pedido de permissão {filter === "PENDING" ? "pendente" : "encontrado"}.
            </div>
          ) : (
            <ul className="space-y-4">
              {requests.map((req) => (
                <li
                  key={req.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4"
                >
                  {filter === "ALL" && (
                    <div className="flex-shrink-0">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={req.status !== "PENDING" && selectedIds.includes(req.id)}
                          disabled={req.status === "PENDING"}
                          onChange={(e) => {
                            if (req.status === "PENDING") return;
                            const checked = e.target.checked;
                            setSelectedIds((prev) =>
                              checked ? [...prev, req.id] : prev.filter((id) => id !== req.id),
                            );
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </label>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{req.user.name}</p>
                    <p className="text-sm text-slate-600">{req.user.email}</p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium">Horário de apontamento:</span>{" "}
                      {formatDatePtBR(req.date)} · {req.horaInicio} às {req.horaFim}
                      {req.totalHoras ? ` (${req.totalHoras.toFixed(1)}h)` : ""}
                    </p>
                    {req.project?.name && (
                      <p className="text-sm text-slate-600">
                        Projeto: {req.project.name}
                        {req.ticket ? ` · ${req.ticket.code} ${req.ticket.title}` : ""}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium">Justificativa:</span> {req.justification}
                    </p>
                    {req.description && (
                      <p className="text-sm text-slate-600 mt-1">
                        <span className="font-medium">Descrição:</span> {req.description}
                      </p>
                    )}
                    {req.status !== "PENDING" && (
                      <p className="mt-2 text-xs text-slate-500">
                        Status: {req.status === "APPROVED" ? "Aprovado" : "Rejeitado"}
                      </p>
                    )}
                  </div>
                  {req.status === "PENDING" && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApprove(req.id)}
                        disabled={actingId !== null}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                      >
                        <Check className="h-4 w-4" />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejecting(req);
                          setRejectionReason("");
                        }}
                        disabled={actingId !== null}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 shadow-sm"
                      >
                        <X className="h-4 w-4" />
                        Rejeitar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {rejecting && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (!actingId) {
              setRejecting(null);
              setRejectionReason("");
            }
          }}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">Reprovar apontamento</h3>
            <p className="text-sm text-slate-600 mt-2">
              Informe o motivo da reprovação. Este motivo ficará associado ao apontamento para consulta
              posterior.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              maxLength={500}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Descreva o motivo da reprovação..."
              disabled={!!actingId}
            />
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => {
                  if (actingId) return;
                  setRejecting(null);
                  setRejectionReason("");
                }}
                className="flex-1 py-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 disabled:opacity-50"
                disabled={!!actingId}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={!!actingId}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Confirmar reprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

