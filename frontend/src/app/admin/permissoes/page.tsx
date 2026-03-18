"use client";

import { useState, useEffect } from "react";
import { Link } from "@/components/Link";
import { apiFetch } from "@/lib/api";
import { Check, X, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
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

export default function PermissoesPage() {
  const { loading: authLoading, user, can, permissionsReady } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PermissionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (permissionsReady && !can("configuracoes.permissoes")) {
      router.replace("/admin");
    }
  }, [authLoading, user, can, permissionsReady, router]);

  function load() {
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
  }, [filter]);

  async function handleApprove(id: string) {
    setActingId(id);
    try {
      const res = await apiFetch(`/api/permission-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) load();
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
      }
    } finally {
      setActingId(null);
    }
  }

  const pendingCount = filter === "ALL" ? requests.filter((r) => r.status === "PENDING").length : requests.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
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
          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/admin/configuracoes"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Link>
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
              Informe o motivo da reprovação. Este motivo ficará associado ao apontamento para consulta posterior.
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
