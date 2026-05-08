 "use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  ReportsCard,
  ReportsCardHeader,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsPrimaryBtnClass,
  reportsSecondaryBtnClass,
} from "@/components/reports/ReportsPrimitives";
import { Calendar, Download, Filter, Receipt, Tag, User as UserIcon } from "lucide-react";

type UserOption = { id: string; name: string; role?: string };
type TypeOption = { id: string; name: string };

type Row = {
  id: string;
  createdAt: string;
  expenseDate?: string | null;
  amountCents: number;
  description: string;
  user: { id: string; name: string; email?: string };
  project: { id: string; name: string; client?: { id: string; name: string } | null };
  type: { id: string; name: string };
  attachments: Array<{ id: string; filename: string; fileType: string; fileSize: number; createdAt: string }>;
};

function fmtBrlFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDateTime(iso: string) {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  const ymd = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function RelatorioReembolsosPage() {
  const { user } = useAuth();
  const roleUpper = String(user?.role ?? "").toUpperCase();
  const canSeeAll = roleUpper === "SUPER_ADMIN" || roleUpper === "GESTOR_PROJETOS";

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState<string>("");
  const [typeId, setTypeId] = useState<string>("");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiltered, setHasFiltered] = useState(false);

  useEffect(() => {
    apiFetch("/api/reimbursements/types")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setTypes(Array.isArray(list) ? list : []))
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    if (!canSeeAll) return;
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, [canSeeAll]);

  const selectedUserLabel = useMemo(() => {
    if (!canSeeAll) return user?.name ?? "—";
    if (!userId) return "Todos";
    return users.find((u) => u.id === userId)?.name ?? "Todos";
  }, [canSeeAll, user?.name, userId, users]);

  const selectedTypeLabel = useMemo(() => {
    if (!typeId) return "Todos";
    return types.find((t) => t.id === typeId)?.name ?? "Todos";
  }, [typeId, types]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (canSeeAll && userId) params.set("userId", userId);
      if (typeId) params.set("typeId", typeId);
      const res = await apiFetch(`/api/reimbursements/report?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Erro ao carregar relatório");
      setRows(Array.isArray(body) ? body : []);
      setHasFiltered(true);
    } catch (e: unknown) {
      setRows([]);
      setHasFiltered(true);
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }

  async function openAttachment(attId: string, filename: string) {
    const res = await apiFetch(`/api/reimbursements/attachments/${encodeURIComponent(attId)}/file`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "anexo";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <ReportsPageShell
      title="Relatório de Reembolsos"
      subtitle="Filtre por período, usuário e tipo. Clique no anexo para abrir rapidamente."
    >
      {error ? (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}>
          {error}
        </div>
      ) : null}

      <ReportsCard className="overflow-hidden">
        <ReportsCardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              Filtros
            </span>
          }
        />

        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">De</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={reportsInputClass + " pl-9"} style={{ borderColor: "var(--border)" }} />
            </div>
          </label>

          <label className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Até</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={reportsInputClass + " pl-9"} style={{ borderColor: "var(--border)" }} />
            </div>
          </label>

          <label className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Usuário</span>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <select
                value={canSeeAll ? userId : (user?.id ?? "")}
                onChange={(e) => setUserId(e.target.value)}
                disabled={!canSeeAll}
                className={reportsInputClass + " pl-9 appearance-none"}
                style={{ borderColor: "var(--border)", opacity: canSeeAll ? 1 : 0.7 }}
                title={selectedUserLabel}
              >
                {!canSeeAll ? (
                  <option value={user?.id ?? ""}>{user?.name ?? "—"}</option>
                ) : (
                  <>
                    <option value="">Todos</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </label>

          <label className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Tipo</span>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className={reportsInputClass + " pl-9 appearance-none"}
                style={{ borderColor: "var(--border)" }}
                title={selectedTypeLabel}
              >
                <option value="">Todos</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="px-4 pb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="text-xs text-[color:var(--muted-foreground)]">
            {hasFiltered ? <span>{rows.length} registro(s)</span> : <span>Defina os filtros e clique em Filtrar.</span>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                setStart(d.toISOString().slice(0, 10));
                setEnd(new Date().toISOString().slice(0, 10));
                setUserId("");
                setTypeId("");
                setRows([]);
                setHasFiltered(false);
                setError(null);
              }}
              className={reportsSecondaryBtnClass}
              style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
              disabled={loading}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className={reportsPrimaryBtnClass}
              style={{ background: "var(--primary)" }}
              disabled={loading}
            >
              {loading ? "Filtrando..." : "Filtrar"}
            </button>
          </div>
        </div>
      </ReportsCard>

      <div className="mt-4" />

      <ReportsCard className="overflow-hidden">
        <ReportsCardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Receipt className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              Resultados
            </span>
          }
        />

        {!hasFiltered ? (
          <ReportsEmpty>Use os filtros acima para carregar o relatório.</ReportsEmpty>
        ) : rows.length === 0 ? (
          <ReportsEmpty>Nenhum resultado encontrado para os filtros.</ReportsEmpty>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Usuário</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Data e hora</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Projeto</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Tipo</th>
                  <th className="text-right px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Valor</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Descrição</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Anexo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const firstAtt = r.attachments?.[0] ?? null;
                  return (
                    <tr key={r.id} className="hover:bg-[color:var(--background)]/40">
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <div className="min-w-0">
                          <p className="font-semibold text-[color:var(--foreground)] truncate" title={r.user.name}>{r.user.name}</p>
                          {r.user.email ? <p className="text-xs text-[color:var(--muted-foreground)] truncate">{r.user.email}</p> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[color:var(--foreground)]">{fmtDateTime(r.createdAt)}</p>
                        <p className="text-xs text-[color:var(--muted-foreground)]">Despesa: {fmtDateOnly(r.expenseDate)}</p>
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[color:var(--foreground)] font-medium">{r.project.name}</p>
                        {r.project.client?.name ? <p className="text-xs text-[color:var(--muted-foreground)]">{r.project.client.name}</p> : null}
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>{r.type.name}</td>
                      <td className="px-4 py-3 border-b text-right tabular-nums" style={{ borderColor: "var(--border)" }}>{fmtBrlFromCents(r.amountCents)}</td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <span className="block max-w-[520px] truncate" title={r.description}>{r.description}</span>
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        {firstAtt ? (
                          <button
                            type="button"
                            onClick={() => void openAttachment(firstAtt.id, firstAtt.filename)}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                            style={{
                              borderColor: "rgba(92,0,225,0.35)",
                              background: "linear-gradient(135deg, rgba(92,0,225,0.12), rgba(0,0,0,0.01))",
                              color: "var(--foreground)",
                            }}
                            title="Baixar anexo"
                          >
                            <Download className="h-4 w-4" />
                            <span className="truncate max-w-[240px]">{firstAtt.filename}</span>
                            {r.attachments.length > 1 ? (
                              <span className="text-[10px] text-[color:var(--muted-foreground)]">+{r.attachments.length - 1}</span>
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-xs text-[color:var(--muted-foreground)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReportsCard>
    </ReportsPageShell>
  );
}

