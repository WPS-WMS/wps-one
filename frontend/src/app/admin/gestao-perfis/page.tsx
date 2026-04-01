"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/components/Link";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { ChevronLeft } from "lucide-react";

type RoleId = "SUPER_ADMIN" | "ADMIN_PORTAL" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE";

type PermissionState = "allow" | "deny";

type Feature = {
  id: string;
  label: string;
  section: string;
};

const ROLES: { id: RoleId; label: string }[] = [
  { id: "SUPER_ADMIN", label: "Super administrador" },
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
  { id: "projeto.excluir", label: "Projetos \u003e Excluir projeto", section: "Projetos" },
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
          SUPER_ADMIN: "allow",
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
      case "projeto.excluir":
      case "apontamentos":
      case "hora-banco":
        initial[f.id] = {
          SUPER_ADMIN: "allow",
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
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "allow",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      case "chamados.criacao":
        initial[f.id] = {
          SUPER_ADMIN: "deny",
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
          SUPER_ADMIN: "allow",
          ADMIN_PORTAL: "deny",
          GESTOR_PROJETOS: "deny",
          CONSULTOR: "deny",
          CLIENTE: "deny",
        };
        break;
      default:
        initial[f.id] = {
          SUPER_ADMIN: "allow",
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
  const basePath =
    user?.role === "CLIENTE"
      ? "/cliente"
      : user?.role === "GESTOR_PROJETOS"
        ? "/gestor"
        : "/consultor";

  useEffect(() => {
    if (loading) return;
      if (!user) {
      router.replace("/login");
      return;
    }
    if (!can("configuracoes.gestaoPerfis")) {
      const basePath =
        user.role === "CLIENTE"
          ? "/cliente"
          : user.role === "GESTOR_PROJETOS"
            ? "/gestor"
            : "/consultor";
      router.replace(`${basePath}/configuracoes`);
    }
  }, [user, loading, can, router, basePath]);

  const [initialPermissions, setInitialPermissions] = useState<Permissions>(() => buildDefaultPermissions());
  const [permissions, setPermissions] = useState<Permissions>(() => buildDefaultPermissions());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const sections = useMemo(
    () => Array.from(new Set(FEATURES.map((f) => f.section))),
    []
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
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-blue-700">Carregando...</p>
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
      .catch((e) => {
        setLoadError(e?.message || "Erro ao salvar permissões.");
      });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Gestão de perfis</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Configure, por perfil, o acesso às telas e principais funcionalidades do sistema.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-4 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`${basePath}/configuracoes`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Voltar</span>
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasPendingChanges}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
            >
              Salvar alterações
            </button>
          </div>
          {hasPendingChanges && (
            <p className="text-[11px] text-amber-700">
              Existem alterações de permissão ainda não salvas.
            </p>
          )}
          {saveMessage && !hasPendingChanges && (
            <p className="text-[11px] text-emerald-700">
              {saveMessage}
            </p>
          )}
          {loadError && (
            <p className="text-[11px] text-red-700">
              {loadError}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(220px,2fr)_repeat(4,minmax(120px,1fr))] bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
                <div className="px-4 py-3 border-r border-slate-200">Tela / Funcionalidade</div>
                {ROLES.map((role) => (
                  <div
                    key={role.id}
                    className="px-3 py-3 text-center border-r last:border-r-0 border-slate-200"
                  >
                    {role.label}
                  </div>
                ))}
              </div>

              {sections.map((section) => (
                <div key={section} className="border-t border-slate-200 first:border-t-0">
                  <div className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    {section}
                  </div>
                  {FEATURES.filter((f) => f.section === section).map((feature, idx) => {
                    const rowKey = `${section}-${feature.id}`;
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/80";
                    return (
                      <div
                        key={rowKey}
                        className={`grid grid-cols-[minmax(220px,2fr)_repeat(4,minmax(120px,1fr))] text-xs ${rowBg} border-b border-slate-100 last:border-b-0`}
                      >
                        <div className="px-4 py-2.5 border-r border-slate-100 text-slate-800">
                          {feature.label}
                        </div>
                        {ROLES.map((role) => {
                          const state = permissions[feature.id]?.[role.id] ?? "allow";
                          const isAllow = state === "allow";
                          return (
                            <button
                              key={`${rowKey}-${role.id}`}
                              type="button"
                              onClick={() => togglePermission(feature.id, role.id)}
                              className={`m-1 inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-medium border transition ${
                                isAllow
                                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                  : "bg-slate-50 text-slate-500 border-slate-300 hover:bg-slate-100"
                              }`}
                            >
                              {isAllow ? "Com acesso" : "Sem acesso"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
