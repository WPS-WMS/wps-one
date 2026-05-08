\"use client\";

import { useEffect, useMemo, useRef, useState } from \"react\";
import { createPortal } from \"react-dom\";
import { apiFetch } from \"@/lib/api\";
import { useAuth } from \"@/contexts/AuthContext\";
import {
  ReportsCard,
  ReportsCardHeader,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsPrimaryBtnClass,
  reportsSecondaryBtnClass,
} from \"@/components/reports/ReportsPrimitives\";
import { Calendar, Download, Filter, RefreshCw, User as UserIcon, Tag } from \"lucide-react\";

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
  return new Intl.NumberFormat(\"pt-BR\", { style: \"currency\", currency: \"BRL\" }).format(v);
}

function fmtDateTime(iso: string) {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return \"—\";
  return d.toLocaleString(\"pt-BR\", { day: \"2-digit\", month: \"2-digit\", year: \"numeric\", hour: \"2-digit\", minute: \"2-digit\" });
}

function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return \"—\";
  const ymd = String(iso).slice(0, 10);
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split(\"-\");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return \"—\";
  return d.toLocaleDateString(\"pt-BR\");
}

export default function RelatorioReembolsosPage() {
  const { user } = useAuth();
  const roleUpper = String(user?.role ?? \"\").toUpperCase();
  const canSeeAll = roleUpper === \"SUPER_ADMIN\" || roleUpper === \"GESTOR_PROJETOS\";

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState(\"\");
  const [typeId, setTypeId] = useState(\"\");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiltered, setHasFiltered] = useState(false);

  // Dropdowns via portal (evita overflow)
  const userAnchorRef = useRef<HTMLButtonElement | null>(null);
  const typeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [userRect, setUserRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [typeRect, setTypeRect] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    // Tipos ativos (para filtro)
    apiFetch(\"/api/reimbursements/types\")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setTypes(Array.isArray(list) ? list : []))
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    if (!canSeeAll) return;
    apiFetch(\"/api/users/for-select\")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, [canSeeAll]);

  useEffect(() => {
    if (!userOpen) return;
    const update = () => {
      const el = userAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setUserRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener(\"resize\", update);
    window.addEventListener(\"scroll\", update, true);
    return () => {
      window.removeEventListener(\"resize\", update);
      window.removeEventListener(\"scroll\", update, true);
    };
  }, [userOpen]);

  useEffect(() => {
    if (!typeOpen) return;
    const update = () => {
      const el = typeAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTypeRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener(\"resize\", update);
    window.addEventListener(\"scroll\", update, true);
    return () => {
      window.removeEventListener(\"resize\", update);
      window.removeEventListener(\"scroll\", update, true);
    };
  }, [typeOpen]);

  useEffect(() => {
    if (!userOpen && !typeOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === \"Escape\") {
        setUserOpen(false);
        setTypeOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const userAnchor = userAnchorRef.current;
      const typeAnchor = typeAnchorRef.current;
      const userMenu = document.getElementById(\"reimb-user-menu\");
      const typeMenu = document.getElementById(\"reimb-type-menu\");
      if (userOpen) {
        const inside = (userAnchor && target && userAnchor.contains(target)) || (userMenu && target && userMenu.contains(target));
        if (!inside) setUserOpen(false);
      }
      if (typeOpen) {
        const inside = (typeAnchor && target && typeAnchor.contains(target)) || (typeMenu && target && typeMenu.contains(target));
        if (!inside) setTypeOpen(false);
      }
    };
    window.addEventListener(\"keydown\", onKeyDown);
    window.addEventListener(\"pointerdown\", onPointerDown);
    return () => {
      window.removeEventListener(\"keydown\", onKeyDown);
      window.removeEventListener(\"pointerdown\", onPointerDown);
    };
  }, [userOpen, typeOpen]);

  const selectedUserLabel = useMemo(() => {
    if (!canSeeAll) return user?.name ?? \"—\";
    if (!userId) return \"Todos\";
    return users.find((u) => u.id === userId)?.name ?? \"Todos\";
  }, [canSeeAll, user?.name, userId, users]);

  const selectedTypeLabel = useMemo(() => {
    if (!typeId) return \"Todos\";
    return types.find((t) => t.id === typeId)?.name ?? \"Todos\";
  }, [typeId, types]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (start) params.set(\"start\", start);
      if (end) params.set(\"end\", end);
      if (canSeeAll && userId) params.set(\"userId\", userId);
      if (typeId) params.set(\"typeId\", typeId);
      const res = await apiFetch(`/api/reimbursements/report?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? \"Erro ao carregar relatório\");
      setRows(Array.isArray(body) ? body : []);
      setHasFiltered(true);
    } catch (e: unknown) {
      setRows([]);
      setHasFiltered(true);
      setError(e instanceof Error ? e.message : \"Erro ao carregar relatório\");
    } finally {
      setLoading(false);
    }
  }

  async function openAttachment(attId: string, filename: string) {
    const res = await apiFetch(`/api/reimbursements/attachments/${encodeURIComponent(attId)}/file`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url, \"_blank\", \"noopener,noreferrer\");
    if (!w) {
      const a = document.createElement(\"a\");
      a.href = url;
      a.download = filename || \"anexo\";
      a.rel = \"noopener\";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <ReportsPageShell
      title=\"Relatório de Reembolsos\"
      subtitle=\"Filtre por período, usuário e tipo. Clique no anexo para abrir rapidamente.\"
      right={
        <button
          type=\"button\"
          onClick={() => void load()}
          className={reportsSecondaryBtnClass}
          style={{ borderColor: \"var(--border)\", color: \"var(--foreground)\", background: \"rgba(0,0,0,0.02)\" }}
        >
          <RefreshCw className=\"h-4 w-4 mr-2\" />
          Atualizar
        </button>
      }
    >
      {error ? (
        <div className=\"mb-4 rounded-xl border px-4 py-3 text-sm\" style={{ borderColor: \"rgba(239,68,68,0.35)\", background: \"rgba(239,68,68,0.10)\" }}>
          {error}
        </div>
      ) : null}

      <ReportsCard className=\"overflow-hidden\">
        <ReportsCardHeader
          title={
            <span className=\"inline-flex items-center gap-2\">
              <Filter className=\"h-4 w-4\" style={{ color: \"var(--muted-foreground)\" }} />
              Filtros
            </span>
          }
        />
        <div className=\"p-4 grid grid-cols-1 md:grid-cols-4 gap-3\">
          <label className=\"min-w-0\">
            <span className=\"block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1\">
              De
            </span>
            <div className=\"relative\">
              <Calendar className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4\" style={{ color: \"var(--muted-foreground)\" }} />
              <input
                type=\"date\"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={reportsInputClass + \" pl-9\"}
                style={{ borderColor: \"var(--border)\" }}
              />
            </div>
          </label>

          <label className=\"min-w-0\">
            <span className=\"block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1\">
              Até
            </span>
            <div className=\"relative\">
              <Calendar className=\"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4\" style={{ color: \"var(--muted-foreground)\" }} />
              <input
                type=\"date\"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={reportsInputClass + \" pl-9\"}
                style={{ borderColor: \"var(--border)\" }}
              />
            </div>
          </label>

          <label className=\"min-w-0\">
            <span className=\"block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1\">
              Usuário
            </span>
            <div className=\"relative\">
              <button
                type=\"button\"
                ref={userAnchorRef}
                disabled={!canSeeAll}
                onClick={() => {
                  if (!canSeeAll) return;
                  setTypeOpen(false);
                  setUserOpen((v) => !v);
                }}
                className={reportsInputClass + \" text-left inline-flex items-center justify-between gap-2\"}
                style={{ borderColor: \"var(--border)\", opacity: canSeeAll ? 1 : 0.6 }}
                title={selectedUserLabel}
              >
                <span className=\"inline-flex items-center gap-2 min-w-0\">
                  <UserIcon className=\"h-4 w-4\" style={{ color: \"var(--muted-foreground)\" }} />
                  <span className=\"truncate\">{canSeeAll ? selectedUserLabel : (user?.name ?? \"—\")}</span>
                </span>
                <span className=\"text-xs\" style={{ color: \"var(--muted-foreground)\" }}>▾</span>
              </button>
              {typeof document !== \"undefined\" && userOpen && userRect
                ? createPortal(
                    <div
                      id=\"reimb-user-menu\"
                      style={{ position: \"fixed\", left: userRect.left, top: userRect.top, width: userRect.width, zIndex: 10000 }}
                    >
                      <div className=\"rounded-xl border bg-[color:var(--surface)] shadow-lg p-1 max-h-72 overflow-auto\" style={{ borderColor: \"var(--border)\" }}>
                        <button
                          type=\"button\"
                          onClick={() => {
                            setUserId(\"\");
                            setUserOpen(false);
                          }}
                          className=\"w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60\"
                        >
                          Todos
                        </button>
                        <div className=\"my-1 border-t\" style={{ borderColor: \"var(--border)\" }} />
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type=\"button\"
                            onClick={() => {
                              setUserId(u.id);
                              setUserOpen(false);
                            }}
                            className=\"w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60\"
                            title={u.name}
                          >
                            {u.name}
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </label>

          <label className=\"min-w-0\">
            <span className=\"block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1\">
              Tipo
            </span>
            <div className=\"relative\">
              <button
                type=\"button\"
                ref={typeAnchorRef}
                onClick={() => {
                  setUserOpen(false);
                  setTypeOpen((v) => !v);
                }}
                className={reportsInputClass + \" text-left inline-flex items-center justify-between gap-2\"}
                style={{ borderColor: \"var(--border)\" }}
                title={selectedTypeLabel}
              >
                <span className=\"inline-flex items-center gap-2 min-w-0\">
                  <Tag className=\"h-4 w-4\" style={{ color: \"var(--muted-foreground)\" }} />
                  <span className=\"truncate\">{selectedTypeLabel}</span>
                </span>
                <span className=\"text-xs\" style={{ color: \"var(--muted-foreground)\" }}>▾</span>
              </button>
              {typeof document !== \"undefined\" && typeOpen && typeRect
                ? createPortal(
                    <div
                      id=\"reimb-type-menu\"
                      style={{ position: \"fixed\", left: typeRect.left, top: typeRect.top, width: typeRect.width, zIndex: 10000 }}
                    >
                      <div className=\"rounded-xl border bg-[color:var(--surface)] shadow-lg p-1 max-h-72 overflow-auto\" style={{ borderColor: \"var(--border)\" }}>
                        <button
                          type=\"button\"
                          onClick={() => {
                            setTypeId(\"\");
                            setTypeOpen(false);
                          }}
                          className=\"w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60\"
                        >
                          Todos
                        </button>
                        <div className=\"my-1 border-t\" style={{ borderColor: \"var(--border)\" }} />
                        {types.map((t) => (
                          <button
                            key={t.id}
                            type=\"button\"
                            onClick={() => {
                              setTypeId(t.id);
                              setTypeOpen(false);
                            }}
                            className=\"w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60\"
                            title={t.name}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </label>
        </div>

        <div className=\"px-4 pb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between\">
          <div className=\"text-xs text-[color:var(--muted-foreground)]\">
            {hasFiltered ? (
              <span>{rows.length} registro(s)</span>
            ) : (
              <span>Defina os filtros e clique em Filtrar.</span>
            )}
          </div>
          <div className=\"flex gap-2\">
            <button
              type=\"button\"
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                setStart(d.toISOString().slice(0, 10));
                setEnd(new Date().toISOString().slice(0, 10));
                setUserId(\"\");
                setTypeId(\"\");
                setHasFiltered(false);
                setRows([]);
                setError(null);
              }}
              className={reportsSecondaryBtnClass}
              style={{ borderColor: \"var(--border)\", color: \"var(--foreground)\", background: \"transparent\" }}
              disabled={loading}
            >
              Limpar
            </button>
            <button
              type=\"button\"
              onClick={() => void load()}
              className={reportsPrimaryBtnClass}
              style={{ background: \"var(--primary)\" }}
              disabled={loading}
            >
              {loading ? \"Filtrando...\" : \"Filtrar\"}
            </button>
          </div>
        </div>
      </ReportsCard>

      <div className=\"mt-4\" />

      <ReportsCard className=\"overflow-hidden\">
        <ReportsCardHeader
          title=\"Resultados\"
          right={
            <span className=\"inline-flex items-center gap-2\">
              <Download className=\"h-4 w-4\" />
              Anexo clicável
            </span>
          }
        />
        {!hasFiltered ? (
          <ReportsEmpty>Use os filtros acima para carregar o relatório.</ReportsEmpty>
        ) : rows.length === 0 ? (
          <ReportsEmpty>Nenhum resultado encontrado para os filtros.</ReportsEmpty>
        ) : (
          <div className=\"overflow-auto\">
            <table className=\"min-w-[1100px] w-full text-sm\">
              <thead>
                <tr className=\"text-xs uppercase tracking-wide\" style={{ color: \"var(--muted-foreground)\" }}>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Usuário</th>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Data e hora</th>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Projeto</th>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Tipo</th>
                  <th className=\"text-right px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Valor</th>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Descrição</th>
                  <th className=\"text-left px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>Anexo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const firstAtt = r.attachments?.[0] ?? null;
                  return (
                    <tr key={r.id} className=\"hover:bg-[color:var(--background)]/40\">
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        <div className=\"min-w-0\">
                          <p className=\"font-semibold text-[color:var(--foreground)] truncate\" title={r.user.name}>{r.user.name}</p>
                          {r.user.email ? <p className=\"text-xs text-[color:var(--muted-foreground)] truncate\">{r.user.email}</p> : null}
                        </div>
                      </td>
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        <p className=\"text-[color:var(--foreground)]\">{fmtDateTime(r.createdAt)}</p>
                        <p className=\"text-xs text-[color:var(--muted-foreground)]\">Despesa: {fmtDateOnly(r.expenseDate)}</p>
                      </td>
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        <p className=\"text-[color:var(--foreground)] font-medium\">{r.project.name}</p>
                        {r.project.client?.name ? <p className=\"text-xs text-[color:var(--muted-foreground)]\">{r.project.client.name}</p> : null}
                      </td>
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        {r.type.name}
                      </td>
                      <td className=\"px-4 py-3 border-b text-right tabular-nums\" style={{ borderColor: \"var(--border)\" }}>
                        {fmtBrlFromCents(r.amountCents)}
                      </td>
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        <span className=\"block max-w-[520px] truncate\" title={r.description}>{r.description}</span>
                      </td>
                      <td className=\"px-4 py-3 border-b\" style={{ borderColor: \"var(--border)\" }}>
                        {firstAtt ? (
                          <button
                            type=\"button\"
                            onClick={() => void openAttachment(firstAtt.id, firstAtt.filename)}
                            className=\"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:opacity-90\"
                            style={{ borderColor: \"var(--border)\", background: \"rgba(0,0,0,0.02)\", color: \"var(--foreground)\" }}
                            title=\"Abrir anexo\"
                          >
                            <Download className=\"h-4 w-4\" />
                            {firstAtt.filename}
                            {r.attachments.length > 1 ? (
                              <span className=\"text-[10px] text-[color:var(--muted-foreground)]\">+{r.attachments.length - 1}</span>
                            ) : null}
                          </button>
                        ) : (
                          <span className=\"text-xs text-[color:var(--muted-foreground)]\">—</span>
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

