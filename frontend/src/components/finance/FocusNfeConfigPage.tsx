"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import {
  FormModalSection,
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";

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
  codigosTributacaoIss: string | null;
  codigosNbs?: string | null;
  codigosNbsOptions?: Array<{ codigo: string; descricao: string }>;
  descricaoServicoPadrao: string | null;
  codigoOpcaoSimplesNacional: string | null;
  percentualTotalTributosSimplesNacional?: number | null;
  serieDpsHomologacao?: number | null;
  proximoNumeroDpsHomologacao?: number | null;
  serieDpsProducao?: number | null;
  proximoNumeroDpsProducao?: number | null;
  webhookUrl?: string | null;
  webhookConfigured?: boolean;
  webhookHookId?: string | null;
  webhookHookEnvironment?: string | null;
  publicApiUrlConfigured?: boolean;
  webhookNote?: string | null;
};

function parseIssCodes(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;\n]+/)) {
    const code = part.trim().replace(/\s+/g, "");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function normalizeIssCode(raw: string): string {
  return raw.trim().replace(/\D/g, "").slice(0, 6);
}

function normalizeNbsCode(raw: string): string {
  return raw.trim().replace(/\D/g, "").slice(0, 9);
}

type NbsEntry = { codigo: string; descricao: string };

function issLabel(code: string): string {
  if (code === "010601") return "Consultoria em informática";
  if (code === "170202") return "Apoio/administração (17.02)";
  return "";
}

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
  const [issExtras, setIssExtras] = useState<string[]>([]);
  const [issNovo, setIssNovo] = useState("");
  const [nbsEntries, setNbsEntries] = useState<NbsEntry[]>([]);
  const [nbsNovoCodigo, setNbsNovoCodigo] = useState("");
  const [nbsNovoDescricao, setNbsNovoDescricao] = useState("");
  const [descricaoPadrao, setDescricaoPadrao] = useState("");
  const [cnpjPrestador, setCnpjPrestador] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [codigoMunicipio, setCodigoMunicipio] = useState("");
  const [codigoSimples, setCodigoSimples] = useState("");
  const [percentualTributosSn, setPercentualTributosSn] = useState("");
  const [serieDpsHomologacao, setSerieDpsHomologacao] = useState("1");
  const [proximoNumeroDpsHomologacao, setProximoNumeroDpsHomologacao] = useState("1");
  const [serieDpsProducao, setSerieDpsProducao] = useState("1");
  const [proximoNumeroDpsProducao, setProximoNumeroDpsProducao] = useState("1");
  const [focusEmpresaInfo, setFocusEmpresaInfo] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [webhookHookEnvironment, setWebhookHookEnvironment] = useState<string | null>(null);
  const [publicApiUrlConfigured, setPublicApiUrlConfigured] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);

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
    const padrao = String(cfg.codigoTributacaoNacionalIss ?? "").trim();
    setIssExtras(parseIssCodes(cfg.codigosTributacaoIss).filter((c) => c !== padrao));
    setIssNovo("");
    setNbsEntries(
      Array.isArray(cfg.codigosNbsOptions)
        ? cfg.codigosNbsOptions
            .map((o) => ({
              codigo: normalizeNbsCode(String(o?.codigo ?? "")),
              descricao: String(o?.descricao ?? "").trim(),
            }))
            .filter((o) => o.codigo)
        : [],
    );
    setNbsNovoCodigo("");
    setNbsNovoDescricao("");
    setDescricaoPadrao(cfg.descricaoServicoPadrao ?? "");
    setCnpjPrestador(cfg.cnpjPrestador ?? "");
    setInscricaoMunicipal(cfg.inscricaoMunicipalPrestador ?? "");
    setCodigoMunicipio(cfg.codigoMunicipioEmissora ?? "");
    setCodigoSimples(cfg.codigoOpcaoSimplesNacional ?? "");
    setPercentualTributosSn(
      cfg.percentualTotalTributosSimplesNacional != null
        ? String(cfg.percentualTotalTributosSimplesNacional)
        : "",
    );
    setSerieDpsHomologacao(String(cfg.serieDpsHomologacao ?? 1));
    setProximoNumeroDpsHomologacao(String(cfg.proximoNumeroDpsHomologacao ?? 1));
    setSerieDpsProducao(String(cfg.serieDpsProducao ?? 1));
    setProximoNumeroDpsProducao(String(cfg.proximoNumeroDpsProducao ?? 1));
    setShowAdvanced(Boolean(cfg.inscricaoMunicipalPrestador));
    setWebhookUrl(cfg.webhookUrl ?? null);
    setWebhookConfigured(Boolean(cfg.webhookConfigured));
    setWebhookHookEnvironment(cfg.webhookHookEnvironment ?? null);
    setPublicApiUrlConfigured(Boolean(cfg.publicApiUrlConfigured));
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
        codigosTributacaoIss: issExtras.join(","),
        codigosNbs: nbsEntries,
        descricaoServicoPadrao: descricaoPadrao,
        cnpjPrestador,
        inscricaoMunicipalPrestador: inscricaoMunicipal,
        codigoMunicipioEmissora: codigoMunicipio,
        codigoOpcaoSimplesNacional: codigoSimples,
        percentualTotalTributosSimplesNacional:
          percentualTributosSn.trim() === ""
            ? null
            : Number(percentualTributosSn.replace(",", ".")),
        serieDpsHomologacao: Number.parseInt(serieDpsHomologacao, 10) || 1,
        proximoNumeroDpsHomologacao: Number.parseInt(proximoNumeroDpsHomologacao, 10) || 1,
        serieDpsProducao: Number.parseInt(serieDpsProducao, 10) || 1,
        proximoNumeroDpsProducao: Number.parseInt(proximoNumeroDpsProducao, 10) || 1,
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
      setOkMsg(
        typeof body?.webhookNote === "string" && body.webhookNote
          ? `Configuração Focus NFe salva. ${body.webhookNote}`
          : "Configuração Focus NFe salva.",
      );
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function syncWebhook() {
    setSyncingWebhook(true);
    setError(null);
    setOkMsg(null);
    try {
      const r = await apiFetch(`${API_PATH}/sync-webhook`, { method: "POST" });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(typeof body?.error === "string" ? body.error : "Falha ao registrar webhook.");
        return;
      }
      setOkMsg(
        body?.created
          ? "Webhook nfsen criado na Focus."
          : "Webhook nfsen já estava sincronizado na Focus.",
      );
      await load();
    } finally {
      setSyncingWebhook(false);
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
      const parts = [
        "Conexão OK com o token do ambiente ativo.",
        p?.empresaNome ? `Empresa Focus: ${p.empresaNome}` : null,
        p?.cnpjPrestador ? `CNPJ: ${p.cnpjPrestador}` : null,
        p?.codigoMunicipioEmissora ? `Município IBGE: ${p.codigoMunicipioEmissora}` : null,
        p?.inscricaoMunicipalPrestador ? `IM: ${p.inscricaoMunicipalPrestador}` : null,
        p?.empresasListSkipped
          ? "Obs.: a Focus não listou empresas com este token (normal para token de empresa) — usando CNPJ/município salvos no WPS One."
          : null,
      ].filter(Boolean);
      setFocusEmpresaInfo(parts.join(" "));
    } finally {
      setTesting(false);
    }
  }

  function addIssExtra() {
    const code = normalizeIssCode(issNovo);
    const padrao = normalizeIssCode(codigoTributacao);
    if (!code) return;
    if (code === padrao || issExtras.includes(code)) {
      setIssNovo("");
      return;
    }
    setIssExtras((prev) => [...prev, code]);
    setIssNovo("");
  }

  function addNbsEntry() {
    const codigo = normalizeNbsCode(nbsNovoCodigo);
    if (!codigo) return;
    if (nbsEntries.some((e) => e.codigo === codigo)) {
      setNbsNovoCodigo("");
      setNbsNovoDescricao("");
      return;
    }
    setNbsEntries((prev) => [
      ...prev,
      { codigo, descricao: nbsNovoDescricao.trim() },
    ]);
    setNbsNovoCodigo("");
    setNbsNovoDescricao("");
  }

  const ambienteLabel = environment === "PRODUCAO" ? "produção" : "homologação";
  const hasTokenAtivo = environment === "PRODUCAO" ? hasTokenProducao : hasTokenHomologacao;
  const tokenMaskedAtivo =
    environment === "PRODUCAO" ? tokenProducaoMasked : tokenHomologacaoMasked;

  return (
    <FinanceiroModuleGuard>
      <div className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]">
        <button
          type="button"
          onClick={() => navigateBack(router, `${basePath}/configuracoes/financeiro`)}
          aria-label="Voltar"
          title="Voltar"
          className="fixed right-14 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:opacity-90"
          style={{
            borderColor: "var(--border)",
            background: "rgba(0,0,0,0.06)",
            color: "var(--foreground)",
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <header className="flex-shrink-0 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-4">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-xl font-semibold text-[color:var(--foreground)] md:text-2xl">
              Focus NFe
            </h1>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)] md:text-sm">
              Configure a emissão de NFS-e Nacional no Contas a receber. Tokens ficam salvos no
              servidor e não são reexibidos no campo.
            </p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
          <div className="mx-auto max-w-4xl pb-28">
            {!canAccess ? (
              <p className="mt-6 text-sm text-[color:var(--muted-foreground)]">Sem permissão.</p>
            ) : loading ? (
              <div className="mt-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted-foreground)]" />
              </div>
            ) : (
              <div className="space-y-5">
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

                <FormModalSection
                  title="Conexão e ambiente"
                  description="Ative a integração, escolha o ambiente e informe o token correspondente."
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[color:var(--foreground)]">
                        Ativar emissão via Focus NFe
                      </span>
                      <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">
                        Disponibiliza a emissão de nota fiscal no Contas a receber.
                      </span>
                    </span>
                  </label>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={formModalLabelClass}>Ambiente ativo</label>
                      <select
                        className={formModalInputClass()}
                        value={environment}
                        onChange={(e) =>
                          setEnvironment(
                            e.target.value === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO",
                          )
                        }
                      >
                        <option value="HOMOLOGACAO">Homologação</option>
                        <option value="PRODUCAO">Produção</option>
                      </select>
                      <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                        Token e numeração DPS abaixo são só deste ambiente. Os dados do outro ficam
                        salvos.
                      </p>
                    </div>

                    <div>
                      <label className={formModalLabelClass}>
                        {environment === "PRODUCAO"
                          ? "Token de produção"
                          : "Token de homologação"}
                      </label>
                      {hasTokenAtivo && (
                        <p className="mb-1.5 text-xs text-emerald-700">
                          Token salvo ({tokenMaskedAtivo}). Campo vazio = manter o atual.
                        </p>
                      )}
                      {environment === "PRODUCAO" ? (
                        <input
                          type="password"
                          className={formModalInputClass()}
                          value={tokenProducao}
                          onChange={(e) => setTokenProducao(e.target.value)}
                          placeholder={
                            hasTokenProducao
                              ? "Cole um novo token só se quiser substituir"
                              : "Cole o token de produção"
                          }
                          autoComplete="new-password"
                        />
                      ) : (
                        <input
                          type="password"
                          className={formModalInputClass()}
                          value={tokenHomologacao}
                          onChange={(e) => setTokenHomologacao(e.target.value)}
                          placeholder={
                            hasTokenHomologacao
                              ? "Cole um novo token só se quiser substituir"
                              : "Cole o token de homologação"
                          }
                          autoComplete="new-password"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={testing || saving}
                      onClick={() => void testConnection()}
                      className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-medium text-[color:var(--foreground)] disabled:opacity-60"
                    >
                      {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                      Testar conexão / buscar empresa
                    </button>
                    <span className="text-xs text-[color:var(--muted-foreground)]">
                      Usa o token do ambiente de {ambienteLabel}.
                    </span>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Dados do prestador"
                  description="CNPJ e município usados na NFS-e. O token da empresa na Focus normalmente não lista /empresas — por isso esses dados ficam aqui."
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={formModalLabelClass}>CNPJ do prestador *</label>
                      <input
                        className={formModalInputClass()}
                        value={cnpjPrestador}
                        onChange={(e) => setCnpjPrestador(e.target.value)}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>
                        Código IBGE município emissor *
                      </label>
                      <input
                        className={formModalInputClass()}
                        value={codigoMunicipio}
                        onChange={(e) => setCodigoMunicipio(e.target.value)}
                        placeholder="Ex.: 3550308"
                      />
                    </div>
                    <div className={codigoSimples === "3" ? "" : "md:col-span-2"}>
                      <label className={formModalLabelClass}>Opção Simples Nacional *</label>
                      <select
                        className={formModalInputClass()}
                        value={codigoSimples}
                        onChange={(e) => setCodigoSimples(e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        <option value="1">1 — Não optante</option>
                        <option value="2">2 — MEI</option>
                        <option value="3">3 — ME/EPP (optante)</option>
                      </select>
                      <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                        Obrigatório no XML nacional (grupo regTrib). Use a situação real da empresa
                        perante o Simples.
                      </p>
                    </div>
                    {codigoSimples === "3" && (
                      <div>
                        <label className={formModalLabelClass}>
                          % aproximado de tributos do Simples (ME/EPP) *
                        </label>
                        <input
                          className={formModalInputClass()}
                          inputMode="decimal"
                          value={percentualTributosSn}
                          onChange={(e) => setPercentualTributosSn(e.target.value)}
                          placeholder="Ex.: 6"
                        />
                        <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                          Enviado na NFS-e como pTotTribSN. Informe a alíquota aproximada do Simples
                          da empresa (0 a 100).
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[color:var(--border)]/70 pt-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--primary)] hover:underline"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      {showAdvanced ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {showAdvanced
                        ? "Ocultar overrides manuais"
                        : "Overrides manuais (opcional)"}
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 max-w-md">
                        <label className={formModalLabelClass}>Inscrição municipal</label>
                        <input
                          className={formModalInputClass()}
                          value={inscricaoMunicipal}
                          onChange={(e) => setInscricaoMunicipal(e.target.value)}
                        />
                        <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                          Campo opcional adicional do prestador.
                        </p>
                      </div>
                    )}
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Códigos ISS"
                  description="Códigos de tributação disponíveis no modal de emissão da nota."
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={formModalLabelClass}>Código ISS padrão *</label>
                      <input
                        className={formModalInputClass()}
                        value={codigoTributacao}
                        onChange={(e) => setCodigoTributacao(normalizeIssCode(e.target.value))}
                        placeholder="Ex.: 010601"
                      />
                      <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                        Usado por padrão no modal de emissão
                        {issLabel(normalizeIssCode(codigoTributacao))
                          ? ` (${issLabel(normalizeIssCode(codigoTributacao))})`
                          : " (ex.: 010601 consultoria em informática)"}
                        .
                      </p>
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Outros códigos ISS</label>
                      <div className="flex gap-2">
                        <input
                          className={formModalInputClass()}
                          value={issNovo}
                          onChange={(e) => setIssNovo(normalizeIssCode(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addIssExtra();
                            }
                          }}
                          placeholder="Ex.: 170202"
                        />
                        <button
                          type="button"
                          onClick={addIssExtra}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--primary-foreground)]"
                          style={{ background: "var(--primary)" }}
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar
                        </button>
                      </div>
                      {issExtras.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {issExtras.map((code) => (
                            <li
                              key={code}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-xs"
                            >
                              <span>
                                {code}
                                {issLabel(code) ? ` — ${issLabel(code)}` : ""}
                              </span>
                              <button
                                type="button"
                                aria-label={`Remover ${code}`}
                                onClick={() =>
                                  setIssExtras((prev) => prev.filter((c) => c !== code))
                                }
                                className="rounded-full p-0.5 hover:bg-[color:var(--muted)]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
                        Aparecem junto com o padrão no select ao emitir a nota.
                      </p>
                    </div>
                  </div>
                </FormModalSection>

                <FormModalSection
                  title={
                    environment === "PRODUCAO"
                      ? "Numeração DPS — Produção"
                      : "Numeração DPS — Homologação"
                  }
                  description="Série e próximo número usados nas emissões deste ambiente."
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={formModalLabelClass}>Série</label>
                      <input
                        className={formModalInputClass()}
                        inputMode="numeric"
                        value={
                          environment === "PRODUCAO" ? serieDpsProducao : serieDpsHomologacao
                        }
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                          if (environment === "PRODUCAO") setSerieDpsProducao(v);
                          else setSerieDpsHomologacao(v);
                        }}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Próximo número</label>
                      <input
                        className={formModalInputClass()}
                        inputMode="numeric"
                        value={
                          environment === "PRODUCAO"
                            ? proximoNumeroDpsProducao
                            : proximoNumeroDpsHomologacao
                        }
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 15);
                          if (environment === "PRODUCAO") setProximoNumeroDpsProducao(v);
                          else setProximoNumeroDpsHomologacao(v);
                        }}
                        placeholder="1"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Série da API: 1 a 49999. O número incrementa a cada emissão neste ambiente.
                    {environment === "PRODUCAO"
                      ? " Use o último nDPS do Portal Nacional + 1."
                      : ""}
                  </p>
                </FormModalSection>

                <FormModalSection
                  title="Descrição do serviço"
                  description="Texto sugerido no modal de emissão. Se vazio, usa a descrição da conta a receber."
                >
                  <div>
                    <label className={formModalLabelClass}>
                      Descrição padrão do serviço (opcional)
                    </label>
                    <textarea
                      className={formModalInputClass()}
                      rows={3}
                      value={descricaoPadrao}
                      onChange={(e) => setDescricaoPadrao(e.target.value)}
                      placeholder="Se vazio, usa a descrição da conta a receber"
                    />
                  </div>
                </FormModalSection>

                <FormModalSection
                  title="Códigos NBS (opcional)"
                  description="Cadastre os NBS disponíveis na emissão da NFSe. Ainda não é obrigatório. Use 9 dígitos (sem pontos), ex.: 115011000."
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                    <input
                      className={formModalInputClass()}
                      value={nbsNovoCodigo}
                      onChange={(e) => setNbsNovoCodigo(normalizeNbsCode(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addNbsEntry();
                        }
                      }}
                      placeholder="Código NBS"
                    />
                    <input
                      className={formModalInputClass()}
                      value={nbsNovoDescricao}
                      onChange={(e) => setNbsNovoDescricao(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addNbsEntry();
                        }
                      }}
                      placeholder="Descrição (opcional)"
                    />
                    <button
                      type="button"
                      onClick={addNbsEntry}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)]"
                      style={{ background: "var(--primary)" }}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </button>
                  </div>
                  {nbsEntries.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {nbsEntries.map((entry) => (
                        <li
                          key={entry.codigo}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-xs"
                        >
                          <span className="truncate">
                            {entry.codigo}
                            {entry.descricao ? ` — ${entry.descricao}` : ""}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remover NBS ${entry.codigo}`}
                            onClick={() =>
                              setNbsEntries((prev) =>
                                prev.filter((e) => e.codigo !== entry.codigo),
                              )
                            }
                            className="rounded-full p-0.5 hover:bg-[color:var(--muted)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      Nenhum NBS cadastrado ainda.
                    </p>
                  )}
                </FormModalSection>

                <FormModalSection
                  title="Webhook (NFSe Nacional)"
                  description="A Focus avisa o WPS quando a nota é autorizada, rejeitada ou cancelada — sem precisar consultar o status. Esta URL é o backend do WPS (não a API da Focus)."
                >
                  {!publicApiUrlConfigured && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Configure a variável <code>PUBLIC_API_URL</code> no backend (URL pública da
                      API) para registrar o gatilho.
                    </p>
                  )}
                  {webhookUrl && (
                    <div className="space-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
                      <p className="text-xs break-all">
                        <span className="text-[color:var(--muted-foreground)]">Callback WPS:</span>{" "}
                        {webhookUrl}
                      </p>
                      {/-qa\.onrender\.com/i.test(webhookUrl) ? (
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Esta URL é o backend de <strong>QA</strong> (
                          <code>wps-one-backend-qa</code>
                          ). Em produção o Render deve ter{" "}
                          <code>
                            PUBLIC_API_URL=https://wps-one-backend-production.onrender.com
                          </code>
                          .
                        </p>
                      ) : /-production\.onrender\.com/i.test(webhookUrl) ? (
                        <p className="text-xs text-emerald-800 dark:text-emerald-200">
                          Callback no backend de <strong>produção</strong> WPS (
                          <code>wps-one-backend-production</code>
                          ). Homologação da Focus é outro ambiente (
                          <code>homologacao.focusnfe.com.br</code>
                          ), escolhido em “Ambiente ativo” acima.
                        </p>
                      ) : null}
                    </div>
                  )}
                  <p className="text-sm">
                    Status:{" "}
                    {webhookConfigured ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                        registrado na Focus
                      </span>
                    ) : (
                      <span className="text-[color:var(--muted-foreground)]">
                        ainda não registrado
                      </span>
                    )}
                    {webhookHookEnvironment ? (
                      <span className="text-[color:var(--muted-foreground)]">
                        {" "}
                        · gatilho na Focus{" "}
                        {webhookHookEnvironment === "PRODUCAO" ? "produção" : "homologação"}
                      </span>
                    ) : null}
                  </p>
                  {webhookConfigured &&
                  webhookHookEnvironment &&
                  webhookHookEnvironment !== environment ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      O gatilho ainda está na Focus{" "}
                      {webhookHookEnvironment === "PRODUCAO" ? "produção" : "homologação"}, mas o
                      ambiente ativo é {environment === "PRODUCAO" ? "produção" : "homologação"}.
                      Salve e clique em sincronizar para registrar no ambiente certo.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={syncingWebhook || saving || !publicApiUrlConfigured}
                    onClick={() => void syncWebhook()}
                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
                  >
                    {syncingWebhook && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sincronizar webhook na Focus
                  </button>
                </FormModalSection>

                <div className="sticky bottom-0 z-10 -mx-4 border-t border-[color:var(--border)] bg-[color:var(--background)]/95 px-4 py-3 backdrop-blur md:-mx-0 md:rounded-xl md:border md:px-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      Salve para aplicar alterações no Contas a receber.
                    </p>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void save()}
                      className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar configuração
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </FinanceiroModuleGuard>
  );
}
