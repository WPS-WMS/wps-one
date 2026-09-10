"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  History,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarData, formatarMoeda, formatarMoedaInput, parseMoedaInputToString } from "@/lib/brFormatters";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";

export type ReadjustmentRow = {
  id: string;
  year: number;
  month: number;
  monthLabel: string;
  periodLabel: string;
  clientHourlyRate: number | null;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  skillRates: Array<{
    id: string;
    skillProfileId: string;
    skillName: string;
    hourlyRate: number;
  }>;
  mode: "PROJECT" | "SKILL";
};

type AuditRow = {
  id: string;
  action: string;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

type SkillOption = { id: string; name: string };

const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

type Props = {
  open: boolean;
  revenueId: string;
  revenueLabel?: string;
  /** Prefill do formulário de novo reajuste. */
  defaults?: {
    month?: string;
    year?: number;
    clientHourlyRate?: string;
    skillRates?: Array<{ skillProfileId: string; hourlyRate: string }>;
  };
  skillProfiles: SkillOption[];
  allowEdit?: boolean;
  initialTab?: "reajustes" | "alteracoes";
  onClose: () => void;
};

export function ProjectRevenueHistoryModal({
  open,
  revenueId,
  revenueLabel,
  defaults,
  skillProfiles,
  allowEdit = true,
  initialTab = "reajustes",
  onClose,
}: Props) {
  const [tab, setTab] = useState<"reajustes" | "alteracoes">(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readjustments, setReadjustments] = useState<ReadjustmentRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formYear, setFormYear] = useState(String(new Date().getFullYear()));
  const [formMonth, setFormMonth] = useState("");
  const [formProjectRate, setFormProjectRate] = useState("");
  const [formSkillRates, setFormSkillRates] = useState<
    Array<{ skillProfileId: string; hourlyRate: string }>
  >([{ skillProfileId: "", hourlyRate: "" }]);
  const [formNotes, setFormNotes] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => {
      const y = String(current - i + 1);
      return { value: y, label: y };
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [adjRes, histRes] = await Promise.all([
      apiFetch(`/api/project-revenues/${revenueId}/readjustments`),
      apiFetch(`/api/project-revenues/${revenueId}/history`),
    ]);
    const adjBody = await adjRes.json().catch(() => null);
    const histBody = await histRes.json().catch(() => null);
    if (!adjRes.ok) {
      setError(typeof adjBody?.error === "string" ? adjBody.error : "Erro ao carregar reajustes.");
      setReadjustments([]);
    } else {
      setReadjustments(Array.isArray(adjBody?.rows) ? adjBody.rows : []);
    }
    if (histRes.ok && Array.isArray(histBody)) {
      setAuditRows(histBody);
    } else {
      setAuditRows([]);
    }
    setLoading(false);
  }, [revenueId]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setShowForm(false);
    setFormYear(String(defaults?.year ?? new Date().getFullYear()));
    setFormMonth(defaults?.month ?? "");
    setFormProjectRate(defaults?.clientHourlyRate ?? "");
    setFormSkillRates(
      defaults?.skillRates?.length
        ? defaults.skillRates
        : [{ skillProfileId: "", hourlyRate: "" }],
    );
    setFormNotes("");
    void load();
  }, [open, initialTab, defaults, load]);

  const projectRateLocked =
    formProjectRate !== "" &&
    Number.isFinite(Number(formProjectRate)) &&
    Number(formProjectRate) > 0;

  async function saveReadjustment() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      year: Number(formYear),
      month: Number(formMonth),
      notes: formNotes.trim() || null,
    };
    if (projectRateLocked) {
      payload.clientHourlyRate = Number(formProjectRate);
      payload.skillRates = formSkillRates
        .filter((r) => r.skillProfileId)
        .map((r, index) => ({
          skillProfileId: r.skillProfileId,
          hourlyRate: Number(formProjectRate),
          sortOrder: index,
        }));
    } else {
      payload.clientHourlyRate = null;
      payload.skillRates = formSkillRates
        .filter((r) => r.skillProfileId && r.hourlyRate !== "")
        .map((r, index) => ({
          skillProfileId: r.skillProfileId,
          hourlyRate: Number(r.hourlyRate),
          sortOrder: index,
        }));
    }
    const r = await apiFetch(`/api/project-revenues/${revenueId}/readjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar reajuste.");
      return;
    }
    setReadjustments(Array.isArray(body?.rows) ? body.rows : []);
    setShowForm(false);
  }

  async function removeReadjustment(id: string) {
    if (!window.confirm("Remover este registro de reajuste?")) return;
    setDeletingId(id);
    setError(null);
    const r = await apiFetch(`/api/project-revenues/${revenueId}/readjustments/${id}`, {
      method: "DELETE",
    });
    const body = await r.json().catch(() => null);
    setDeletingId(null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao remover.");
      return;
    }
    setReadjustments(Array.isArray(body?.rows) ? body.rows : []);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-[color:var(--surface)] shadow-2xl"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="relative overflow-hidden border-b px-5 py-4"
          style={{
            borderColor: "var(--border)",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, transparent), transparent 70%)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--primary)]">
                <CalendarClock className="h-3.5 w-3.5" />
                Histórico
              </div>
              <h3 className="mt-2 text-base font-semibold text-[color:var(--foreground)]">
                Reajustes e alterações
              </h3>
              {revenueLabel && (
                <p className="mt-0.5 truncate text-xs text-[color:var(--muted-foreground)]">
                  {revenueLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border p-1.5 text-[color:var(--muted-foreground)] hover:bg-black/5"
              style={{ borderColor: "var(--border)" }}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex gap-1 rounded-xl bg-black/[0.04] p-1">
            {(
              [
                { id: "reajustes", label: "Reajustes", icon: TrendingUp },
                { id: "alteracoes", label: "Alterações", icon: History },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "bg-[color:var(--surface)] text-[color:var(--primary)] shadow-sm"
                      : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  {item.id === "reajustes" && readjustments.length > 0 && (
                    <span className="rounded-full bg-[color:var(--primary)]/15 px-1.5 py-0.5 text-[10px] tabular-nums">
                      {readjustments.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-[color:var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando histórico…
            </div>
          ) : tab === "reajustes" ? (
            <div className="space-y-4">
              {allowEdit && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Cada registro guarda o mês e as taxas (projeto ou skills) daquele reajuste.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {showForm ? "Cancelar" : "Registrar reajuste"}
                  </button>
                </div>
              )}

              {showForm && allowEdit && (
                <div
                  className="space-y-3 rounded-2xl border p-4"
                  style={{
                    borderColor: "color-mix(in srgb, var(--primary) 25%, var(--border))",
                    background: "color-mix(in srgb, var(--primary) 5%, var(--surface))",
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--primary)]">
                    Novo reajuste
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={formModalLabelClass}>Ano</label>
                      <PopoverSelect
                        id="readj-year"
                        value={formYear}
                        onChange={setFormYear}
                        options={yearOptions}
                      />
                    </div>
                    <div>
                      <label className={formModalLabelClass}>Mês</label>
                      <PopoverSelect
                        id="readj-month"
                        value={formMonth}
                        onChange={setFormMonth}
                        placeholder="Selecione…"
                        options={[{ value: "", label: "Selecione…" }, ...MONTH_OPTIONS]}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Taxa hora do projeto</label>
                    <input
                      className={formModalInputClass()}
                      value={formatarMoedaInput(formProjectRate)}
                      placeholder="R$ 0,00 — deixe vazio para usar skills"
                      onChange={(e) => {
                        const next = parseMoedaInputToString(e.target.value);
                        setFormProjectRate(next);
                        if (next && Number(next) > 0) {
                          setFormSkillRates((rows) =>
                            rows.map((row) => ({ ...row, hourlyRate: next })),
                          );
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className={formModalLabelClass}>Taxas por skill</p>
                    {formSkillRates.map((row, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <PopoverSelect
                            id={`readj-skill-${index}`}
                            value={row.skillProfileId}
                            onChange={(value) =>
                              setFormSkillRates((rows) =>
                                rows.map((r, i) =>
                                  i === index ? { ...r, skillProfileId: value } : r,
                                ),
                              )
                            }
                            placeholder="Perfil…"
                            options={[
                              { value: "", label: "Perfil…" },
                              ...skillProfiles.map((s) => ({ value: s.id, label: s.name })),
                            ]}
                          />
                        </div>
                        <input
                          className={`${formModalInputClass()} w-32 shrink-0`}
                          disabled={projectRateLocked}
                          value={formatarMoedaInput(row.hourlyRate)}
                          onChange={(e) =>
                            setFormSkillRates((rows) =>
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, hourlyRate: parseMoedaInputToString(e.target.value) }
                                  : r,
                              ),
                            )
                          }
                          placeholder="R$ 0,00"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs font-medium text-[color:var(--primary)]"
                      onClick={() =>
                        setFormSkillRates((rows) => [
                          ...rows,
                          {
                            skillProfileId: "",
                            hourlyRate: projectRateLocked ? formProjectRate : "",
                          },
                        ])
                      }
                    >
                      + Adicionar skill
                    </button>
                  </div>
                  <div>
                    <label className={formModalLabelClass}>Observação (opcional)</label>
                    <input
                      className={formModalInputClass()}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ex.: Reajuste anual do contrato"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={saving || !formMonth}
                      onClick={() => void saveReadjustment()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--primary)] px-3.5 py-2 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Salvar reajuste
                    </button>
                  </div>
                </div>
              )}

              {readjustments.length === 0 ? (
                <div
                  className="rounded-2xl border border-dashed px-5 py-10 text-center"
                  style={{ borderColor: "var(--border)" }}
                >
                  <CalendarClock className="mx-auto h-8 w-8 text-[color:var(--muted-foreground)] opacity-50" />
                  <p className="mt-3 text-sm font-medium">Nenhum reajuste registrado</p>
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    Ao salvar a receita com mês e taxas, o reajuste entra automaticamente aqui.
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-0 border-l-2 border-[color:var(--primary)]/20 pl-5">
                  {readjustments.map((row, index) => (
                    <li key={row.id} className="relative pb-5 last:pb-0">
                      <span
                        className="absolute -left-[1.55rem] top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[color:var(--primary)] bg-[color:var(--surface)] text-[9px] font-bold text-[color:var(--primary)]"
                      >
                        {index + 1}
                      </span>
                      <article
                        className="rounded-2xl border bg-[color:var(--background)]/60 p-3.5 shadow-sm"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                              {row.periodLabel}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)]">
                              {row.createdBy?.name ?? "Sistema"}
                              {row.createdAt ? ` · ${formatarData(row.createdAt)}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                row.mode === "PROJECT"
                                  ? "bg-[color:var(--primary)]/12 text-[color:var(--primary)]"
                                  : "bg-amber-500/15 text-amber-800"
                              }`}
                            >
                              {row.mode === "PROJECT" ? "Taxa projeto" : "Por skill"}
                            </span>
                            {allowEdit && (
                              <button
                                type="button"
                                disabled={deletingId === row.id}
                                onClick={() => void removeReadjustment(row.id)}
                                className="rounded-md p-1 text-red-600/80 hover:bg-red-50"
                                title="Remover"
                              >
                                {deletingId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {row.mode === "PROJECT" && row.clientHourlyRate != null ? (
                          <p className="mt-3 text-lg font-semibold tabular-nums text-[color:var(--primary)]">
                            {formatarMoeda(row.clientHourlyRate)}
                            <span className="ml-1 text-xs font-normal text-[color:var(--muted-foreground)]">
                              /hora
                            </span>
                          </p>
                        ) : null}

                        {row.skillRates.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {row.skillRates.map((skill) => (
                              <li
                                key={skill.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-xs"
                              >
                                <span className="min-w-0 truncate font-medium">
                                  {skill.skillName}
                                </span>
                                <span className="shrink-0 tabular-nums font-semibold">
                                  {formatarMoeda(skill.hourlyRate)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {row.notes && (
                          <p className="mt-2 text-[11px] italic text-[color:var(--muted-foreground)]">
                            {row.notes}
                          </p>
                        )}
                      </article>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : auditRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--muted-foreground)]">
              Sem alterações registradas.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {auditRows.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border px-3.5 py-3 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p className="font-medium">
                    {h.user.name} · {formatarData(h.createdAt)}
                  </p>
                  {h.details && (
                    <p className="mt-1 text-[color:var(--muted-foreground)]">{h.details}</p>
                  )}
                  {h.fieldLabel && (
                    <p className="mt-1">
                      {h.fieldLabel}: {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
