"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Cloud, Save, PlugZap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type SharePointConfig = {
  sharePointEnabled: boolean;
  sharePointSiteUrl: string | null;
  sharePointDriveId: string | null;
  sharePointRootFolderPath: string | null;
  sharePointRootFolderItemId: string | null;
  graphConfigured: boolean;
};

export default function ConfiguracoesSharePointPage() {
  const router = useRouter();
  const { user, loading, can, permissionsReady } = useAuth();
  const [cfg, setCfg] = useState<SharePointConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingCfg(true);
    setError(null);
    try {
      const res = await apiFetch("/api/sharepoint/config");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar");
      setCfg(data as SharePointConfig);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      setCfg(null);
    } finally {
      setLoadingCfg(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user || !permissionsReady) return;
    if (!can("configuracoes.emails")) return;
    void load();
  }, [loading, user, permissionsReady, can, load]);

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
          sharePointSiteUrl: cfg.sharePointSiteUrl,
          sharePointDriveId: cfg.sharePointDriveId,
          sharePointRootFolderPath: cfg.sharePointRootFolderPath ?? "Projetos WPSone",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar");
      setCfg(data as SharePointConfig);
      setSuccess("Configuração salva.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      if (cfg) {
        await apiFetch("/api/sharepoint/config", {
          method: "PUT",
          body: JSON.stringify({
            sharePointEnabled: cfg.sharePointEnabled,
            sharePointSiteUrl: cfg.sharePointSiteUrl,
            sharePointDriveId: cfg.sharePointDriveId,
            sharePointRootFolderPath: cfg.sharePointRootFolderPath ?? "Projetos WPSone",
          }),
        });
      }
      const res = await apiFetch("/api/sharepoint/test-connection", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? "Falha na conexão");
      setSuccess(`Conexão OK. Drive: ${data.driveId?.slice(0, 12) ?? "—"}…`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao testar conexão");
    } finally {
      setTesting(false);
    }
  }

  if (loading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </div>
    );
  }

  if (!can("configuracoes.emails")) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <p className="text-sm text-slate-600">Sem permissão para configurar integrações.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/configuracoes")}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Cloud className="h-6 w-6 text-blue-600" />
              SharePoint / Teams
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Ative a integração globalmente e configure a equipe Teams de cada cliente em Clientes.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {loadingCfg ? (
            <p className="text-sm text-slate-500">Carregando configuração…</p>
          ) : cfg ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-sm">
              {!cfg.graphConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Microsoft Graph não está configurado no servidor. Configure TENANT_ID, CLIENT_ID e CLIENT_SECRET
                  (mesmas credenciais do e-mail) e adicione permissões <code className="text-xs">Sites.ReadWrite.All</code>{" "}
                  e <code className="text-xs">Files.ReadWrite.All</code>.
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.sharePointEnabled}
                  onChange={(e) => setCfg({ ...cfg, sharePointEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-800">Ativar integração SharePoint</span>
              </label>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Para cada cliente com equipe Teams própria, configure em{" "}
                <strong>Admin → Clientes → [cliente] → SharePoint</strong>. Os campos abaixo são opcionais
                (site único legado para todos os clientes).
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  URL do site SharePoint / Teams (opcional — legado)
                </label>
                <input
                  type="url"
                  value={cfg.sharePointSiteUrl ?? ""}
                  onChange={(e) => setCfg({ ...cfg, sharePointSiteUrl: e.target.value })}
                  placeholder="https://suaempresa.sharepoint.com/sites/NomeDoTeam"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Drive ID (opcional — detectado automaticamente se vazio)
                </label>
                <input
                  type="text"
                  value={cfg.sharePointDriveId ?? ""}
                  onChange={(e) => setCfg({ ...cfg, sharePointDriveId: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pasta raiz padrão (legado)</label>
                <input
                  type="text"
                  value={cfg.sharePointRootFolderPath ?? "Projetos WPSone"}
                  onChange={(e) => setCfg({ ...cfg, sharePointRootFolderPath: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Usado só no modo site único (legado). Com equipe por cliente, configure em Clientes.
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-700">{success}</p>}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={testing || !cfg.sharePointSiteUrl}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <PlugZap className="h-4 w-4" />
                  {testing ? "Testando…" : "Testar conexão"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600">{error ?? "Não foi possível carregar."}</p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-2">
            <p className="font-medium text-slate-800">Como funciona</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ative aqui e configure a equipe de cada cliente em Clientes</li>
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
