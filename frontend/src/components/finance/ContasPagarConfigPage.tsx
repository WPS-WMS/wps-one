"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Link } from "@/components/Link";
import { FinanceiroModuleGuard } from "@/components/finance/FinanceiroModuleGuard";
import { isFinanceiroModuleEnabled } from "@/lib/financeiroEnv";
import { ArrowLeft, Loader2 } from "lucide-react";

type CategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  enableHourRate: boolean;
  enableAmount: boolean;
  enableBenefit: boolean;
  enableReimbursement: boolean;
  enableDiscount: boolean;
  enableComplementaryHours: boolean;
  enableInterestFine: boolean;
};

const FIELD_COLUMNS = [
  { key: "enableHourRate", label: "Tx hora" },
  { key: "enableAmount", label: "Valor" },
  { key: "enableBenefit", label: "Benefício" },
  { key: "enableReimbursement", label: "Reembolso" },
  { key: "enableDiscount", label: "Descontos" },
  { key: "enableComplementaryHours", label: "H. compl." },
  { key: "enableInterestFine", label: "Juros/Multa" },
] as const;

type FieldKey = (typeof FIELD_COLUMNS)[number]["key"];

const PERMISSION = "configuracoes.financeiro.contasPagar";

export function ContasPagarConfigPage() {
  const { can, permissionsReady, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/gestor")
    ? "/gestor"
    : pathname.startsWith("/consultor")
      ? "/consultor"
      : "/admin";

  const canAccess = useMemo(
    () =>
      isFinanceiroModuleEnabled() &&
      (can(PERMISSION) || can("configuracoes.financeiro.categoriasFinanceiras")),
    [can],
  );

  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingRows(true);
    const r = await apiFetch("/api/financial-categories");
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      setRows([]);
      setError(typeof body?.error === "string" ? body.error : "Não foi possível carregar.");
      setLoadingRows(false);
      return;
    }
    setError(null);
    setRows(Array.isArray(body) ? body.filter((c: CategoryRow) => c.isActive !== false) : []);
    setLoadingRows(false);
  }, []);

  useEffect(() => {
    if (!permissionsReady || !canAccess) return;
    void load();
  }, [permissionsReady, canAccess, load]);

  async function toggleField(row: CategoryRow, key: FieldKey) {
    setSavingId(row.id);
    setError(null);
    const next = !row[key];
    const r = await apiFetch(`/api/financial-categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const body = await r.json().catch(() => null);
    setSavingId(null);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, [key]: next } : item)));
  }

  if (authLoading || !user || !permissionsReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isFinanceiroModuleEnabled()) {
    return <FinanceiroModuleGuard>{null}</FinanceiroModuleGuard>;
  }

  if (!canAccess) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] px-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 tracking-wider">403</div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Acesso negado</h1>
          <p className="mt-2 text-sm text-slate-600">Sem permissão para esta configuração.</p>
          <div className="mt-5">
            <Link href={`${basePath}/configuracoes/financeiro`} className="text-sm text-blue-600 hover:underline">
              Voltar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => router.push(`${basePath}/configuracoes/financeiro`)}
            className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Configurações · Financeiro
          </button>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Contas a pagar</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Defina, por tipo (categoria financeira), quais campos aparecem em Nova conta.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 py-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {loadingRows ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhum tipo cadastrado. Cadastre categorias em{" "}
              <Link href={`${basePath}/configuracoes/financeiro/categorias-financeiras`} className="text-blue-600 hover:underline">
                Categorias financeiras
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-700 whitespace-nowrap">Tipo</th>
                    {FIELD_COLUMNS.map((col) => (
                      <th key={col.key} className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">{row.name}</td>
                      {FIELD_COLUMNS.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[color:var(--primary)]"
                            checked={Boolean(row[col.key])}
                            disabled={savingId === row.id}
                            onChange={() => void toggleField(row, col.key)}
                            aria-label={`${row.name} — ${col.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
