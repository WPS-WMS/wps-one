"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { navigateBack } from "@/lib/navigateBack";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";

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

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm w-full";

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
          <div className="mx-auto max-w-3xl">
            <h1 className="text-xl font-semibold text-[color:var(--foreground)] md:text-2xl">
              Focus NFe
            </h1>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)] md:text-sm">
              Informe tokens, CNPJ/município do prestador e códigos ISS. O token fica salvo no
              servidor e não é reexibido no campo (por segurança).
            </p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
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
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Token e numeração da DPS abaixo são só deste ambiente. Os dados do outro ficam
                salvos.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                {environment === "PRODUCAO" ? "Token de produção" : "Token de homologação"}
              </label>
              {environment === "PRODUCAO" ? (
                <>
                  {hasTokenProducao && (
                    <p className="mb-1 text-xs text-emerald-700">
                      Token salvo ({tokenProducaoMasked}). Campo vazio = manter o atual.
                    </p>
                  )}
                  <input
                    type="password"
                    className={inputClass}
                    value={tokenProducao}
                    onChange={(e) => setTokenProducao(e.target.value)}
                    placeholder={
                      hasTokenProducao
                        ? "Cole um novo token só se quiser substituir"
                        : "Cole o token de produção"
                    }
                    autoComplete="new-password"
                  />
                </>
              ) : (
                <>
                  {hasTokenHomologacao && (
                    <p className="mb-1 text-xs text-emerald-700">
                      Token salvo ({tokenHomologacaoMasked}). Campo vazio = manter o atual.
                    </p>
                  )}
                  <input
                    type="password"
                    className={inputClass}
                    value={tokenHomologacao}
                    onChange={(e) => setTokenHomologacao(e.target.value)}
                    placeholder={
                      hasTokenHomologacao
                        ? "Cole um novo token só se quiser substituir"
                        : "Cole o token de homologação"
                    }
                    autoComplete="new-password"
                  />
                </>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  CNPJ do prestador *
                </label>
                <input
                  className={inputClass}
                  value={cnpjPrestador}
                  onChange={(e) => setCnpjPrestador(e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  Código IBGE município emissor *
                </label>
                <input
                  className={inputClass}
                  value={codigoMunicipio}
                  onChange={(e) => setCodigoMunicipio(e.target.value)}
                  placeholder="Ex.: 3550308"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Opção Simples Nacional *
              </label>
              <select
                className={inputClass}
                value={codigoSimples}
                onChange={(e) => setCodigoSimples(e.target.value)}
              >
                <option value="">Selecione…</option>
                <option value="1">1 — Não optante</option>
                <option value="2">2 — MEI</option>
                <option value="3">3 — ME/EPP (optante)</option>
              </select>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Obrigatório no XML nacional (grupo regTrib). Use a situação real da empresa perante o
                Simples.
              </p>
            </div>
            {codigoSimples === "3" && (
              <div>
                <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                  % aproximado de tributos do Simples (ME/EPP) *
                </label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={percentualTributosSn}
                  onChange={(e) => setPercentualTributosSn(e.target.value)}
                  placeholder="Ex.: 6"
                />
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Enviado na NFS-e como pTotTribSN. Para ME/EPP não se usa o indicador de total de
                  tributos. Informe a alíquota aproximada do Simples da empresa (0 a 100).
                </p>
              </div>
            )}
            <p className="text-xs text-[color:var(--muted-foreground)]">
              O token da empresa na Focus normalmente não lista `/empresas` (HTTP 404). Por isso CNPJ e
              município precisam estar aqui no WPS One.
            </p>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Código ISS padrão *
              </label>
              <input
                className={inputClass}
                value={codigoTributacao}
                onChange={(e) => setCodigoTributacao(normalizeIssCode(e.target.value))}
                placeholder="Ex.: 010601"
              />
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Usado por padrão no modal de emissão
                {issLabel(normalizeIssCode(codigoTributacao))
                  ? ` (${issLabel(normalizeIssCode(codigoTributacao))})`
                  : " (ex.: 010601 consultoria em informática)"}
                .
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                Outros códigos ISS na emissão
              </label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
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
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-[color:var(--primary-foreground)]"
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
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span>
                        {code}
                        {issLabel(code) ? ` — ${issLabel(code)}` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover ${code}`}
                        onClick={() => setIssExtras((prev) => prev.filter((c) => c !== code))}
                        className="rounded-full p-0.5 hover:bg-[color:var(--muted)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Aparecem junto com o padrão no select ao emitir a nota.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-medium text-[color:var(--foreground)]">
                {environment === "PRODUCAO" ? "DPS — Produção" : "DPS — Homologação"}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Série
                  </label>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={environment === "PRODUCAO" ? serieDpsProducao : serieDpsHomologacao}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                      if (environment === "PRODUCAO") setSerieDpsProducao(v);
                      else setSerieDpsHomologacao(v);
                    }}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--muted-foreground)]">
                    Próximo número
                  </label>
                  <input
                    className={inputClass}
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
                  Campos opcionais adicionais.
                </p>
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
              </div>
            )}

            <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Webhook (NFSe Nacional)</h3>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                A Focus avisa o WPS quando a nota é autorizada, rejeitada ou cancelada — sem precisar
                ficar consultando o status.
              </p>
              {!publicApiUrlConfigured && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Configure a variável <code>PUBLIC_API_URL</code> no backend (URL pública da API) para
                  registrar o gatilho.
                </p>
              )}
              {webhookUrl && (
                <p className="text-xs break-all">
                  <span className="text-[color:var(--muted-foreground)]">URL:</span> {webhookUrl}
                </p>
              )}
              <p className="text-xs">
                Status:{" "}
                {webhookConfigured ? (
                  <span className="text-emerald-700 dark:text-emerald-300">registrado na Focus</span>
                ) : (
                  <span className="text-[color:var(--muted-foreground)]">ainda não registrado</span>
                )}
              </p>
              <button
                type="button"
                disabled={syncingWebhook || saving || !publicApiUrlConfigured}
                onClick={() => void syncWebhook()}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {syncingWebhook && <Loader2 className="h-4 w-4 animate-spin" />}
                Sincronizar webhook na Focus
              </button>
            </div>

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
        </main>
      </div>
    </FinanceiroModuleGuard>
  );
}
