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

type BancoRow = {
  id: string | null;
  month: number;
  year: number;
  horasPrevistas: number;
  horasTrabalhadas: number;
  horasComplementares: number;
  observacao: string | null;
};

export function BancoHorasClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [data, setData] = useState<BancoRow[]>([]);
  const [savingObs, setSavingObs] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Record<string, { observacao: string; horasTrabalhadas: string }>>({});

  useEffect(() => {
    if (isAdmin) {
      // Usar for-select para compatibilidade com ADMIN e GESTOR_PROJETOS (GET /api/users é só ADMIN)
      apiFetch("/api/users/for-select")
        .then((r) => r.json())
        .then((list: Array<{ id: string; name: string; email?: string }>) =>
          setUsers(list.map((u) => ({ id: u.id, name: u.name })))
        );
    }
  }, [isAdmin]);

  useEffect(() => {
    const url = `/api/hour-bank?year=${year}${isAdmin && selectedUserId ? `&userId=${selectedUserId}` : ""}`;
    apiFetch(url).then((r) => r.json()).then(setData);
  }, [year, selectedUserId, isAdmin]);

  function rowKey(row: BancoRow) {
    return `${row.month}-${row.year}`;
  }

  function formatHorasInput(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits + (digits.length > 0 ? ":" : "");
    return digits.slice(0, 2) + ":" + digits.slice(2, 4);
  }

  function parseHorasInput(s: string): number | null {
    const t = s.trim().replace(",", ".");
    if (!t) return null;
    const match = t.match(/^(\d+):(\d{1,2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      return h + m / 60;
    }
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  }

  async function saveEdits(row: BancoRow) {
    const key = rowKey(row);
    const ev = editValue[key];
    if (!ev) return;
    const obsChanged = (ev.observacao ?? "").trim() !== (row.observacao ?? "").trim();
    const htNum = parseHorasInput(ev.horasTrabalhadas ?? "");
    const htChanged = htNum != null && Math.abs(htNum - row.horasTrabalhadas) > 0.001;
    if (!obsChanged && !htChanged) {
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
      const body: { month: number; year: number; observacao?: string | null; horasTrabalhadas?: string; userId?: string } = {
        month: row.month,
        year: row.year,
        ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
      };
      if (obsChanged) body.observacao = (ev.observacao ?? "").trim() || null;
      if (htChanged && ev.horasTrabalhadas.trim()) body.horasTrabalhadas = ev.horasTrabalhadas.trim();
      const res = await apiFetch("/api/hour-bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await res.json();
      setData((prev) =>
        prev.map((r) =>
          r.month === row.month && r.year === row.year
            ? {
                ...r,
                id: updated.id,
                observacao: updated.observacao,
                horasTrabalhadas: updated.horasTrabalhadas ?? r.horasTrabalhadas,
                horasComplementares: updated.horasComplementares ?? r.horasComplementares,
              }
            : r
        )
      );
      setEditingRow(null);
      setEditValue((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      console.error("Erro ao salvar:", err);
    } finally {
      setSavingObs(null);
    }
  }

  const filteredData = monthFilter
    ? data.filter((r) => r.month === parseInt(monthFilter, 10))
    : data;
  const totalHorasExtras = data.reduce((s, r) => s + (r.horasComplementares ?? 0), 0);

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
    const headers = ["Usuário", "Mês/Ano", "Horas previstas", "Horas trabalhadas", "Total de Horas extras", "Observação"];
    const rows: string[][] = filteredData.map((row) => [
      currentUserName,
      `${MESES[row.month - 1]}/${row.year}`,
      fmt(row.horasPrevistas),
      fmt(row.horasTrabalhadas),
      `${row.horasComplementares >= 0 ? "" : "-"}${fmt(Math.abs(row.horasComplementares))}`,
      row.observacao ?? "",
    ]);
    const totalRow = [
      currentUserName,
      "Total de hora extra do ano",
      "",
      "",
      `${totalHorasExtras >= 0 ? "" : "-"}${fmt(Math.abs(totalHorasExtras))}`,
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
              <option key={y} value={y}>{y}</option>
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
              <option key={i} value={i + 1}>{nome}</option>
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
                <option key={u.id} value={u.id}>{u.name}</option>
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

      <div className="rounded-xl border border-blue-100 overflow-hidden bg-white shadow-sm">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-blue-50 text-gray-600 text-sm">
              <th className="px-2 py-2 text-left w-[10.5rem] whitespace-nowrap">Mês/Ano</th>
              <th className="px-1 py-2 text-center whitespace-nowrap min-w-[6rem]">Horas previstas</th>
              <th className="px-1 py-2 text-center whitespace-nowrap min-w-[6rem]">Horas trabalhadas</th>
              <th className="px-1 py-2 text-center whitespace-nowrap min-w-[7rem]">Total de Horas extras</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Observação</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => (
              <tr key={`${row.year}-${row.month}`} className="border-t border-blue-50">
                <td className="px-2 py-2 text-gray-800 w-[10.5rem]">{MESES[row.month - 1]}/{row.year}</td>
                <td className="px-1 py-2 text-center font-mono text-gray-600 min-w-[6rem]">{fmt(row.horasPrevistas)}</td>
                <td className="px-1 py-2 text-center font-mono text-gray-600 min-w-[6rem]">
                  {isAdmin && editingRow === rowKey(row) ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editValue[rowKey(row)]?.horasTrabalhadas ?? fmt(row.horasTrabalhadas)}
                      onChange={(e) => {
                        const formatted = formatHorasInput(e.target.value);
                        setEditValue((prev) => ({
                          ...prev,
                          [rowKey(row)]: {
                            ...(prev[rowKey(row)] ?? { observacao: row.observacao ?? "", horasTrabalhadas: fmt(row.horasTrabalhadas) }),
                            horasTrabalhadas: formatted,
                          },
                        }));
                      }}
                      placeholder="08:30"
                      disabled={savingObs === rowKey(row)}
                      className="w-20 px-2 py-1 text-center text-sm rounded border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mx-auto block"
                    />
                  ) : (
                    fmt(row.horasTrabalhadas)
                  )}
                </td>
                <td className="px-1 py-2 text-center font-mono min-w-[7rem]">
                  {(() => {
                    let comp = row.horasComplementares;
                    if (isAdmin && editingRow === rowKey(row)) {
                      const ev = editValue[rowKey(row)];
                      const htNum = ev?.horasTrabalhadas ? parseHorasInput(ev.horasTrabalhadas) : null;
                      if (htNum != null) comp = htNum - row.horasPrevistas;
                    }
                    return (
                      <span className={comp >= 0 ? "text-green-600" : "text-red-600"}>
                        {fmt(Math.abs(comp))}{comp >= 0 ? " +" : " -"}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      {editingRow === rowKey(row) ? (
                        <>
                          <input
                            type="text"
                            value={editValue[rowKey(row)]?.observacao ?? row.observacao ?? ""}
                            onChange={(e) =>
                              setEditValue((prev) => ({
                                ...prev,
                                [rowKey(row)]: {
                                  ...(prev[rowKey(row)] ?? { observacao: row.observacao ?? "", horasTrabalhadas: fmt(row.horasTrabalhadas) }),
                                  observacao: e.target.value,
                                },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdits(row);
                            }}
                            placeholder="Observação..."
                            disabled={savingObs === rowKey(row)}
                            className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-blue-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 disabled:opacity-60"
                            autoFocus
                          />
                          {(() => {
                            const ev = editValue[rowKey(row)];
                            const obsChanged = (ev?.observacao ?? row.observacao ?? "").trim() !== (row.observacao ?? "").trim();
                            const htNum = ev?.horasTrabalhadas ? parseHorasInput(ev.horasTrabalhadas) : null;
                            const htChanged = htNum != null && Math.abs(htNum - row.horasTrabalhadas) > 0.001;
                            const hasChanges = obsChanged || htChanged;
                            return hasChanges ? (
                              <button
                                type="button"
                                onClick={() => saveEdits(row)}
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
                                }}
                                className="shrink-0 flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
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
                            className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-600"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRow(rowKey(row));
                              setEditValue((prev) => ({
                                ...prev,
                                [rowKey(row)]: {
                                  observacao: row.observacao ?? "",
                                  horasTrabalhadas: fmt(row.horasTrabalhadas),
                                },
                              }));
                            }}
                            className="shrink-0 flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-500 text-sm">{row.observacao ?? "-"}</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-blue-200 bg-blue-50/50 font-medium">
              <td className="px-2 py-2 text-gray-800 w-[10.5rem] whitespace-nowrap">Total de hora extra do ano</td>
              <td className="px-1 py-2 min-w-[6rem]"></td>
              <td className="px-1 py-2 min-w-[6rem]"></td>
              <td className="px-1 py-2 text-center font-mono min-w-[7rem]">
                <span className={totalHorasExtras >= 0 ? "text-green-600" : "text-red-600"}>
                  {fmt(Math.abs(totalHorasExtras))}{totalHorasExtras >= 0 ? " +" : " -"}
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
