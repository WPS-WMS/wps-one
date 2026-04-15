"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, CheckCircle2, Search } from "lucide-react";
import { Link } from "@/components/Link";

type ProjectOption = {
  id: string;
  name: string;
  client?: { id: string; name: string };
  arquivado?: boolean;
  statusInicial?: string | null;
};
type ActivityRow = { id: string; name: string; isActive: boolean; projectIds: string[] };

export default function ConfiguracoesAtividadesPage() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/activities/admin").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/projects?light=true").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([a, p]) => {
        if (cancelled) return;
        setActivities(Array.isArray(a) ? a : []);
        setProjects(Array.isArray(p) ? p : []);
      })
      .catch(() => {
        if (cancelled) return;
        setActivities([]);
        setProjects([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProjects = useMemo(() => {
    return projects.filter((p) => {
      if (p.arquivado === true) return false;
      const st = String(p.statusInicial ?? "").toUpperCase();
      if (st === "ENCERRADO") return false;
      return true;
    });
  }, [projects]);

  const projectsById = useMemo(() => new Map(activeProjects.map((p) => [p.id, p])), [activeProjects]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return activities;
    return activities.filter((a) => a.name.toLowerCase().includes(s));
  }, [activities, q]);

  async function persist(id: string, patch: Partial<Pick<ActivityRow, "isActive" | "projectIds">>) {
    setSavingId(id);
    try {
      const res = await apiFetch(`/api/activities/admin/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Falha ao salvar");
      }
      setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    } catch (e: any) {
      alert(e?.message ?? "Erro ao salvar");
    } finally {
      setSavingId(null);
    }
  }

  function toggleProjectLink(activity: ActivityRow, projectId: string) {
    const has = activity.projectIds.includes(projectId);
    const next = has ? activity.projectIds.filter((x) => x !== projectId) : [...activity.projectIds, projectId];
    void persist(activity.id, { projectIds: next });
  }

  function toggleAllProjects(activity: ActivityRow) {
    const allIds = activeProjects.map((p) => p.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => activity.projectIds.includes(id));
    void persist(activity.id, { projectIds: allSelected ? [] : allIds });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
      <header
        className="flex-shrink-0 border-b px-6 py-4 bg-[color:var(--surface)]/92 backdrop-blur-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/configuracoes"
                className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:opacity-90"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
                  Atividades
                </h1>
                <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 leading-relaxed">
                  Controle quais atividades aparecem no campo “Tipo” ao abrir chamado.
                </p>
              </div>
            </div>
          </div>
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar atividade..."
                className="w-full rounded-xl border bg-[color:var(--input-bg)] py-2 pl-9 pr-3 text-sm text-[color:var(--input-fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border bg-[color:var(--surface)] shadow-sm overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    <th className="px-4 py-3 text-left font-semibold">Atividade</th>
                    <th className="px-4 py-3 text-left font-semibold">Projeto</th>
                    <th className="px-4 py-3 text-center font-semibold">Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[color:var(--muted-foreground)]">
                        Carregando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[color:var(--muted-foreground)]">
                        Nenhuma atividade encontrada.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((a) => {
                      const linked = a.projectIds
                        .map((id) => projectsById.get(id))
                        .filter(Boolean) as ProjectOption[];
                      const projectsLabel =
                        linked.length === 0
                          ? "Nenhum projeto"
                          : linked.length === activeProjects.length
                          ? "Todos os projetos"
                          : linked
                              .map((p) => (p.client?.name ? `${p.client.name} · ${p.name}` : p.name))
                              .join(", ");
                      const busy = savingId === a.id;
                      const allSelected =
                        activeProjects.length > 0 && activeProjects.every((p) => a.projectIds.includes(p.id));
                      return (
                        <tr key={a.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-3 text-[color:var(--foreground)] font-medium">{a.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="text-[color:var(--muted-foreground)] text-xs leading-relaxed">
                                {projectsLabel}
                              </div>
                              <details className="group">
                                <summary
                                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:opacity-90 w-fit"
                                  style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "rgba(0,0,0,0.02)" }}
                                >
                                  <span>Vincular projetos</span>
                                  <CheckCircle2 className="h-4 w-4 opacity-60 group-open:opacity-100" />
                                </summary>
                                <div className="mt-2 max-h-56 overflow-auto rounded-xl border p-2" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}>
                                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-95 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={allSelected}
                                      disabled={busy}
                                      onChange={() => toggleAllProjects(a)}
                                      className="h-4 w-4"
                                    />
                                    <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>
                                      Todos os projetos
                                    </span>
                                  </label>
                                  <div className="mt-1 border-t" style={{ borderColor: "var(--border)" }} />
                                  {activeProjects.map((p) => {
                                    const checked = a.projectIds.includes(p.id);
                                    const label = p.client?.name ? `${p.client.name} · ${p.name}` : p.name;
                                    return (
                                      <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-95 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={busy}
                                          onChange={() => toggleProjectLink(a, p.id)}
                                          className="h-4 w-4"
                                        />
                                        <span className="text-xs text-[color:var(--foreground)]">{label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </details>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={a.isActive}
                              disabled={busy}
                              onChange={(e) => void persist(a.id, { isActive: e.target.checked })}
                              className="h-5 w-5 cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

