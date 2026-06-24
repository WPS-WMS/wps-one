"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Plug, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type SharePointConfig = {
  sharePointEnabled: boolean;
  graphConfigured: boolean;
};

export default function ConfiguracoesSharePointPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";
  const { user, loading, can, permissionsReady } = useAuth();
  const [cfg, setCfg] = useState<SharePointConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`${basePath}/configuracoes`)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Plug className="h-6 w-6 text-blue-600" />
              Integrações
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              SharePoint, Teams e sincronização de arquivos. A equipe de cada cliente é configurada em Clientes.
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
                  (mesmas credenciais do e-mail) e adicione permissões{" "}
                  <code className="text-xs">Sites.ReadWrite.All</code> e{" "}
                  <code className="text-xs">Files.ReadWrite.All</code>.
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

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-700">{success}</p>}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600">{error ?? "Não foi possível carregar."}</p>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-2">
            <p className="font-medium text-slate-800">Como funciona</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ative a integração nesta tela</li>
              <li>
                Em <strong>Configurações → Clientes</strong>, abra o cliente (ícone olho) e configure a equipe Teams
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
