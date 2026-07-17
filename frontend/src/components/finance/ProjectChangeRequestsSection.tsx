"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData } from "@/lib/brFormatters";
import { useAuth } from "@/contexts/AuthContext";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ChildProjectRow = {
  id: string;
  name: string;
  statusInicial: string;
  dataInicio: string;
  dataFimPrevista: string | null;
};

type ProjectChangeRequestsSectionProps = {
  projectId: string;
};

export function ProjectChangeRequestsSection({ projectId }: ProjectChangeRequestsSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { can, permissionsReady } = useAuth();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canCreateProject = useMemo(() => can("projeto.novo"), [can]);
  const resultadoHref = (id: string) =>
    `${basePath}/financeiro/dashboard-projetos?projectId=${encodeURIComponent(id)}`;

  const [children, setChildren] = useState<ChildProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [crName, setCrName] = useState("");
  const [crSaving, setCrSaving] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/projects/${projectId}/child-projects`);
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar change requests.");
      }
      setChildren(Array.isArray(body) ? body : []);
    } catch (err) {
      setChildren([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar change requests.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!permissionsReady || !projectId) return;
    void load();
  }, [permissionsReady, projectId, load]);

  async function createChangeRequest() {
    const name = crName.trim();
    if (!name) {
      setError("Nome do change request é obrigatório.");
      return;
    }
    setCrSaving(true);
    setError(null);
    const r = await apiFetch(`/api/projects/${projectId}/child-projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dataInicio: new Date().toISOString() }),
    });
    const body = await r.json().catch(() => null);
    setCrSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao criar change request.");
      return;
    }
    setCrModalOpen(false);
    setCrName("");
    if (body?.id) {
      router.push(resultadoHref(String(body.id)));
      return;
    }
    await load();
  }

  return (
    <>
      <section
        className="rounded-2xl border p-3 md:p-4 space-y-3 w-full bg-[color:var(--surface)]/80 backdrop-blur"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Change requests (projetos filhos)
            </h2>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Aditivos vinculados ao escopo principal do projeto.
            </p>
          </div>
          {canCreateProject && (
            <button
              type="button"
              onClick={() => setCrModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[color:var(--muted)]/30 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-4 w-4" />
              Novo change request
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando…
          </div>
        ) : children.length === 0 ? (
          <p className="text-xs text-[color:var(--muted-foreground)]">Nenhum projeto filho vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full text-xs border rounded-xl overflow-hidden"
              style={{ borderColor: "var(--border)" }}
            >
              <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold">Início</th>
                  <th className="px-3 py-2 text-left font-semibold">Término previsto</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold w-10" />
                </tr>
              </thead>
              <tbody>
                {children.map((child) => (
                  <tr key={child.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-medium">{child.name}</td>
                    <td className="px-3 py-2">{formatarData(child.dataInicio)}</td>
                    <td className="px-3 py-2">{formatarData(child.dataFimPrevista)}</td>
                    <td className="px-3 py-2">{child.statusInicial}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(resultadoHref(child.id))}
                        className="inline-flex items-center justify-center rounded-lg border p-1.5 hover:bg-[color:var(--muted)]/30"
                        style={{ borderColor: "var(--border)" }}
                        title="Abrir no Resultado de projeto"
                        aria-label="Abrir no Resultado de projeto"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {crModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl border bg-[color:var(--surface)] p-5 shadow-xl"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Novo change request</h3>
              <button type="button" onClick={() => setCrModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <label className={formModalLabelClass}>Nome do projeto filho</label>
              <input
                className={formModalInputClass()}
                value={crName}
                onChange={(e) => setCrName(e.target.value)}
                placeholder="Ex.: CR — Módulo relatórios"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCrModalOpen(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void createChangeRequest()}
                disabled={crSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {crSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
