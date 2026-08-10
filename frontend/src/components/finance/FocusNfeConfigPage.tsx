"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import { ArrowLeft, Loader2 } from "lucide-react";

const PERMISSION = "configuracoes.financeiro.focusNfe";
const API_PATH = "/api/focus-nfe-config";

type FocusConfig = {
  id: string | null;
  enabled: boolean;
  environment: "HOMOLOGACAO" | "PRODUCAO";
  tokenHomologacaoMasked: string | null;
  tokenProducaoMasked: string | null;
  hasTokenHomologacao: boolean;
  hasTokenProducao: boolean;
  cnpjPrestador: string | null;
  inscricaoMunicipalPrestador: string | null;
  codigoMunicipioEmissora: string | null;
  codigoTributacaoNacionalIss: string | null;
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
};

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

export function FocusNfeConfigPage() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : pathname.startsWith("/cliente")
        ? "/cliente"
        : "/admin";

  const canAccess = useMemo(
    () => isFinanceiroModuleEnabled() && can(PERMISSION),
    [can],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<"HOMOLOGACAO" | "PRODUCAO">("HOMOLOGACAO");
  const [tokenHomologacao, setTokenHomologacao] = useState("");
  const [tokenProducao, setTokenProducao] = useState("");
  const [hasTokenHomologacao, setHasTokenHomologacao] = useState(false);
  const [hasTokenProducao, setHasTokenProducao] = useState(false);
  const [tokenHomologacaoMasked, setTokenHomologacaoMasked] = useState<string | null>(null);
  const [tokenProducaoMasked, setTokenProducaoMasked] = useState<string | null>(null);
  const [codigoTributacao, setCodigoTributacao] = useState("");
  const [descricaoPadrao, setDescricaoPadrao] = useState("");
  const [cnpjPrestador, setCnpjPrestador] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [codigoMunicipio, setCodigoMunicipio] = useState("");
  const [codigoSimples, setCodigoSimples] = useState("");
  const [focusEmpresaInfo, setFocusEmpresaInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch(API_PATH);
    const body = (await r.json().catch(() => null)) as FocusConfig | { error?: string } | null;
    if (!r.ok) {
      setError(
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Não foi possível carregar a configuração Focus NFe.",
      );
      setLoading(false);
      return;
    }
    const cfg = body as FocusConfig;
    setEnabled(Boolean(cfg.enabled));
    setEnvironment(cfg.environment === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO");
    setHasTokenHomologacao(Boolean(cfg.hasTokenHomologacao));
    setHasTokenProducao(Boolean(cfg.hasTokenProducao));
    setTokenHomologacaoMasked(cfg.tokenHomologacaoMasked);
    setTokenProducaoMasked(cfg.tokenProducaoMasked);
    setTokenHomologacao("");
    setTokenProducao("");
    setCodigoTributacao(cfg.codigoTributacaoNacionalIss ?? "");
    setDescricaoPadrao(cfg.descricaoServicoPadrao ?? "");
    setCnpjPrestador(cfg.cnpjPrestador ?? "");
    setInscricaoMunicipal(cfg.inscricaoMunicipalPrestador ?? "");
    setCodigoMunicipio(cfg.codigoMunicipioEmissora ?? "");
    setCodigoSimples(cfg.codigoOpcaoSimplesNacional ?? "");
    setShowAdvanced(
      Boolean(
        cfg.cnpjPrestador ||
          cfg.inscricaoMunicipalPrestador ||
          cfg.codigoMunicipioEmissora ||
          cfg.codigoOpcaoSimplesNacional,
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const payload: Record<string, unknown> = {
        enabled,
        environment,
        codigoTributacaoNacionalIss: codigoTributacao,
        descricaoServicoPadrao: descricaoPadrao,
        cnpjPrestador,
        inscricaoMunicipalPrestador: inscricaoMunicipal,
        codigoMunicipioEmissora: codigoMunicipio,
        codigoOpcaoSimplesNacional: codigoSimples,
      };
      if (tokenHomologacao.trim()) payload.tokenHomologacao = tokenHomologacao.trim();
      if (tokenProducao.trim()) payload.tokenProducao = tokenProducao.trim();

      const r = await apiFetch(API_PATH, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Não foi possível salvar.");
        return;
      }
      setOkMsg("Configuração Focus NFe salva.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setFocusEmpresaInfo(null);
    try {
      const r = await apiFetch(`${API_PATH}/test-connection`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Falha ao consultar a Focus.");
        return;
      }
      const p = body?.prestador;
      setFocusEmpresaInfo(
        [
          p?.empresaNome ? `Empresa: ${p.empresaNome}` : null,
          p?.cnpjPrestador ? `CNPJ: ${p.cnpjPrestador}` : null,
          p?.codigoMunicipioEmissora ? `Município IBGE: ${p.codigoMunicipioEmissora}` : null,
          p?.inscricaoMunicipalPrestador ? `IM: ${p.inscricaoMunicipalPrestador}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Conexão OK.",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <FinanceiroModuleGuard>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button
          type="button"
          onClick={() => navigateBack(router, `${basePath}/configuracoes/financeiro`)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <h1 className="text-xl font-semibold">Focus NFe</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          CNPJ, inscrição municipal e município vêm do cadastro da empresa na Focus. Aqui você
          informa os tokens, o ambiente e o código ISS do serviço.
        </p>

        {!canAccess ? (
          <p className="mt-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</p>
        ) : loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {okMsg && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {okMsg}
              </p>
            )}
            {focusEmpresaInfo && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                {focusEmpresaInfo}
              </p>
            )}

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Ativar emissão via Focus NFe no Contas a receber
            </label>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Ambiente ativo
              </label>
              <select
                className={inputClass}
                value={environment}
                onChange={(e) =>
                  setEnvironment(e.target.value === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO")
                }
              >
                <option value="HOMOLOGACAO">Homologação</option>
                <option value="PRODUCAO">Produção</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  Token homologação
                  {hasTokenHomologacao ? ` (atual: ${tokenHomologacaoMasked})` : ""}
                </label>
                <input
                  type="password"
                  className={inputClass}
                  value={tokenHomologacao}
                  onChange={(e) => setTokenHomologacao(e.target.value)}
                  placeholder={hasTokenHomologacao ? "Deixe em branco para manter" : "Cole o token"}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  Token produção
                  {hasTokenProducao ? ` (atual: ${tokenProducaoMasked})` : ""}
                </label>
                <input
                  type="password"
                  className={inputClass}
                  value={tokenProducao}
                  onChange={(e) => setTokenProducao(e.target.value)}
                  placeholder={hasTokenProducao ? "Deixe em branco para manter" : "Cole o token"}
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Código tributação nacional ISS *
              </label>
              <input
                className={inputClass}
                value={codigoTributacao}
                onChange={(e) => setCodigoTributacao(e.target.value)}
                placeholder="Ex.: 010101"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Descrição padrão do serviço (opcional)
              </label>
              <textarea
                className={inputClass}
                rows={3}
                value={descricaoPadrao}
                onChange={(e) => setDescricaoPadrao(e.target.value)}
                placeholder="Se vazio, usa a descrição da conta a receber"
              />
            </div>

            <button
              type="button"
              className="text-sm text-[color:var(--primary)] hover:underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Ocultar overrides manuais" : "Overrides manuais (opcional)"}
            </button>

            {showAdvanced && (
              <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Só preencha se precisar sobrescrever o que já está na Focus.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                      CNPJ prestador
                    </label>
                    <input
                      className={inputClass}
                      value={cnpjPrestador}
                      onChange={(e) => setCnpjPrestador(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                      Inscrição municipal
                    </label>
                    <input
                      className={inputClass}
                      value={inscricaoMunicipal}
                      onChange={(e) => setInscricaoMunicipal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                      Código IBGE município
                    </label>
                    <input
                      className={inputClass}
                      value={codigoMunicipio}
                      onChange={(e) => setCodigoMunicipio(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                      Opção Simples Nacional
                    </label>
                    <input
                      className={inputClass}
                      value={codigoSimples}
                      onChange={(e) => setCodigoSimples(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
              <button
                type="button"
                disabled={testing || saving}
                onClick={() => void testConnection()}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              >
                {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                Testar conexão / buscar empresa
              </button>
            </div>
          </div>
        )}
      </div>
    </FinanceiroModuleGuard>
  );
}
