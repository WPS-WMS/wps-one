"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Link2Off, Plug, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { navigateBack } from "@/lib/navigateBack";

type MicrosoftConnection = {
  connected: boolean;
  accountEmail: string | null;
  azureTenantId: string | null;
  connectedAt: string | null;
  graphAvailable: boolean;
  legacyServerGraph: boolean;
  oauthAppConfigured: boolean;
};

type SharePointConfig = {
  sharePointEnabled: boolean;
  graphConfigured: boolean;
  microsoft: MicrosoftConnection | null;
};

export default function ConfiguracoesSharePointPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { user, loading, can, permissionsReady } = useAuth();
  const [cfg, setCfg] = useState<SharePointConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingCfg(true);
    setError(null);
    try {
      const res = await apiFetch("/api/sharepoint/config");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar");
      setCfg({
        sharePointEnabled: data.sharePointEnabled === true,
        graphConfigured: data.graphConfigured === true,
        microsoft: (data.microsoft as MicrosoftConnection) ?? null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      setCfg(null);
    } finally {
      setLoadingCfg(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user || !permissionsReady) return;
    if (!can("configuracoes.sharepoint")) return;
    void load();
  }, [loading, user, permissionsReady, can, load]);

  useEffect(() => {
    const status = searchParams.get("microsoft");
    if (!status) return;
    if (status === "connected") {
      setSuccess("Conta Microsoft conectada. Os arquivos usarão o SharePoint desta empresa.");
      void load();
    } else if (status === "error") {
      setError(searchParams.get("message") || "Falha ao conectar Microsoft.");
    }
    router.replace(`${basePath}/configuracoes/sharepoint`);
  }, [searchParams, router, basePath, load]);

  async function handleConnectMicrosoft() {
    setConnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const returnPath = `${basePath}/configuracoes/sharepoint`;
      const res = await apiFetch(
        `/api/sharepoint/oauth/start?returnPath=${encodeURIComponent(returnPath)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao iniciar conexão Microsoft");
      const url = String(data.authorizeUrl || "");
      if (!url) throw new Error("URL de autorização não retornada.");
      window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao conectar Microsoft");
      setConnecting(false);
    }
  }

  async function handleDisconnectMicrosoft() {
    setDisconnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/sharepoint/oauth/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao desconectar");
      setCfg((prev) =>
        prev
          ? {
              ...prev,
              microsoft: (data.microsoft as MicrosoftConnection) ?? null,
              graphConfigured: data.microsoft?.graphAvailable === true,
              sharePointEnabled:
                data.microsoft?.graphAvailable === true ? prev.sharePointEnabled : false,
            }
          : prev,
      );
      setSuccess("Conta Microsoft desconectada.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch("/api/sharepoint/config", {
        method: "PUT",
        body: JSON.stringify({
          sharePointEnabled: cfg.sharePointEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar");
      setCfg({
        sharePointEnabled: data.sharePointEnabled === true,
        graphConfigured: data.graphConfigured === true,
        microsoft: (data.microsoft as MicrosoftConnection) ?? null,
      });
      setSuccess("Configuração salva.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    );
  }

  if (!can("configuracoes.sharepoint")) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <p className="text-sm text-slate-600">Sem permissão para configurar integrações.</p>
      </div>
    );
  }

  const microsoft = cfg?.microsoft ?? null;
  const canEnable = cfg?.graphConfigured === true;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <button
        type="button"
        onClick={() => navigateBack(router, basePath)}
        aria-label="Voltar"
        title="Voltar"
        className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.06)", color: "var(--foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Plug className="h-6 w-6 text-blue-600" />
              Integrações
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Conecte o Microsoft 365 desta empresa. Arquivos vão para o SharePoint/Teams dela. A equipe
              de cada cliente é configurada em Clientes.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {loadingCfg ? (
            <p className="text-sm text-slate-500">Carregando configuração…</p>
          ) : cfg ? (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Conta Microsoft</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Preferencial: conectar o tenant Microsoft desta empresa. Assim os arquivos ficam no
                    SharePoint dela (não no da WPS).
                  </p>
                </div>

                {microsoft?.connected ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="font-medium">Conectado</p>
                    <p className="mt-1">
                      {microsoft.accountEmail || "Conta Microsoft"}
                      {microsoft.azureTenantId ? (
                        <span className="block text-xs mt-0.5 opacity-80">
                          Tenant Azure: {microsoft.azureTenantId}
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : microsoft?.legacyServerGraph ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Usando Graph legado do servidor (WPS). Para clientes externos, conecte a Microsoft
                    desta empresa.
                  </div>
                ) : !microsoft?.oauthAppConfigured ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    App Microsoft não configurado no servidor (CLIENT_ID / CLIENT_SECRET) ou redirect URI
                    ausente. Peça ao time de plataforma para configurar o app multi-tenant.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Nenhuma conta Microsoft conectada. Sem conexão, a integração não envia arquivos ao
                    SharePoint do cliente.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {microsoft?.connected ? (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectMicrosoft()}
                      disabled={disconnecting}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Link2Off className="h-4 w-4" />
                      {disconnecting ? "Desconectando…" : "Desconectar Microsoft"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleConnectMicrosoft()}
                      disabled={connecting || microsoft?.oauthAppConfigured === false}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#2F2A6B] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      <Plug className="h-4 w-4" />
                      {connecting ? "Redirecionando…" : "Conectar Microsoft"}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-sm">
                <label
                  className={`flex items-center gap-3 ${canEnable ? "cursor-pointer" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={cfg.sharePointEnabled}
                    disabled={!canEnable}
                    onChange={(e) => setCfg({ ...cfg, sharePointEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-800">Ativar integração SharePoint</span>
                </label>
                {!canEnable ? (
                  <p className="text-xs text-slate-500">
                    Conecte a Microsoft acima (ou use o Graph legado do servidor) para ativar.
                  </p>
                ) : null}

                {error && <p className="text-sm text-red-600">{error}</p>}
                {success && <p className="text-sm text-green-700">{success}</p>}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || (!canEnable && cfg.sharePointEnabled)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">{error ?? "Não foi possível carregar."}</p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-2">
            <p className="font-medium text-slate-800">Como funciona</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Conecte a conta Microsoft desta empresa (SharePoint/Teams dela)</li>
              <li>Ative a integração nesta tela</li>
              <li>
                Em <strong>Configurações → Clientes</strong>, abra o cliente (ícone olho) e configure a
                equipe Teams
              </li>
              <li>Novo projeto → pasta na equipe do cliente</li>
              <li>Nova tarefa → subpasta dentro do projeto</li>
              <li>Anexo no WPSone → enviado para a pasta da tarefa</li>
              <li>Arquivo no SharePoint → aparece nos anexos (sync automático)</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
