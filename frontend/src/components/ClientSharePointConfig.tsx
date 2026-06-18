"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, PlugZap, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ClientSharePointConfig = {
  clientId: string;
  clientName: string;
  sharePointEnabled: boolean;
  sharePointSiteUrl: string | null;
  sharePointDriveId: string | null;
  sharePointRootFolderPath: string | null;
  tenantSharePointEnabled: boolean;
  graphConfigured: boolean;
};

type Props = {
  clientId: string;
};

export function ClientSharePointConfig({ clientId }: Props) {
  const [cfg, setCfg] = useState<ClientSharePointConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sharepoint/clients/${clientId}/config`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar");
      setCfg(data as ClientSharePointConfig);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      setCfg(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/api/sharepoint/clients/${clientId}/config`, {
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
      setCfg(data as ClientSharePointConfig);
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
        await apiFetch(`/api/sharepoint/clients/${clientId}/config`, {
          method: "PUT",
          body: JSON.stringify({
            sharePointEnabled: cfg.sharePointEnabled,
            sharePointSiteUrl: cfg.sharePointSiteUrl,
            sharePointDriveId: cfg.sharePointDriveId,
            sharePointRootFolderPath: cfg.sharePointRootFolderPath ?? "Projetos WPSone",
          }),
        });
      }
      const res = await apiFetch(`/api/sharepoint/clients/${clientId}/test-connection`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? "Falha na conexão");
      setSuccess(`Conexão OK. Drive: ${data.driveId?.slice(0, 12) ?? "—"}…`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao testar conexão");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-slate-500">Carregando SharePoint…</p>
      </div>
    );
  }

  if (!cfg) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-sm text-red-600">{error ?? "Não foi possível carregar SharePoint."}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Cloud className="h-5 w-5 text-blue-600" />
          SharePoint / Teams
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Projetos e tarefas deste cliente serão criados na equipe Teams informada abaixo.
        </p>
      </div>

      {!cfg.tenantSharePointEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ative a integração SharePoint em <strong>Configurações → SharePoint</strong> antes de configurar este cliente.
        </div>
      )}

      {!cfg.graphConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Microsoft Graph não está configurado no servidor (credenciais Azure no Render).
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.sharePointEnabled}
          onChange={(e) => setCfg({ ...cfg, sharePointEnabled: e.target.checked })}
          disabled={!cfg.tenantSharePointEnabled}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm font-medium text-slate-800">Usar equipe Teams deste cliente</span>
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          URL da equipe Teams / site SharePoint
        </label>
        <input
          type="url"
          value={cfg.sharePointSiteUrl ?? ""}
          onChange={(e) => setCfg({ ...cfg, sharePointSiteUrl: e.target.value })}
          placeholder="https://suaempresa.sharepoint.com/sites/EquipeDoCliente"
          disabled={!cfg.tenantSharePointEnabled}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
        />
        <p className="text-xs text-slate-500 mt-1">
          No Teams: abra a equipe do cliente → Arquivos → Abrir no SharePoint → copie a URL até{" "}
          <code className="text-xs">/sites/NomeDaEquipe</code>.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pasta raiz no SharePoint</label>
        <input
          type="text"
          value={cfg.sharePointRootFolderPath ?? "Projetos WPSone"}
          onChange={(e) => setCfg({ ...cfg, sharePointRootFolderPath: e.target.value })}
          disabled={!cfg.tenantSharePointEnabled}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
        />
        <p className="text-xs text-slate-500 mt-1">
          Dentro dela: pastas por <strong>projeto</strong> e subpastas por <strong>tarefa</strong>.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !cfg.tenantSharePointEnabled}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || !cfg.sharePointSiteUrl || !cfg.tenantSharePointEnabled}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <PlugZap className="h-4 w-4" />
          {testing ? "Testando…" : "Testar conexão"}
        </button>
      </div>
    </div>
  );
}
