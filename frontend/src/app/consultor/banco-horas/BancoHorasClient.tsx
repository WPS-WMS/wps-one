"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Pencil, Check, Download, ChevronDown } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "00:00";
  const sign = x < 0 ? "-" : "";
  const ax = Math.abs(x);
  let h = Math.floor(ax);
  let m = Math.round((ax - h) * 60);
  // Corrige arredondamento 01:60 -> 02:00
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Último mês já encerrado no ano de referência (ex.: em abril/2026 → 3 = março). */
function lastClosedMonthNumber(year: number): number {
  const n = new Date();
  if (year < n.getFullYear()) return 12;
  if (year > n.getFullYear()) return 0;
  return n.getMonth();
}

function parseHorasPagasInput(raw: string): number | null {
  const t = raw.replace(",", ".").trim();
  if (!t) return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseSaldoAjusteInput(raw: string): number | null {
  const t = raw.replace(",", ".").trim();
  if (!t) return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

type BancoRow = {
  id: string | null;
  month: number;
  year: number;
  horasPrevistas: number;
  horasTrabalhadas: number;
  horasPagas: number;
  saldoAjuste?: number;
  /** Saldo acumulado ao fim do mês (cada mês: saldo anterior + trabalhadas−previstas − horas pagas). */
  horasComplementares: number;
  horasComplementaresMes?: number;
  observacao: string | null;
};

type EditFields = { observacao: string; horasPagas: string; saldoAjuste: string };

export function BancoHorasClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user } = useAuth();
  const canEditHorasPagas = user?.role === "SUPER_ADMIN";
  const showHorasPagas = user?.role === "SUPER_ADMIN";
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [yearOpen, setYearOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const yearAnchorRef = useRef<HTMLButtonElement | null>(null);
  const monthAnchorRef = useRef<HTMLButtonElement | null>(null);
  const userAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [yearMenuRect, setYearMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [monthMenuRect, setMonthMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [userMenuRect, setUserMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [data, setData] = useState<BancoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingObs, setSavingObs] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Record<string, EditFields>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadHourBank() {
    const url = `/api/hour-bank?year=${year}${isAdmin && selectedUserId ? `&userId=${selectedUserId}` : ""}`;
    setLoading(true);
    try {
      const r = await apiFetch(url);
      const text = await r.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : [];
      } catch {
        setLoadError(
          "Não foi possível ler a resposta do servidor. Verifique se o backend está atualizado e acessível.",
        );
        setData([]);
        return;
      }
      if (!r.ok) {
        const msg =
          typeof (parsed as { error?: string })?.error === "string"
            ? (parsed as { error: string }).error
            : `Erro ao carregar banco de horas (${r.status}).`;
        setLoadError(msg);
        setData([]);
        return;
      }
      const list = Array.isArray(parsed) ? parsed : [];
      setLoadError(null);
      setData(
        list.map((row: BancoRow) => ({
          ...row,
          horasPagas: typeof row.horasPagas === "number" && Number.isFinite(row.horasPagas) ? row.horasPagas : 0,
          saldoAjuste:
            typeof (row as BancoRow).saldoAjuste === "number" && Number.isFinite((row as BancoRow).saldoAjuste)
              ? (row as BancoRow).saldoAjuste
              : 0,
          horasComplementares:
            typeof row.horasComplementares === "number" && Number.isFinite(row.horasComplementares)
              ? row.horasComplementares
              : 0,
          horasComplementaresMes:
            typeof (row as BancoRow).horasComplementaresMes === "number" &&
            Number.isFinite((row as BancoRow).horasComplementaresMes)
              ? (row as BancoRow).horasComplementaresMes
              : undefined,
        })),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar banco de horas.");
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      apiFetch("/api/users/for-select")
        .then((r) => r.json())
        .then((list: Array<{ id: string; name: string; email?: string }>) =>
          setUsers(list.map((u) => ({ id: u.id, name: u.name }))),
        );
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || users.length === 0 || !user?.id) return;
    if (selectedUserId) return;
    if (users.some((u) => u.id === user.id)) setSelectedUserId(user.id);
    else setSelectedUserId(users[0].id);
  }, [isAdmin, users, user?.id, selectedUserId]);

  useEffect(() => {
    loadHourBank().catch(() => setData([]));
  }, [year, selectedUserId, isAdmin]);

  useEffect(() => {
    function onTimeEntriesChanged() {
      loadHourBank().catch(() => setData([]));
    }
    window.addEventListener("wps_time_entries_changed", onTimeEntriesChanged);
    return () => window.removeEventListener("wps_time_entries_changed", onTimeEntriesChanged);
  }, [year, selectedUserId, isAdmin]);

  function rowKey(row: BancoRow) {
    return `${row.month}-${row.year}`;
  }

  async function saveEdits(row: BancoRow) {
    const key = rowKey(row);
    const ev = editValue[key];
    if (!ev) return;
    setSaveError(null);

    const obsNew = (ev.observacao ?? "").trim();
    const obsOld = (row.observacao ?? "").trim();
    const hpOld = Math.round((row.horasPagas ?? 0) * 100) / 100;
    const ajOld = Math.round((row.saldoAjuste ?? 0) * 100) / 100;
    let hpParsed: number;
    let ajParsed: number;
    if (canEditHorasPagas) {
      const parsed = parseHorasPagasInput(ev.horasPagas);
      if (parsed === null) {
        setSaveError("Horas pagas inválidas. Use um número ≥ 0 (ex.: 1 ou 1,5).");
        return;
      }
      hpParsed = parsed;
      const parsedAj = parseSaldoAjusteInput(ev.saldoAjuste);
      if (parsedAj === null) {
        setSaveError("Ajuste inválido. Use um número (pode ser negativo, ex.: -4,65).");
        return;
      }
      ajParsed = parsedAj;
    } else {
      hpParsed = hpOld;
      ajParsed = ajOld;
    }
    const obsChanged = obsNew !== obsOld;
    const hpChanged = canEditHorasPagas && Math.abs(hpParsed - hpOld) > 0.0001;
    const ajChanged = canEditHorasPagas && Math.abs(ajParsed - ajOld) > 0.0001;

    if (!obsChanged && !hpChanged && !ajChanged) {
      setEditingRow(null);
      setEditValue((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setSavingObs(key);
    try {
      const body: {
        month: number;
        year: number;
        observacao?: string | null;
        horasPagas?: number | null;
        saldoAjuste?: number | null;
        userId?: string;
      } = {
        month: row.month,
        year: row.year,
        ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
      };
      if (obsChanged) body.observacao = obsNew || null;
      if (hpChanged) body.horasPagas = hpParsed === 0 ? null : hpParsed;
      if (ajChanged) body.saldoAjuste = ajParsed === 0 ? null : ajParsed;

      const res = await apiFetch("/api/hour-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(typeof updated?.error === "string" ? updated.error : "Não foi possível salvar.");
        return;
      }
      await loadHourBank();
      setEditingRow(null);
      setEditValue((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      console.error("Erro ao salvar:", err);
      setSaveError("Erro de conexão ao salvar.");
    } finally {
      setSavingObs(null);
    }
  }

  const filteredData = monthFilter
    ? data.filter((r) => r.month === parseInt(monthFilter, 10))
    : data;
  const lastClosed = lastClosedMonthNumber(year);
  const rowUltimoFechado = lastClosed > 0 ? data.find((r) => r.month === lastClosed) : null;
  const monthFilterNum = monthFilter ? parseInt(monthFilter, 10) : NaN;
  const rowMesFiltrado =
    monthFilter && Number.isFinite(monthFilterNum) ? data.find((r) => r.month === monthFilterNum) : null;

  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;

  function isFutureMonth(row: BancoRow): boolean {
    if (row.year > nowY) return true;
    if (row.year < nowY) return false;
    return row.month > nowM;
  }

  function isCurrentMonth(row: BancoRow): boolean {
    return row.year === nowY && row.month === nowM;
  }

  function getRowByMonth(month: number): BancoRow | undefined {
    return data.find((r) => r.month === month);
  }

  function saldoExibido(row: BancoRow): number {
    // 1) Meses futuros sempre zerados
    if (isFutureMonth(row)) return 0;
    // 2) Mês atual zerado, exceto se houver saldo no mês anterior (positivo ou negativo)
    if (isCurrentMonth(row)) {
      const prev = getRowByMonth(row.month - 1);
      return prev?.horasComplementares ?? 0;
    }
    // 3) Meses passados: saldo acumulado ao fim do mês
    return row.horasComplementares;
  }

  function horasPagasEfetivas(row: BancoRow): number {
    const key = rowKey(row);
    const raw = editValue[key]?.horasPagas;
    if (editingRow === key && canEditHorasPagas && raw !== undefined) {
      const parsed = parseHorasPagasInput(raw);
      if (parsed === null) return row.horasPagas ?? 0;
      return parsed;
    }
    return row.horasPagas ?? 0;
  }

  function saldoAjusteEfetivo(row: BancoRow): number {
    const key = rowKey(row);
    const raw = editValue[key]?.saldoAjuste;
    if (editingRow === key && canEditHorasPagas && raw !== undefined) {
      const parsed = parseSaldoAjusteInput(raw);
      if (parsed === null) return row.saldoAjuste ?? 0;
      return parsed;
    }
    return row.saldoAjuste ?? 0;
  }

  function saldoExibidoComEdicao(row: BancoRow): number {
    // Meses futuros sempre zerados (não sofrem ajustes)
    if (isFutureMonth(row)) return 0;

    // Diferença (novo - antigo) de horas pagas no mês em edição.
    // Essa diferença deve refletir no mês editado e todos os meses seguintes (saldo acumulado),
    // inclusive no "mês atual", que usa como base o saldo do mês anterior.
    let diff = 0;
    let diffAjuste = 0;
    let editedMonth = NaN;
    let editedYear = NaN;
    if (showHorasPagas && canEditHorasPagas && editingRow) {
      const [mStr, yStr] = editingRow.split("-");
      editedMonth = parseInt(mStr || "", 10);
      editedYear = parseInt(yStr || "", 10);
      if (Number.isFinite(editedMonth) && Number.isFinite(editedYear) && editedYear === row.year) {
        const editedRow = data.find((r) => r.month === editedMonth && r.year === editedYear);
        const ev = editValue[editingRow];
        const parsed = parseHorasPagasInput(ev?.horasPagas ?? "");
        const parsedAj = parseSaldoAjusteInput(ev?.saldoAjuste ?? "");
        if (editedRow && parsed !== null) {
          const oldPaid = Math.round((Number(editedRow.horasPagas ?? 0) as number) * 100) / 100;
          diff = Math.round((parsed - oldPaid) * 100) / 100;
        }
        if (editedRow && parsedAj !== null) {
          const oldAj = Math.round((Number(editedRow.saldoAjuste ?? 0) as number) * 100) / 100;
          diffAjuste = Math.round((parsedAj - oldAj) * 100) / 100;
        }
      }
    }

    // Regra especial do mês atual: saldo disponível = saldo do mês anterior − horas pagas do mês atual.
    if (isCurrentMonth(row)) {
      const prev = getRowByMonth(row.month - 1);
      let base = prev?.horasComplementares ?? 0;
      // Se a edição foi em mês <= mês anterior, ela precisa refletir na base do mês atual.
      if (Number.isFinite(editedMonth) && editedYear === row.year && row.month - 1 >= editedMonth) {
        base = Math.round((base - diff + diffAjuste) * 100) / 100;
      }
      const paidNow = horasPagasEfetivas(row);
      const ajNow = saldoAjusteEfetivo(row);
      return Math.round((base - paidNow + ajNow) * 100) / 100;
    }

    // Meses passados: saldo acumulado ao fim do mês, ajustado pela diferença do mês editado (se aplicável).
    let base = row.horasComplementares;
    if (Number.isFinite(editedMonth) && editedYear === row.year && row.month >= editedMonth) {
      base = Math.round((base - diff + diffAjuste) * 100) / 100;
    }
    return base;
  }

  /** “Saldo Total” segue a mesma regra do saldo exibido no contexto do filtro. */
  const saldoTotalRodape = monthFilter
    ? rowMesFiltrado
      ? saldoExibidoComEdicao(rowMesFiltrado)
      : 0
    : rowUltimoFechado
      ? saldoExibidoComEdicao(rowUltimoFechado)
      : 0;

  const currentUserName =
    isAdmin && selectedUserId
      ? users.find((u) => u.id === selectedUserId)?.name ?? user?.name ?? ""
      : user?.name ?? "";

  const yearOptions = useMemo(
    () => Array.from({ length: 2036 - 2024 + 1 }, (_, i) => 2024 + i),
    [],
  );
  const selectedMonthLabel = useMemo(() => {
    if (!monthFilter) return "Todos os meses";
    const idx = Number(monthFilter) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= MESES.length) return "Todos os meses";
    return MESES[idx];
  }, [monthFilter]);
  const selectedUserLabel = useMemo(() => {
    if (!isAdmin) return "";
    const id = selectedUserId || user?.id || "";
    return users.find((u) => u.id === id)?.name ?? "—";
  }, [isAdmin, selectedUserId, users, user?.id]);

  // Mantém os dropdowns fora de overflow (position: fixed)
  useEffect(() => {
    if (!yearOpen) return;
    const update = () => {
      const el = yearAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setYearMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [yearOpen]);

  useEffect(() => {
    if (!monthOpen) return;
    const update = () => {
      const el = monthAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMonthMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [monthOpen]);

  useEffect(() => {
    if (!userOpen) return;
    const update = () => {
      const el = userAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setUserMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [userOpen]);

  useEffect(() => {
    if (!yearOpen && !monthOpen && !userOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setYearOpen(false);
        setMonthOpen(false);
        setUserOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const insideYear =
        (yearAnchorRef.current && target && yearAnchorRef.current.contains(target)) ||
        (document.getElementById("banco-horas-year-menu") && target && document.getElementById("banco-horas-year-menu")!.contains(target));
      const insideMonth =
        (monthAnchorRef.current && target && monthAnchorRef.current.contains(target)) ||
        (document.getElementById("banco-horas-month-menu") && target && document.getElementById("banco-horas-month-menu")!.contains(target));
      const insideUser =
        (userAnchorRef.current && target && userAnchorRef.current.contains(target)) ||
        (document.getElementById("banco-horas-user-menu") && target && document.getElementById("banco-horas-user-menu")!.contains(target));
      if (yearOpen && !insideYear) setYearOpen(false);
      if (monthOpen && !insideMonth) setMonthOpen(false);
      if (userOpen && !insideUser) setUserOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [yearOpen, monthOpen, userOpen]);

  const CSV_SEP = ";";

  function escapeCsv(val: string): string {
    const s = String(val);
    if (s.includes(CSV_SEP) || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function downloadCsv() {
    const headers = [
      "Usuário",
      "Mês/Ano",
      "Horas previstas",
      "Horas trabalhadas",
      "Saldo",
      "Observação",
    ];
    if (showHorasPagas) headers.splice(4, 0, "Horas pagas");
    const rows: string[][] = filteredData.map((row) => [
      currentUserName,
      `${MESES[row.month - 1]}/${row.year}`,
      fmt(row.horasPrevistas),
      fmt(row.horasTrabalhadas),
      ...(showHorasPagas ? [fmt(row.horasPagas ?? 0)] : []),
      `${saldoExibidoComEdicao(row) >= 0 ? "" : "-"}${fmt(Math.abs(saldoExibidoComEdicao(row)))}`,
      row.observacao ?? "",
    ]);
    const totalRow = [
      currentUserName,
      "Saldo Total",
      "",
      "",
      `${saldoTotalRodape >= 0 ? "" : "-"}${fmt(Math.abs(saldoTotalRodape))}`,
      "",
    ];
    if (showHorasPagas) totalRow.splice(5, 0, "");
    const allRows = [
      ...rows.map((r) => r.map(escapeCsv).join(CSV_SEP)),
      totalRow.map(escapeCsv).join(CSV_SEP),
    ];
    const csv = [headers.map(escapeCsv).join(CSV_SEP), ...allRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `banco-horas-${year}${monthFilter ? `-${MESES[parseInt(monthFilter, 10) - 1]}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function pillSaldoClass(saldo: number): string {
    if (saldo > 0.0001) {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (saldo < -0.0001) {
      return "border-red-200 bg-red-50 text-red-700";
    }
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return (
    <div className="space-y-5">
      {typeof document !== "undefined" && yearOpen && yearMenuRect
        ? createPortal(
            <div
              id="banco-horas-year-menu"
              style={{
                position: "fixed",
                left: yearMenuRect.left,
                top: yearMenuRect.top,
                width: yearMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setYear(y);
                      setYearOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                      year === y ? "font-semibold" : ""
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && monthOpen && monthMenuRect
        ? createPortal(
            <div
              id="banco-horas-month-menu"
              style={{
                position: "fixed",
                left: monthMenuRect.left,
                top: monthMenuRect.top,
                width: monthMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setMonthFilter("");
                    setMonthOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos os meses
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {MESES.map((nome, i) => {
                  const value = String(i + 1);
                  const active = monthFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setMonthFilter(value);
                        setMonthOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && userOpen && userMenuRect && isAdmin
        ? createPortal(
            <div
              id="banco-horas-user-menu"
              style={{
                position: "fixed",
                left: userMenuRect.left,
                top: userMenuRect.top,
                width: userMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg p-2 max-h-64 overflow-auto">
                {users.map((u) => {
                  const active = (selectedUserId || user?.id) === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setUserOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Toolbar: filtros + ações */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
        <div className="p-4 md:p-5 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[color:var(--foreground)]">Filtros</p>
              <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                {isAdmin ? "Selecione o usuário e o período." : "Selecione o período para análise."}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-sm font-semibold hover:opacity-95 disabled:opacity-60"
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1.5 uppercase tracking-wide">
                Ano
              </label>
              <button
                type="button"
                ref={yearAnchorRef}
                onClick={() => {
                  setMonthOpen(false);
                  setUserOpen(false);
                  setYearOpen((v) => !v);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={yearOpen}
              >
                <span className="truncate">{year}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${yearOpen ? "rotate-180" : ""}`} />
              </button>
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1.5 uppercase tracking-wide">
                Mês
              </label>
              <button
                type="button"
                ref={monthAnchorRef}
                onClick={() => {
                  setYearOpen(false);
                  setUserOpen(false);
                  setMonthOpen((v) => !v);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                aria-expanded={monthOpen}
              >
                <span className="truncate">{selectedMonthLabel}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${monthOpen ? "rotate-180" : ""}`} />
              </button>
            </div>

            {isAdmin && users.length > 0 && (
              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-[color:var(--muted-foreground)] mb-1.5 uppercase tracking-wide">
                  Usuário
                </label>
                <button
                  type="button"
                  ref={userAnchorRef}
                  onClick={() => {
                    setYearOpen(false);
                    setMonthOpen(false);
                    setUserOpen((v) => !v);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2"
                  aria-expanded={userOpen}
                >
                  <span className="truncate">{selectedUserLabel}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${userOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {(() => {
          const ctxRow = monthFilter ? rowMesFiltrado : rowUltimoFechado;
          const saldo = monthFilter
            ? rowMesFiltrado
              ? saldoExibido(rowMesFiltrado)
              : 0
            : rowUltimoFechado
              ? saldoExibido(rowUltimoFechado)
              : 0;
          const worked = ctxRow?.horasTrabalhadas ?? 0;
          const planned = ctxRow?.horasPrevistas ?? 0;
          const monthLabel = monthFilter
            ? `${MESES[(Number(monthFilter) || 1) - 1]}/${year}`
            : rowUltimoFechado
              ? `${MESES[rowUltimoFechado.month - 1]}/${rowUltimoFechado.year}`
              : `${year}`;
          return (
            <>
              <div className="md:col-span-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wide">
                  Saldo (referência)
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <p className="text-2xl font-bold tabular-nums text-[color:var(--foreground)]">
                    {fmt(Math.abs(saldo))}
                  </p>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${pillSaldoClass(saldo)}`}>
                    {saldo > 0.0001 ? "Positivo" : saldo < -0.0001 ? "Negativo" : "Zerado"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  {monthFilter ? `Mês filtrado: ${monthLabel}` : `Último mês fechado: ${monthLabel}`}
                </p>
              </div>

              <div className="md:col-span-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wide">
                  Horas do período (referência)
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[color:var(--muted-foreground)]">Trabalhadas</p>
                    <p className="text-xl font-bold tabular-nums text-[color:var(--foreground)]">{fmt(worked)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[color:var(--muted-foreground)]">Previstas</p>
                    <p className="text-xl font-bold tabular-nums text-[color:var(--foreground)]">{fmt(planned)}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  {loading ? "Atualizando…" : "Baseado no recorte selecionado."}
                </p>
              </div>

              <div className="md:col-span-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wide">
                  Saldo total (contexto)
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <p className="text-2xl font-bold tabular-nums text-[color:var(--foreground)]">
                    {fmt(Math.abs(saldoTotalRodape))}
                  </p>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${pillSaldoClass(saldoTotalRodape)}`}>
                    {saldoTotalRodape >= 0 ? "Acumulado" : "Débito"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  {currentUserName ? `Usuário: ${currentUserName}` : "—"}
                </p>
              </div>
            </>
          );
        })()}
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Não foi possível carregar o banco de horas</p>
          <p className="mt-1 text-amber-800/90">{loadError}</p>
          <p className="mt-2 text-xs text-amber-700/90">
            Se o deploy foi recente, confira se a migração do banco (campo{" "}
            <code className="rounded bg-amber-100 px-1">horasPagas</code> em{" "}
            <code className="rounded bg-amber-100 px-1">HourBankRecord</code>) foi aplicada no PostgreSQL (
            <code className="rounded bg-amber-100 px-1">npx prisma migrate deploy</code>).
          </p>
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{saveError}</div>
      )}

      <div className="rounded-2xl border border-[color:var(--border)] overflow-hidden bg-[color:var(--surface)] shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] table-auto border-collapse">
          <thead>
            <tr className="text-[color:var(--muted-foreground)] text-xs bg-[color:var(--surface)]/60">
              <th className="px-4 py-3 text-left w-[6.25rem] whitespace-nowrap uppercase tracking-wide font-semibold">Mês/Ano</th>
              <th className="px-3 py-3 text-center whitespace-nowrap w-[7rem] uppercase tracking-wide font-semibold">Previstas</th>
              <th className="px-3 py-3 text-center whitespace-nowrap w-[7rem] uppercase tracking-wide font-semibold">Trabalhadas</th>
              {showHorasPagas && (
                <th className="px-3 py-3 text-center whitespace-nowrap w-[7rem] uppercase tracking-wide font-semibold">Pagas</th>
              )}
              {showHorasPagas && (
                <th className="px-3 py-3 text-center whitespace-nowrap w-[7rem] uppercase tracking-wide font-semibold">Ajuste</th>
              )}
              <th className="px-3 py-3 text-center whitespace-nowrap w-[7.5rem] uppercase tracking-wide font-semibold">Saldo</th>
              <th className="px-4 py-3 text-left min-w-[14rem] w-[26rem] uppercase tracking-wide font-semibold">Observação</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={showHorasPagas ? 7 : 5} className="px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
                  Carregando banco de horas…
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={showHorasPagas ? 7 : 5} className="px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
                  Nenhum registro encontrado para o período selecionado.
                </td>
              </tr>
            ) : (
              <>
              {filteredData.map((row) => {
              const exib = saldoExibidoComEdicao(row);
              const isCurrent = isCurrentMonth(row);
              const rowText = isCurrent ? "text-indigo-700" : "";
              return (
                <tr key={`${row.year}-${row.month}`} className="border-t border-[color:var(--border)]/60 hover:bg-[color:var(--surface)]/50">
                  <td className={`px-4 py-3 w-[6.25rem] ${isCurrent ? "text-indigo-800 font-semibold" : "text-[color:var(--foreground)]"}`}>
                    {MESES[row.month - 1]}/{row.year}
                  </td>
                  <td className={`px-3 py-3 text-center font-mono tabular-nums w-[7rem] ${isCurrent ? "text-indigo-700 font-semibold" : "text-[color:var(--muted-foreground)]"}`}>
                    {fmt(row.horasPrevistas)}
                  </td>
                  <td className={`px-3 py-3 text-center font-mono tabular-nums w-[7rem] ${isCurrent ? "text-indigo-700 font-semibold" : "text-[color:var(--muted-foreground)]"}`}>
                    {fmt(row.horasTrabalhadas)}
                  </td>
                  {showHorasPagas && (
                    <td className={`px-3 py-3 text-center font-mono tabular-nums w-[7rem] ${isCurrent ? "text-indigo-700 font-semibold" : "text-[color:var(--muted-foreground)]"}`}>
                      {isAdmin && editingRow === rowKey(row) && canEditHorasPagas ? (
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={editValue[rowKey(row)]?.horasPagas ?? ""}
                          onChange={(e) =>
                            setEditValue((prev) => ({
                              ...prev,
                              [rowKey(row)]: {
                                ...(prev[rowKey(row)] ?? {
                                  observacao: row.observacao ?? "",
                                  horasPagas: row.horasPagas ? String(row.horasPagas) : "",
                                  saldoAjuste: row.saldoAjuste ? String(row.saldoAjuste) : "",
                                }),
                                horasPagas: e.target.value,
                              },
                            }))
                          }
                          disabled={savingObs === rowKey(row)}
                          className="w-full max-w-[7rem] mx-auto px-2 py-1.5 text-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-center text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                          title="Horas quitadas em pagamento (decimais, ex.: 1,5)"
                        />
                      ) : (
                        fmt(row.horasPagas ?? 0)
                      )}
                    </td>
                  )}
                  {showHorasPagas && (
                    <td className={`px-3 py-3 text-center font-mono tabular-nums w-[7rem] ${isCurrent ? "text-indigo-700 font-semibold" : "text-[color:var(--muted-foreground)]"}`}>
                      {isAdmin && editingRow === rowKey(row) && canEditHorasPagas ? (
                        <input
                          type="number"
                          step={0.25}
                          value={editValue[rowKey(row)]?.saldoAjuste ?? ""}
                          onChange={(e) =>
                            setEditValue((prev) => ({
                              ...prev,
                              [rowKey(row)]: {
                                ...(prev[rowKey(row)] ?? {
                                  observacao: row.observacao ?? "",
                                  horasPagas: row.horasPagas ? String(row.horasPagas) : "",
                                  saldoAjuste: row.saldoAjuste ? String(row.saldoAjuste) : "",
                                }),
                                saldoAjuste: e.target.value,
                              },
                            }))
                          }
                          disabled={savingObs === rowKey(row)}
                          className="w-full max-w-[7rem] mx-auto px-2 py-1.5 text-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-center text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                          title="Ajuste manual de saldo (pode ser negativo, ex.: -4,65)"
                        />
                      ) : (
                        fmt(row.saldoAjuste ?? 0)
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center font-mono tabular-nums w-[7.5rem]">
                    <span className={`${exib >= 0 ? "text-green-600" : "text-red-600"} ${rowText} ${isCurrent ? "font-semibold" : ""}`}>
                      {fmt(Math.abs(exib))}
                      {exib >= 0 ? " +" : " -"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <div className="flex items-start gap-2">
                        {editingRow === rowKey(row) ? (
                          <>
                            <input
                              type="text"
                              value={editValue[rowKey(row)]?.observacao ?? row.observacao ?? ""}
                              onChange={(e) =>
                                setEditValue((prev) => ({
                                  ...prev,
                                  [rowKey(row)]: {
                                    ...(prev[rowKey(row)] ?? {
                                      observacao: row.observacao ?? "",
                                      horasPagas: row.horasPagas ? String(row.horasPagas) : "",
                                      saldoAjuste: row.saldoAjuste ? String(row.saldoAjuste) : "",
                                    }),
                                    observacao: e.target.value,
                                  },
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveEdits(row);
                              }}
                              placeholder="Observação..."
                              disabled={savingObs === rowKey(row)}
                              className="min-h-10 flex-1 min-w-0 px-3 py-2 text-sm rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-60"
                              autoFocus
                            />
                            {(() => {
                              const ev = editValue[rowKey(row)];
                              const obsChanged =
                                (ev?.observacao ?? row.observacao ?? "").trim() !== (row.observacao ?? "").trim();
                              const hpOld = Math.round((row.horasPagas ?? 0) * 100) / 100;
                              const ajOld = Math.round((row.saldoAjuste ?? 0) * 100) / 100;
                              const hpParsed = canEditHorasPagas
                                ? parseHorasPagasInput(ev?.horasPagas ?? "")
                                : hpOld;
                              const hpChanged =
                                canEditHorasPagas &&
                                hpParsed !== null &&
                                Math.abs(hpParsed - hpOld) > 0.0001;
                              const ajParsed = canEditHorasPagas ? parseSaldoAjusteInput(ev?.saldoAjuste ?? "") : ajOld;
                              const ajChanged =
                                canEditHorasPagas &&
                                ajParsed !== null &&
                                Math.abs(ajParsed - ajOld) > 0.0001;
                              const canSave = obsChanged || hpChanged || ajChanged;
                              const slotClass =
                                "h-10 w-[9.25rem] shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold";
                              return canSave ? (
                                <button
                                  type="button"
                                  onClick={() => void saveEdits(row)}
                                  disabled={savingObs === rowKey(row)}
                                  className={`${slotClass} bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-95 disabled:opacity-60`}
                                >
                                  <Check className="h-4 w-4 shrink-0" />
                                  Salvar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRow(null);
                                    setEditValue((prev) => {
                                      const next = { ...prev };
                                      delete next[rowKey(row)];
                                      return next;
                                    });
                                    setSaveError(null);
                                  }}
                                  className={`${slotClass} border border-[color:var(--border)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface)]/60`}
                                >
                                  Cancelar
                                </button>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={row.observacao ?? ""}
                              readOnly
                              className="min-h-10 flex-1 min-w-0 px-3 py-2 text-sm rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/50 text-[color:var(--muted-foreground)]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setSaveError(null);
                                setEditingRow(rowKey(row));
                                setEditValue((prev) => ({
                                  ...prev,
                                  [rowKey(row)]: {
                                    observacao: row.observacao ?? "",
                                    horasPagas: row.horasPagas ? String(row.horasPagas) : "",
                                    saldoAjuste: row.saldoAjuste ? String(row.saldoAjuste) : "",
                                  },
                                }));
                              }}
                              className="h-10 w-[9.25rem] shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface)]/60"
                            >
                              <Pencil className="h-4 w-4 shrink-0" />
                              Editar
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-[color:var(--muted-foreground)] text-sm">{row.observacao ?? "-"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-[color:var(--border)] bg-[color:var(--surface)]/50 font-semibold">
              <td className="px-4 py-3 text-[color:var(--foreground)] whitespace-nowrap" colSpan={showHorasPagas ? 5 : 3}>
                Saldo Total
              </td>
              <td className="px-3 py-3 text-center font-mono tabular-nums w-[7.5rem]">
                <span className={saldoTotalRodape >= 0 ? "text-green-600" : "text-red-600"}>
                  {fmt(Math.abs(saldoTotalRodape))}
                  {saldoTotalRodape >= 0 ? " +" : " -"}
                </span>
              </td>
              <td className="px-4 py-3"></td>
            </tr>
              </>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
