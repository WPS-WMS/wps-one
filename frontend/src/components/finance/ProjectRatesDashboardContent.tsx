"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda } from "@/lib/brFormatters";
import { formatFinanceProjectLabel } from "@/lib/financeProjectSelect";
import { useAuth } from "@/contexts/AuthContext";
import { canFinanceFeature } from "@/lib/financeiroEnv";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import {
  FinanceCollapsibleFilters,
  FinancePageHeader,
  financeListPageShellClass,
  financeListTableWrapClass,
  financeListTheadClass,
  financeListTheadStyle,
  financeSecondaryBtnClass,
} from "@/components/finance/FinancePageHeader";

type SkillRateCell = {
  skillProfileId: string;
  skillName: string;
  hourlyRate: number;
};

type RateRow = {
  revenueId: string;
  revenueTitle: string | null;
  projectId: string;
  projectName: string;
  arquivado?: boolean;
  clientId: string;
  clientName: string;
  tipoProjeto?: string | null;
  contractProposal: string | null;
  paymentTermDays: number | null;
  readjustmentMonth: number | null;
  clientHourlyRate: number | null;
  status: string;
  skillRates: SkillRateCell[];
  readjustmentHistory?: Array<{
    id: string;
    year: number;
    month: number;
    periodLabel: string;
    clientHourlyRate: number | null;
    skillRates: Array<{ skillName: string; hourlyRate: number }>;
  }>;
};

const TIPO_OPTIONS = [
  { value: "", label: "AMS e T&M" },
  { value: "AMS", label: "AMS" },
  { value: "TIME_MATERIAL", label: "Time & Material" },
];

const MONTH_LABELS = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const TABLE_COL_SPAN = 9;

function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatarMoeda(value);
}

function formatPaymentDays(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days <= 0) return "—";
  return `${days} dia${days === 1 ? "" : "s"}`;
}

function formatReadjustmentMonth(month: number | null | undefined): string {
  if (month == null || month < 1 || month > 12) return "—";
  return MONTH_LABELS[month] ?? "—";
}

function tipoLabel(tipo: string | null | undefined): string {
  if (tipo === "AMS") return "AMS";
  if (tipo === "TIME_MATERIAL") return "T&M";
  return tipo?.trim() || "—";
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 100) / 100;
}

function sortedSkillRates(rates: SkillRateCell[]): SkillRateCell[] {
  return [...rates].sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR"));
}

function MetricCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-[color:var(--surface)] px-4 py-3.5"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-[0.12]"
        style={{
          background: accent
            ? "radial-gradient(circle, var(--wps-purple-600), transparent 70%)"
            : "radial-gradient(circle, #0f766e, transparent 70%)",
        }}
        aria-hidden
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={`mt-1.5 text-lg font-semibold tabular-nums tracking-tight ${
          accent ? "text-[color:var(--primary)]" : "text-[color:var(--foreground)]"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  const isAms = tipo === "AMS";
  const isTm = tipo === "TIME_MATERIAL";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
        isAms
          ? "bg-teal-50 text-teal-800"
          : isTm
            ? "bg-sky-50 text-sky-800"
            : "bg-black/5 text-[color:var(--muted-foreground)]"
      }`}
    >
      {tipoLabel(tipo)}
    </span>
  );
}

function SkillRatesDetail({
  rates,
  dense = false,
}: {
  rates: SkillRateCell[];
  /** Lista em coluna única — melhor em cards estreitos. */
  dense?: boolean;
}) {
  const sorted = sortedSkillRates(rates);
  if (sorted.length === 0) {
    return (
      <p className="text-xs text-[color:var(--muted-foreground)]">
        Nenhuma taxa por skill cadastrada nesta receita.
      </p>
    );
  }
  return (
    <div className={dense ? "grid gap-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
      {sorted.map((rate) => (
        <div
          key={rate.skillProfileId}
          className="flex min-w-0 items-start justify-between gap-3 rounded-xl border bg-[color:var(--background)] px-3 py-2"
          style={{ borderColor: "var(--border)" }}
          title={`${rate.skillName}: ${formatRate(rate.hourlyRate)}`}
        >
          <span className="min-w-0 flex-1 break-words text-xs font-medium leading-snug text-[color:var(--foreground)]">
            {rate.skillName}
          </span>
          <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-[color:var(--primary)]">
            {formatRate(rate.hourlyRate)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RateProjectCard({
  row,
  onOpen,
}: {
  row: RateRow;
  onOpen: () => void;
}) {
  return (
    <article
      className="flex flex-col rounded-2xl border bg-[color:var(--surface)] p-4 transition hover:border-[color:var(--primary)]/35 hover:shadow-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
            {row.clientName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--muted-foreground)]">
            {formatFinanceProjectLabel(row.projectName, row.arquivado)}
          </p>
          <p className="mt-1 truncate text-[11px] text-[color:var(--muted-foreground)]">
            {row.contractProposal?.trim() || "Sem proposta"}
          </p>
        </div>
        <TipoBadge tipo={row.tipoProjeto} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Tx. projeto
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-[color:var(--primary)]">
            {formatRate(row.clientHourlyRate)}
          </p>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Cond. pag.
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">
            {formatPaymentDays(row.paymentTermDays)}
          </p>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Reajuste
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {formatReadjustmentMonth(row.readjustmentMonth)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
          Taxas por skill
        </p>
        <SkillRatesDetail rates={row.skillRates} dense />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className={`${financeSecondaryBtnClass} mt-4 w-full justify-center`}
        style={{ borderColor: "var(--border)" }}
      >
        Abrir projeto
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

export function ProjectRatesDashboardContent() {
  const { can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () => canFinanceFeature(can, "financeiro.taxasPorProjeto"),
    [can],
  );

  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTipo, setFilterTipo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiFetch("/api/project-revenues/rates-overview");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Erro ao carregar taxas.");
      setLoading(false);
      return;
    }
    setRows(Array.isArray(body?.rows) ? body.rows : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.clientId && row.clientName) map.set(row.clientId, row.clientName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterTipo && String(row.tipoProjeto ?? "").toUpperCase() !== filterTipo) return false;
      if (filterClientId && row.clientId !== filterClientId) return false;
      if (q) {
        const hay = [
          row.clientName,
          row.projectName,
          row.contractProposal ?? "",
          row.revenueTitle ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterTipo, filterClientId, filterSearch]);

  const averages = useMemo(() => {
    const projectRates = filtered
      .map((row) => row.clientHourlyRate)
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    return {
      projectAvg: average(projectRates),
      projectCount: projectRates.length,
    };
  }, [filtered]);

  const activeFilterCount =
    (filterTipo ? 1 : 0) + (filterClientId ? 1 : 0) + (filterSearch.trim() ? 1 : 0);

  function clearFilters() {
    setFilterTipo("");
    setFilterClientId("");
    setFilterSearch("");
  }

  function openProject(row: RateRow) {
    router.push(`${basePath}/financeiro/projetos/${row.projectId}`);
  }

  function toggleExpanded(revenueId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(revenueId)) next.delete(revenueId);
      else next.add(revenueId);
      return next;
    });
  }

  if (!permissionsReady) {
    return (
      <div
        className={`${financeListPageShellClass} flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className={financeListPageShellClass}>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Você não tem permissão para ver Taxas por projeto.
        </p>
      </div>
    );
  }

  return (
    <div className={financeListPageShellClass}>
      <FinancePageHeader
        title="Taxas por projeto"
        subtitle="Visão consolidada das taxas hora, condições de pagamento e reajuste das receitas variáveis AMS e T&M."
        chip="Somente leitura"
        tone="default"
        actions={
          <div
            className="inline-flex rounded-lg border p-0.5"
            style={{ borderColor: "var(--border)" }}
            role="group"
            aria-label="Formato de visualização"
          >
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                viewMode === "list"
                  ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
                  : "text-[color:var(--muted-foreground)] hover:bg-black/5"
              }`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                viewMode === "cards"
                  ? "bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
                  : "text-[color:var(--muted-foreground)] hover:bg-black/5"
              }`}
              onClick={() => setViewMode("cards")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
          </div>
        }
      />

      <FinanceCollapsibleFilters
        activeCount={activeFilterCount}
        onClear={clearFilters}
        defaultOpen
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={formModalLabelClass} htmlFor="rates-filter-tipo">
              Tipo de projeto
            </label>
            <PopoverSelect
              id="rates-filter-tipo"
              value={filterTipo}
              onChange={setFilterTipo}
              options={TIPO_OPTIONS}
            />
          </div>
          <div>
            <label className={formModalLabelClass} htmlFor="rates-filter-client">
              Cliente
            </label>
            <PopoverSelect
              id="rates-filter-client"
              value={filterClientId}
              onChange={setFilterClientId}
              placeholder="Todos"
              options={[
                { value: "", label: "Todos" },
                ...clientOptions.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={formModalLabelClass} htmlFor="rates-filter-search">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
              <input
                id="rates-filter-search"
                className={`${formModalInputClass()} pl-8`}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Cliente, projeto ou proposta…"
              />
            </div>
          </div>
        </div>
      </FinanceCollapsibleFilters>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Média taxa do projeto"
          value={formatRate(averages.projectAvg)}
          hint={
            averages.projectCount > 0
              ? `${averages.projectCount} receita${averages.projectCount === 1 ? "" : "s"} com taxa geral`
              : "Sem taxa geral no filtro"
          }
          accent
        />
        <MetricCard
          label="Receitas no filtro"
          value={String(filtered.length)}
          hint={`${rows.length} no total · AMS / T&M`}
        />
      </div>

      {viewMode === "cards" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Cards de taxas</h2>
              <p className="text-[11px] text-[color:var(--muted-foreground)]">
                Cada projeto em um card, com todas as skills listadas.
              </p>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted-foreground)]" />
            ) : null}
          </div>

          {loading && filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[color:var(--muted-foreground)]">
              Carregando taxas…
            </p>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-12 text-center"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="text-sm font-medium">Nenhuma taxa encontrada</p>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Cadastre taxa geral ou por skill nas receitas variáveis de projetos AMS/T&M.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((row) => (
                <RateProjectCard key={row.revenueId} row={row} onOpen={() => openProject(row)} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section
          className="overflow-hidden rounded-2xl border bg-[color:var(--surface)]"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Lista de taxas</h2>
              <p className="text-[11px] text-[color:var(--muted-foreground)]">
                Clique na seta para ver as taxas por skill. Use o ícone à direita para abrir o
                projeto.
              </p>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted-foreground)]" />
            ) : null}
          </div>

          <div className={financeListTableWrapClass} style={{ border: "none", borderRadius: 0 }}>
            <table className="w-full table-fixed text-sm">
              <thead className={financeListTheadClass} style={financeListTheadStyle}>
                <tr>
                  <th className="w-10 px-2 py-2.5" />
                  <th className="px-3 py-2.5 text-left">Cliente</th>
                  <th className="px-3 py-2.5 text-left">Projeto</th>
                  <th className="hidden px-3 py-2.5 text-left md:table-cell">Proposta</th>
                  <th className="px-3 py-2.5 text-left">Tipo</th>
                  <th className="hidden px-3 py-2.5 text-left lg:table-cell">Reajuste</th>
                  <th className="px-3 py-2.5 text-right">Cond. pag.</th>
                  <th className="px-3 py-2.5 text-right">Tx. projeto</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={TABLE_COL_SPAN}
                      className="px-3 py-10 text-center text-sm text-[color:var(--muted-foreground)]"
                    >
                      Carregando taxas…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COL_SPAN} className="px-3 py-12 text-center">
                      <p className="text-sm font-medium text-[color:var(--foreground)]">
                        Nenhuma taxa encontrada
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                        Cadastre taxa geral ou por skill nas receitas variáveis de projetos AMS/T&M.
                      </p>
                    </td>
                  </tr>
                ) : (
                    filtered.map((row) => {
                    const expanded = expandedIds.has(row.revenueId);
                    const skillCount = row.skillRates.length;
                    return (
                      <Fragment key={row.revenueId}>
                        <tr
                          className="border-t transition hover:bg-[color:var(--primary)]/[0.04]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted-foreground)] hover:bg-black/5 hover:text-[color:var(--foreground)]"
                              aria-expanded={expanded}
                              aria-label={
                                expanded ? "Ocultar taxas por skill" : "Mostrar taxas por skill"
                              }
                              onClick={() => toggleExpanded(row.revenueId)}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          </td>
                          <td className="truncate px-3 py-2.5 font-medium">{row.clientName}</td>
                          <td className="truncate px-3 py-2.5">
                            {formatFinanceProjectLabel(row.projectName, row.arquivado)}
                            {skillCount > 0 ? (
                              <span className="mt-0.5 block text-[10px] text-[color:var(--muted-foreground)] md:hidden">
                                {skillCount} skill{skillCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </td>
                          <td className="hidden truncate px-3 py-2.5 text-[color:var(--muted-foreground)] md:table-cell">
                            {row.contractProposal?.trim() || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <TipoBadge tipo={row.tipoProjeto} />
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2.5 text-[color:var(--muted-foreground)] lg:table-cell">
                            <span className="inline-flex flex-col gap-0.5">
                              <span>{formatReadjustmentMonth(row.readjustmentMonth)}</span>
                              {(row.readjustmentHistory?.length ?? 0) > 1 ? (
                                <span className="text-[10px] text-[color:var(--primary)]">
                                  {row.readjustmentHistory!.length} no histórico
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {formatPaymentDays(row.paymentTermDays)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-[color:var(--primary)]">
                            {formatRate(row.clientHourlyRate)}
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted-foreground)] hover:bg-black/5 hover:text-[color:var(--foreground)]"
                              aria-label="Abrir projeto"
                              onClick={() => openProject(row)}
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr
                            className="border-t bg-black/[0.02]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <td colSpan={TABLE_COL_SPAN} className="px-4 py-3 md:px-6">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                                  Taxas por skill
                                  {skillCount > 0 ? ` · ${skillCount}` : ""}
                                </p>
                                <p className="text-[11px] text-[color:var(--muted-foreground)] lg:hidden">
                                  Reajuste: {formatReadjustmentMonth(row.readjustmentMonth)}
                                </p>
                              </div>
                              <SkillRatesDetail rates={row.skillRates} />
                              {(row.readjustmentHistory?.length ?? 0) > 0 ? (
                                <div className="mt-4">
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                                    Histórico de reajustes
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {row.readjustmentHistory!.map((adj) => (
                                      <div
                                        key={adj.id}
                                        className="min-w-[9.5rem] rounded-xl border bg-[color:var(--surface)] px-3 py-2"
                                        style={{ borderColor: "var(--border)" }}
                                      >
                                        <p className="text-[11px] font-semibold text-[color:var(--foreground)]">
                                          {adj.periodLabel}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--primary)]">
                                          {adj.clientHourlyRate != null
                                            ? formatRate(adj.clientHourlyRate)
                                            : adj.skillRates[0]
                                              ? formatRate(adj.skillRates[0].hourlyRate)
                                              : "—"}
                                        </p>
                                        {adj.clientHourlyRate == null && adj.skillRates.length > 1 ? (
                                          <p className="mt-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                                            {adj.skillRates.length} skills
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
