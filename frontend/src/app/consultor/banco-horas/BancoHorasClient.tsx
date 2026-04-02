"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Pencil, Check, Download } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(n: number) {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Mês “fechado” para exibir complementares: só meses já encerrados (anteriores ao mês corrente no ano corrente). */
function isMonthClosedForComplementares(year: number, month: number): boolean {
  const n = new Date();
  if (year < n.getFullYear()) return true;
  if (year > n.getFullYear()) return false;
  return month < n.getMonth() + 1;
}

function complementaresExibidos(row: BancoRow): number {
  return isMonthClosedForComplementares(row.year, row.month) ? row.horasComplementares : 0;
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

type BancoRow = {
  id: string | null;
  month: number;
  year: number;
  horasPrevistas: number;
  horasTrabalhadas: number;
  horasPagas: number;
  /** Saldo acumulado ao fim do mês (cada mês: saldo anterior + trabalhadas−previstas − horas pagas). */
  horasComplementares: number;
  horasComplementaresMes?: number;
  observacao: string | null;
};

type EditFields = { observacao: string; horasPagas: string };

export function BancoHorasClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user } = useAuth();
  const canEditHorasPagas = user?.role === "SUPER_ADMIN";
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [data, setData] = useState<BancoRow[]>([]);
  const [savingObs, setSavingObs] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Record<string, EditFields>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadHourBank() {
    const url = `/api/hour-bank?year=${year}${isAdmin && selectedUserId ? `&userId=${selectedUserId}` : ""}`;
    const r = await apiFetch(url);
    const json = await r.json();
    const list = Array.isArray(json) ? json : [];
    setData(
      list.map((row: BancoRow) => ({
        ...row,
        horasPagas: typeof row.horasPagas === "number" && Number.isFinite(row.horasPagas) ? row.horasPagas : 0,
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
    let hpParsed: number;
    if (canEditHorasPagas) {
      const parsed = parseHorasPagasInput(ev.horasPagas);
      if (parsed === null) {
        setSaveError("Horas pagas inválidas. Use um número ≥ 0 (ex.: 1 ou 1,5).");
        return;
      }
      hpParsed = parsed;
    } else {
      hpParsed = hpOld;
    }
    const obsChanged = obsNew !== obsOld;
    const hpChanged = canEditHorasPagas && Math.abs(hpParsed - hpOld) > 0.0001;

    if (!obsChanged && !hpChanged) {
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
        userId?: string;
      } = {
        month: row.month,
        year: row.year,
        ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
      };
      if (obsChanged) body.observacao = obsNew || null;
      if (hpChanged) body.horasPagas = hpParsed === 0 ? null : hpParsed;

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
  const saldoRodapeAno = rowUltimoFechado ? complementaresExibidos(rowUltimoFechado) : 0;

  const currentUserName =
    isAdmin && selectedUserId
      ? users.find((u) => u.id === selectedUserId)?.name ?? user?.name ?? ""
      : user?.name ?? "";

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
      "Horas pagas",
      "Saldo Horas complementares (acumulado)",
      "Observação",
    ];
    const rows: string[][] = filteredData.map((row) => [
      currentUserName,
      `${MESES[row.month - 1]}/${row.year}`,
      fmt(row.horasPrevistas),
      fmt(row.horasTrabalhadas),
      fmt(row.horasPagas ?? 0),
      `${complementaresExibidos(row) >= 0 ? "" : "-"}${fmt(Math.abs(complementaresExibidos(row)))}`,
      row.observacao ?? "",
    ]);
    const totalRow = [
      currentUserName,
      "Saldo acumulado (último mês fechado)",
      "",
      "",
      "",
      `${saldoRodapeAno >= 0 ? "" : "-"}${fmt(Math.abs(saldoRodapeAno))}`,
      "",
    ];
    const allRows =
      monthFilter === ""
        ? [...rows.map((r) => r.map(escapeCsv).join(CSV_SEP)), totalRow.map(escapeCsv).join(CSV_SEP)]
        : rows.map((r) => r.map(escapeCsv).join(CSV_SEP));
    const csv = [headers.map(escapeCsv).join(CSV_SEP), ...allRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `banco-horas-${year}${monthFilter ? `-${MESES[parseInt(monthFilter, 10) - 1]}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end justify-between flex-wrap">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Ano</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-4 py-2 bg-gray-50 border border-blue-200 rounded-lg text-gray-900"
          >
            {Array.from({ length: 2036 - 2024 + 1 }, (_, i) => 2024 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Mês</label>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-blue-200 rounded-lg text-gray-900"
          >
            <option value="">Todos os meses</option>
            {MESES.map((nome, i) => (
              <option key={i} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && users.length > 0 && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Usuário</label>
            <select
              value={selectedUserId || user?.id}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-blue-200 rounded-lg text-gray-900 min-w-[200px]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 max-w-3xl">
        <span className="font-medium text-gray-700">Total Horas complementares:</span> saldo{" "}
        <span className="font-medium text-gray-700">acumulado</span> ao fim de cada mês (saldo anterior + trabalhadas −
        previstas − horas pagas do mês). Só exibido para meses já encerrados; mês atual e futuros mostram 00:00.{" "}
        <span className="font-medium text-gray-700">Horas pagas:</span> quitadas em dinheiro — só o{" "}
        <span className="font-medium text-gray-700">Super Admin</span> pode editar; demais perfis apenas visualizam.
      </p>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{saveError}</div>
      )}

      <div className="rounded-xl border border-blue-100 overflow-x-auto bg-white shadow-sm">
        <table className="w-full min-w-[720px] table-fixed">
          <thead>
            <tr className="bg-blue-50 text-gray-600 text-sm">
              <th className="px-2 py-2 text-left w-[5.5rem] whitespace-nowrap">Mês/Ano</th>
              <th className="px-1 py-2 text-center whitespace-nowrap w-[5.5rem]">Horas previstas</th>
              <th className="px-1 py-2 text-center whitespace-nowrap w-[5.5rem]">Horas trabalhadas</th>
              <th className="px-1 py-2 text-center whitespace-nowrap w-[5.5rem]">Horas pagas</th>
              <th className="px-1 py-2 text-center whitespace-nowrap w-[6.5rem]">
                Saldo compl. <span className="font-normal text-[10px] text-gray-500">(acum.)</span>
              </th>
              <th className="px-4 py-3 text-left min-w-[12rem]">Observação / ajustes</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => {
              const exib = complementaresExibidos(row);
              return (
                <tr key={`${row.year}-${row.month}`} className="border-t border-blue-50">
                  <td className="px-2 py-2 text-gray-800 w-[5.5rem]">
                    {MESES[row.month - 1]}/{row.year}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-gray-600 w-[5.5rem]">
                    {fmt(row.horasPrevistas)}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-gray-600 w-[5.5rem]">
                    {fmt(row.horasTrabalhadas)}
                  </td>
                  <td className="px-1 py-2 text-center font-mono text-gray-600 w-[5.5rem]">
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
                              }),
                              horasPagas: e.target.value,
                            },
                          }))
                        }
                        disabled={savingObs === rowKey(row)}
                        className="w-full max-w-[5.5rem] mx-auto px-1 py-1 text-sm rounded border border-blue-200 text-center"
                        title="Horas quitadas em pagamento (decimais, ex.: 1,5)"
                      />
                    ) : (
                      fmt(row.horasPagas ?? 0)
                    )}
                  </td>
                  <td className="px-1 py-2 text-center font-mono w-[6.5rem]">
                    <span className={exib >= 0 ? "text-green-600" : "text-red-600"}>
                      {fmt(Math.abs(exib))}
                      {exib >= 0 ? " +" : " -"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <div className="flex flex-col gap-2">
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
                              className="w-full px-3 py-2 text-sm rounded-lg border border-blue-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 disabled:opacity-60"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              {(() => {
                                const ev = editValue[rowKey(row)];
                                const obsChanged =
                                  (ev?.observacao ?? row.observacao ?? "").trim() !== (row.observacao ?? "").trim();
                                const hpOld = Math.round((row.horasPagas ?? 0) * 100) / 100;
                                const hpParsed = canEditHorasPagas
                                  ? parseHorasPagasInput(ev?.horasPagas ?? "")
                                  : hpOld;
                                const hpChanged =
                                  canEditHorasPagas &&
                                  hpParsed !== null &&
                                  Math.abs(hpParsed - hpOld) > 0.0001;
                                const canSave = obsChanged || hpChanged;
                                return canSave ? (
                                  <button
                                    type="button"
                                    onClick={() => void saveEdits(row)}
                                    disabled={savingObs === rowKey(row)}
                                    className="shrink-0 flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                                  >
                                    <Check className="h-4 w-4" />
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
                                    className="shrink-0 flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancelar
                                  </button>
                                );
                              })()}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={row.observacao ?? ""}
                              readOnly
                              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-600"
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
                                  },
                                }));
                              }}
                              className="shrink-0 flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">{row.observacao ?? "-"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-blue-200 bg-blue-50/50 font-medium">
              <td className="px-2 py-2 text-gray-800 whitespace-nowrap" colSpan={4}>
                Saldo acumulado no último mês fechado
                <span className="block text-xs font-normal text-gray-500 sm:inline sm:ml-2">
                  (não soma as linhas — é o saldo ao fim de {lastClosed > 0 ? MESES[lastClosed - 1] : "—"})
                </span>
              </td>
              <td className="px-1 py-2 text-center font-mono w-[6.5rem]">
                <span className={saldoRodapeAno >= 0 ? "text-green-600" : "text-red-600"}>
                  {fmt(Math.abs(saldoRodapeAno))}
                  {saldoRodapeAno >= 0 ? " +" : " -"}
                </span>
              </td>
              <td className="px-4 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
