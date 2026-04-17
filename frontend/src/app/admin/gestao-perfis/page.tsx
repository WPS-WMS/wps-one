"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Check, ArrowLeft, Loader2, Search, Shield, X } from "lucide-react";

type RoleId = "ADMIN_PORTAL" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE";

type PermissionState = "allow" | "deny";

type Feature = {
  id: string;
  label: string;
  section: string;
};

const ROLES: { id: RoleId; label: string }[] = [
  { id: "ADMIN_PORTAL", label: "Administrador do portal" },
  { id: "GESTOR_PROJETOS", label: "Gestor de Projetos" },
  { id: "CONSULTOR", label: "Consultor" },
  { id: "CLIENTE", label: "Cliente" },
];

const FEATURES: Feature[] = [
  { id: "home", label: "Home", section: "Geral" },
  { id: "projeto", label: "Projeto", section: "Projetos" },
  { id: "projeto.lista", label: "Projeto \u003e Lista de projetos", section: "Projetos" },
  { id: "projeto.dashboardDaily", label: "Projeto \u003e Dashboard Daily", section: "Projetos" },
  { id: "projeto.novo", label: "Projetos \u003e Novo projeto", section: "Projetos" },
  { id: "projeto.editar", label: "Projetos \u003e Editar projeto", section: "Projetos" },
  { id: "projeto.arquivar", label: "Projetos \u003e Arquivar projetos", section: "Projetos" },
  { id: "projeto.excluir", label: "Projetos \u003e Excluir projeto", section: "Projetos" },
  { id: "tarefa.editar", label: "Tarefas \u003e Editar tarefas", section: "Tarefas" },
  { id: "apontamentos", label: "Apontamentos", section: "Apontamentos" },
  { id: "hora-banco", label: "Banco de horas", section: "Banco de horas" },
  { id: "chamados.criacao", label: "Criação de chamados", section: "Chamados" },
  { id: "relatorios", label: "Relatórios (menu)", section: "Relatórios" },
  { id: "relatorios.horas", label: "Relatórios \u003e Horas", section: "Relatórios" },
  { id: "relatorios.utilizacao", label: "Relatórios \u003e Utilização", section: "Relatórios" },
  { id: "relatorios.chamados", label: "Relatórios \u003e Chamados", section: "Relatórios" },
  { id: "relatorios.exportacao", label: "Relatórios \u003e Exportação para faturamento", section: "Relatórios" },
  { id: "configuracoes", label: "Configurações (menu)", section: "Configurações" },
  { id: "configuracoes.usuarios", label: "Configurações \u003e Usuários", section: "Configurações" },
  { id: "configuracoes.permissoes", label: "Configurações \u003e Permissões", section: "Configurações" },
  { id: "configuracoes.clientes", label: "Configurações \u003e Clientes", section: "Configurações" },
  { id: "configuracoes.gestaoPerfis", label: "Configurações \u003e Gestão de perfis", section: "Configurações" },
  { id: "portal.corporativo", label: "Portal corporativo", section: "Portal corporativo" },
  {
    id: "portal.corporativo.editar",
    label: "Portal corporativo \u003e Editar conteúdos",
    section: "Portal corporativo",
  },
];

type Permissions = Record<string, Record<RoleId, PermissionState>>;

function buildDefaultPermissions(): Permissions {
  const initial: Permissions = {};
  FEATURES.forEach((f) => {
    switch (f.id) {
      case "home":
        initial[f.id] = {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "allow",
        };
        break;
      case "projeto":
      case "projeto.lista":
      case "projeto.dashboardDaily":
      case "projeto.novo":
      case "projeto.editar":
      case "projeto.arquivar":
      case "projeto.excluir":
      case "tarefa.editar":
      case "apontamentos":
      case "hora-banco":
        initial[f.id] = {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "deny",
        };
        break;
      case "relatorios":
      case "relatorios.horas":
      case "relatorios.utilizacao":
      case "relatorios.chamados":
      case "relatorios.exportacao":
      case "configuracoes":
      case "configuracoes.permissoes":
        initial[f.id] = {
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      case "chamados.criacao":
        initial[f.id] = {
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "allow",
        };
        break;
      case "configuracoes.usuarios":
      case "configuracoes.clientes":
      case "configuracoes.gestaoPerfis":
        initial[f.id] = {
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      case "portal.corporativo":
        initial[f.id] = {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "allow",
          CLIENTE: "deny",
        };
        break;
      case "portal.corporativo.editar":
        initial[f.id] = {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      default:
        initial[f.id] = {
          ADMIN_PORTAL: "allow",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "allow",
          CLIENTE: "allow",
        };
    }
  });
  return initial;
}

export default function GestaoPerfisPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const [initialPermissions, setInitialPermissions] = useState<Permissions>(() => buildDefaultPermissions());
  const [permissions, setPermissions] = useState<Permissions>(() => buildDefaultPermissions());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("configuracoes.gestaoPerfis")) {
      router.replace(`${basePath}/configuracoes`);
    }
  }, [user, loading, can, router, basePath]);

  useEffect(() => {
    if (loading || !user) return;
    if (!can("configuracoes.gestaoPerfis")) return;
    setLoadError(null);
    apiFetch("/api/access-control")
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object") return;
        setInitialPermissions(data);
        setPermissions(data);
      })
      .catch(() => {
        setLoadError("Não foi possível carregar as permissões. Verifique sua conexão e tente novamente.");
      });
  }, [user, loading, can]);

  const filteredFeatures = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return FEATURES;
    return FEATURES.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.section.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q),
    );
  }, [filter]);

  const sections = useMemo(
    () => Array.from(new Set(filteredFeatures.map((f) => f.section))),
    [filteredFeatures],
  );

  const hasPendingChanges = useMemo(() => {
    for (const feature of FEATURES) {
      const base = initialPermissions[feature.id];
      const current = permissions[feature.id];
      for (const role of ROLES) {
        const baseState = base?.[role.id] ?? "allow";
        const currentState = current?.[role.id] ?? "allow";
        if (baseState !== currentState) {
          return true;
        }
      }
    }
    return false;
  }, [initialPermissions, permissions]);

  if (loading || !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[color:var(--background)] min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--muted-foreground)]" aria-hidden />
        <p className="text-sm text-[color:var(--muted-foreground)]">Carregando…</p>
      </div>
    );
  }

  function togglePermission(featureId: string, roleId: RoleId) {
    setPermissions((prev) => {
      const current = prev[featureId]?.[roleId] ?? "allow";
      const next: PermissionState = current === "allow" ? "deny" : "allow";
      return {
        ...prev,
        [featureId]: {
          ...prev[featureId],
          [roleId]: next,
        },
      };
    });
  }

  function handleSave() {
    setSaveMessage(null);
    setLoadError(null);
    setSaving(true);
    apiFetch("/api/access-control", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permissions),
    })
      .then(async (r) => {
        if (!r.ok) {
          const msg = await r.json().catch(() => null);
          throw new Error(msg?.error || "Erro ao salvar permissões.");
        }
        const data = await r.json().catch(() => null);
        const next = data?.permissions ?? permissions;
        setInitialPermissions(next);
        setPermissions(next);
        setSaveMessage("Permissões atualizadas com sucesso.");
        setTimeout(() => setSaveMessage(null), 3000);
      })
      .catch((e: Error) => {
        setLoadError(e?.message || "Erro ao salvar permissões.");
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
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
      <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[color:var(--muted-foreground)]">
              <Shield className="h-5 w-5 shrink-0 text-[color:var(--primary)]" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wide">Configurações</span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold text-[color:var(--foreground)] mt-0.5">
              Gestão de perfis
            </h1>
            <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-1 max-w-2xl leading-relaxed">
              Defina, por perfil, quais telas e funcionalidades ficam disponíveis. Toque em cada célula para alternar
              entre permitir e bloquear.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <div className="relative min-w-0 flex-1 max-w-md">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted-foreground)]"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar por funcionalidade ou seção…"
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                    aria-label="Filtrar lista de permissões"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 justify-end">
                <div className="flex items-center gap-3 text-xs text-[color:var(--muted-foreground)] border border-[color:var(--border)]/80 rounded-xl px-3 py-2 bg-[color:var(--background)]/40">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    Com acesso
                  </span>
                  <span className="text-[color:var(--border)]">|</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[color:var(--muted-foreground)]/15 text-[color:var(--muted-foreground)]">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    Sem acesso
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasPendingChanges || saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl min-w-[160px] px-4 py-2.5 text-sm font-semibold shadow-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      Salvando…
                    </>
                  ) : (
                    "Salvar alterações"
                  )}
                </button>
              </div>
            </div>
          </div>

          {hasPendingChanges && (
            <div
              className="rounded-xl border border-amber-200/80 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-800/50 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
              role="status"
            >
              Existem alterações ainda não salvas. Clique em <strong>Salvar alterações</strong> para aplicá-las.
            </div>
          )}

          {saveMessage && !hasPendingChanges && (
            <div
              className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/30 dark:border-emerald-800/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100"
              role="status"
            >
              {saveMessage}
            </div>
          )}

          {loadError && (
            <div className="wps-apontamento-consultor-error rounded-xl border px-4 py-3 text-sm" role="alert">
              {loadError}
            </div>
          )}

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div
                  className="grid grid-cols-[minmax(240px,2fr)_repeat(4,minmax(112px,1fr))] border-b border-[color:var(--border)] bg-[color:var(--surface)] text-left"
                  role="row"
                >
                  <div
                    className="sticky left-0 z-[1] px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] bg-[color:var(--surface)] border-r border-[color:var(--border)] shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)]"
                    role="columnheader"
                  >
                    Tela / funcionalidade
                  </div>
                  {ROLES.map((role) => (
                    <div
                      key={role.id}
                      className="px-2 py-3.5 text-center text-[11px] sm:text-xs font-semibold leading-tight text-[color:var(--foreground)] border-r border-[color:var(--border)] last:border-r-0"
                      role="columnheader"
                    >
                      {role.label}
                    </div>
                  ))}
                </div>

                {sections.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-[color:var(--muted-foreground)]">
                    Nenhuma funcionalidade corresponde ao filtro. Ajuste o texto de busca.
                  </div>
                ) : (
                  sections.map((section) => (
                    <div key={section} className="border-t border-[color:var(--border)] first:border-t-0">
                      <div className="bg-[color:var(--primary)]/[0.06] px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] border-b border-[color:var(--border)]/80">
                        {section}
                      </div>
                      {filteredFeatures
                        .filter((f) => f.section === section)
                        .map((feature, idx) => {
                          const rowKey = `${section}-${feature.id}`;
                          const rowBg =
                            idx % 2 === 0 ? "bg-[color:var(--surface)]" : "bg-[color:var(--background)]/35";
                          return (
                            <div
                              key={rowKey}
                              className={`grid grid-cols-[minmax(240px,2fr)_repeat(4,minmax(112px,1fr))] text-xs border-b border-[color:var(--border)]/60 last:border-b-0 ${rowBg}`}
                              role="row"
                            >
                              <div
                                className={`sticky left-0 z-[1] px-4 py-3 border-r border-[color:var(--border)]/70 text-[color:var(--foreground)] ${rowBg} shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)]`}
                              >
                                <span className="text-sm font-medium leading-snug">{feature.label}</span>
                              </div>
                              {ROLES.map((role) => {
                                const state = permissions[feature.id]?.[role.id] ?? "allow";
                                const isAllow = state === "allow";
                                return (
                                  <div
                                    key={`${rowKey}-${role.id}`}
                                    className="flex items-center justify-center p-2 border-r border-[color:var(--border)]/50 last:border-r-0"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => togglePermission(feature.id, role.id)}
                                      aria-pressed={isAllow}
                                      aria-label={`${feature.label}: ${role.label} — ${isAllow ? "com acesso" : "sem acesso"}. Clique para alternar.`}
                                      className={`w-full max-w-[7.5rem] inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 ${
                                        isAllow
                                          ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300/60 hover:bg-emerald-500/15"
                                          : "bg-[color:var(--muted-foreground)]/10 text-[color:var(--muted-foreground)] border-[color:var(--border)] hover:bg-[color:var(--muted-foreground)]/15"
                                      }`}
                                    >
                                      {isAllow ? (
                                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      ) : (
                                        <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      )}
                                      <span className="truncate">{isAllow ? "Com acesso" : "Sem acesso"}</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
