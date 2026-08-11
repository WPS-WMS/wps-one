"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatarMoeda, formatarMoedaInput, moedaParaCentavos, parseMoedaInputToString } from "@/lib/brFormatters";
import { computePayableFormTotalCents } from "@/lib/payableTotals";
import {
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";
import { PopoverSelect } from "@/components/ui/PopoverSelect";
import { PAYABLE_PAYMENT_METHOD_OPTIONS } from "@/lib/financePaymentMethods";

type Option = { id: string; name: string };
type SupplierOption = { id: string; nomeApelido: string };
type ProfessionalOption = { id: string; name: string; linkedSupplierId?: string | null };
type ExpenseAccountOption = {
  id: string;
  name: string;
  enableHourRate: boolean;
  enableAmount: boolean;
  enableDiscount: boolean;
  enableComplementaryHours: boolean;
  enableInterestFine: boolean;
};

type AllocationLine = { costCenterId: string; projectId: string; percent: string };

export type PayableCreatePrefill = {
  professionalUserId: string;
  professionalName: string;
  amountCents: number;
  dueDate: string;
  categoryName?: string;
  hourRateCents?: number | null;
  complementaryHours?: number | null;
  description?: string;
};

type PayableCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (payableId: string) => void;
  prefill?: PayableCreatePrefill | null;
};

function centsToFormValue(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return String(cents / 100);
}

function emptyAllocation(): AllocationLine {
  return { costCenterId: "", projectId: "", percent: "100" };
}

function buildAllocationsPayload(lines: AllocationLine[]) {
  return lines
    .filter((l) => l.costCenterId)
    .map((l) => ({
      costCenterId: l.costCenterId,
      projectId: l.projectId || null,
      percentBps: Math.round(Number(String(l.percent).replace(",", ".")) * 100),
    }))
    .filter((l) => Number.isFinite(l.percentBps) && l.percentBps > 0);
}

export function PayableCreateModal({ open, onClose, onCreated, prefill }: PayableCreateModalProps) {
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [costCenters, setCostCenters] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccountOption[]>([]);
  const [allocations, setAllocations] = useState<AllocationLine[]>([emptyAllocation()]);
  const [form, setForm] = useState({
    description: "",
    financialAccountId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    payeeKind: "professional" as "professional" | "supplier",
    professionalUserId: "",
    supplierId: "",
    paymentMethod: "",
    hourRate: "",
    amount: "",
    discount: "",
    complementaryHours: "",
    interestFine: "",
  });

  const selectedAccount = useMemo(
    () => expenseAccounts.find((c) => c.id === form.financialAccountId) ?? null,
    [expenseAccounts, form.financialAccountId],
  );

  const formTotalCents = useMemo(() => computePayableFormTotalCents(form), [form]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    const [sRes, uRes, ccRes, fcRes, pRes] = await Promise.all([
      apiFetch("/api/suppliers/for-select"),
      apiFetch("/api/users/for-select?scope=relatorios&status=ativos"),
      apiFetch("/api/cost-centers"),
      apiFetch("/api/financial-accounts?type=DESPESA"),
      apiFetch("/api/projects?light=true"),
    ]);
    const sBody = await sRes.json().catch(() => null);
    setSuppliers(
      sRes.ok && Array.isArray(sBody)
        ? sBody.map((s: SupplierOption) => ({ id: s.id, nomeApelido: s.nomeApelido }))
        : [],
    );
    const uBody = await uRes.json().catch(() => null);
    setProfessionals(
      uRes.ok && Array.isArray(uBody)
        ? uBody.map((u: ProfessionalOption & { linkedSupplierId?: string | null }) => ({
            id: u.id,
            name: u.name,
            linkedSupplierId: u.linkedSupplierId ?? null,
          }))
        : [],
    );
    const ccBody = await ccRes.json().catch(() => null);
    setCostCenters(
      ccRes.ok && Array.isArray(ccBody)
        ? ccBody
            .filter((c: Option & { isActive?: boolean }) => c.isActive !== false)
            .map((c: Option) => ({ id: c.id, name: c.name }))
        : [],
    );
    const fcBody = await fcRes.json().catch(() => null);
    setExpenseAccounts(
      fcRes.ok && Array.isArray(fcBody)
        ? fcBody
            .filter((c: ExpenseAccountOption & { isActive?: boolean }) => c.isActive !== false)
            .map((c: ExpenseAccountOption) => ({
              id: c.id,
              name: c.name,
              enableHourRate: Boolean(c.enableHourRate),
              enableAmount: Boolean(c.enableAmount),
              enableDiscount: Boolean(c.enableDiscount),
              enableComplementaryHours: Boolean(c.enableComplementaryHours),
              enableInterestFine: Boolean(c.enableInterestFine),
            }))
        : [],
    );
    const pBody = await pRes.json().catch(() => null);
    setProjects(
      pRes.ok && Array.isArray(pBody)
        ? pBody.map((p: Option) => ({ id: p.id, name: p.name }))
        : [],
    );
    setLoadingOptions(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void loadOptions();
  }, [open, loadOptions]);

  useEffect(() => {
    if (!open || loadingOptions) return;
    if (!prefill) {
      setForm({
        description: "",
        financialAccountId: "",
        dueDate: new Date().toISOString().slice(0, 10),
        payeeKind: "professional",
        professionalUserId: "",
        supplierId: "",
        paymentMethod: "",
        hourRate: "",
        amount: "",
        discount: "",
        complementaryHours: "",
        interestFine: "",
      });
      setAllocations([emptyAllocation()]);
      return;
    }

    const categoryName = (prefill.categoryName ?? "Folha").trim().toLowerCase();
    const folha =
      expenseAccounts.find((c) => c.name.trim().toLowerCase() === categoryName) ??
      expenseAccounts.find((c) => c.name.trim().toLowerCase() === "folha");

    if (
      prefill.professionalUserId &&
      !professionals.some((p) => p.id === prefill.professionalUserId)
    ) {
      setProfessionals((current) => [
        ...current,
        { id: prefill.professionalUserId, name: prefill.professionalName || "Profissional" },
      ]);
    }

    setForm({
      description: prefill.description?.trim() || `Horas — ${prefill.professionalName}`.slice(0, 500),
      financialAccountId: folha?.id ?? "",
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(prefill.dueDate)
        ? prefill.dueDate
        : new Date().toISOString().slice(0, 10),
      payeeKind: "professional",
      professionalUserId: prefill.professionalUserId,
      supplierId: "",
      paymentMethod: "",
      hourRate: centsToFormValue(prefill.hourRateCents),
      amount: centsToFormValue(prefill.amountCents),
      discount: "",
      complementaryHours:
        prefill.complementaryHours != null && Number.isFinite(prefill.complementaryHours)
          ? String(prefill.complementaryHours)
          : "",
      interestFine: "",
    });
    setAllocations([emptyAllocation()]);
    if (!folha) {
      setError(
        `Conta / tipo "${prefill.categoryName ?? "Folha"}" não encontrada. Selecione a conta manualmente.`,
      );
    }
  }, [open, loadingOptions, prefill, expenseAccounts, professionals]);

  async function save() {
    if (!form.description.trim()) {
      setError("Informe a atividade/descrição.");
      return;
    }
    if (!form.financialAccountId) {
      setError("Selecione a Conta / tipo.");
      return;
    }
    if (!form.dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    if (form.payeeKind === "professional" && !form.professionalUserId) {
      setError("Selecione o profissional.");
      return;
    }
    if (form.payeeKind === "supplier" && !form.supplierId) {
      setError("Selecione a empresa/fornecedor.");
      return;
    }
    const allocationPayload = buildAllocationsPayload(allocations);
    if (allocationPayload.length === 0) {
      setError("Informe ao menos uma linha de rateio por centro de custo.");
      return;
    }

    const amountCents = selectedAccount?.enableAmount ? (moedaParaCentavos(form.amount) ?? 0) : 0;
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      financialAccountId: form.financialAccountId,
      totalAmountCents: amountCents ?? 0,
      dueDate: form.dueDate,
      installmentCount: 1,
      professionalUserId: form.payeeKind === "professional" ? form.professionalUserId : null,
      supplierId: form.payeeKind === "supplier" ? form.supplierId : null,
      paymentMethod: form.paymentMethod || null,
      allocations: allocationPayload,
    };
    if (selectedAccount?.enableHourRate) payload.hourRateCents = moedaParaCentavos(form.hourRate);
    if (selectedAccount?.enableDiscount) payload.discountCents = moedaParaCentavos(form.discount);
    if (selectedAccount?.enableInterestFine) payload.interestFineCents = moedaParaCentavos(form.interestFine);
    if (selectedAccount?.enableComplementaryHours) {
      const h =
        form.complementaryHours.trim() === ""
          ? null
          : Number(form.complementaryHours.replace(",", "."));
      if (h != null && (!Number.isFinite(h) || h < 0)) {
        setSaving(false);
        setError("Horas complementares inválidas.");
        return;
      }
      payload.complementaryHours = h;
    }

    const r = await apiFetch("/api/payables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok) {
      setError(typeof body?.error === "string" ? body.error : "Erro ao salvar.");
      return;
    }
    onClose();
    if (typeof body?.id === "string") onCreated?.(body.id);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-[color:var(--surface)] p-5">
        <div className="flex justify-between">
          <h3 className="font-semibold">Nova conta a pagar</h3>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingOptions ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando formulário…
          </p>
        ) : (
          <>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className={formModalLabelClass}>Atividade/Descrição</label>
                <input
                  className={formModalInputClass()}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex.: Desenvolvedor Fullstack…"
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Conta / tipo</label>
                <PopoverSelect
                  id="payable-create-category"
                  value={form.financialAccountId}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      financialAccountId: v,
                      hourRate: "",
                      amount: f.amount,
                      discount: "",
                      complementaryHours: f.complementaryHours,
                      interestFine: "",
                    }))
                  }
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...expenseAccounts.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              {selectedAccount && (
                <div
                  className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  {selectedAccount.enableHourRate && (
                    <div>
                      <label className={formModalLabelClass}>Tx hora</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.hourRate)}
                        placeholder="R$ 0,00"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, hourRate: parseMoedaInputToString(e.target.value) }))
                        }
                      />
                    </div>
                  )}
                  {selectedAccount.enableAmount && (
                    <div>
                      <label className={formModalLabelClass}>Valor</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.amount)}
                        placeholder="R$ 0,00"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, amount: parseMoedaInputToString(e.target.value) }))
                        }
                      />
                    </div>
                  )}
                  {selectedAccount.enableComplementaryHours && (
                    <div>
                      <label className={formModalLabelClass}>Horas</label>
                      <input
                        type="text"
                        className={formModalInputClass()}
                        value={form.complementaryHours}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, complementaryHours: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {selectedAccount.enableDiscount && (
                    <div>
                      <label className={formModalLabelClass}>Desconto</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.discount)}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, discount: parseMoedaInputToString(e.target.value) }))
                        }
                      />
                    </div>
                  )}
                  {selectedAccount.enableInterestFine && (
                    <div>
                      <label className={formModalLabelClass}>Juros/Multa</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={formModalInputClass()}
                        value={formatarMoedaInput(form.interestFine)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            interestFine: parseMoedaInputToString(e.target.value),
                          }))
                        }
                      />
                    </div>
                  )}
                  <div
                    className="sm:col-span-2 flex items-center justify-between gap-3 rounded-lg border bg-black/[0.03] px-3 py-2.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div>
                      <p className="text-xs font-medium text-[color:var(--foreground)]">Total</p>
                      <p className="text-[11px] text-[color:var(--muted-foreground)]">
                        Valor + (Tx hora × H. compl.) − Descontos + Juros/Multa
                      </p>
                    </div>
                    <p className="text-base font-semibold tabular-nums">
                      {formatarMoeda(formTotalCents / 100)}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className={formModalLabelClass}>Vencimento</label>
                <input
                  type="date"
                  className={formModalInputClass()}
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Forma de pagamento</label>
                <PopoverSelect
                  id="payable-create-payment-method"
                  value={form.paymentMethod}
                  onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...PAYABLE_PAYMENT_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                />
              </div>
              <div>
                <label className={formModalLabelClass}>Pagamento para</label>
                <div className="mb-2 flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={form.payeeKind === "professional"}
                      onChange={() =>
                        setForm((f) => ({ ...f, payeeKind: "professional", supplierId: "" }))
                      }
                    />
                    Profissional
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={form.payeeKind === "supplier"}
                      onChange={() =>
                        setForm((f) => ({ ...f, payeeKind: "supplier", professionalUserId: "" }))
                      }
                    />
                    Empresa
                  </label>
                </div>
                {form.payeeKind === "professional" ? (
                  <PopoverSelect
                    id="payable-create-professional"
                    value={form.professionalUserId}
                    onChange={(v) => setForm((f) => ({ ...f, professionalUserId: v }))}
                    placeholder="Selecione o profissional"
                    options={[
                      { value: "", label: "Selecione o profissional" },
                      ...professionals.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                ) : (
                  <PopoverSelect
                    id="payable-create-supplier"
                    value={form.supplierId}
                    onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
                    placeholder="Selecione a empresa/fornecedor"
                    options={[
                      { value: "", label: "Selecione a empresa/fornecedor" },
                      ...suppliers.map((s) => ({ value: s.id, label: s.nomeApelido })),
                    ]}
                  />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={formModalLabelClass}>Rateio (centro de custo / projeto)</label>
                  <button
                    type="button"
                    className="text-xs text-[color:var(--primary)] hover:underline"
                    onClick={() => setAllocations((lines) => [...lines, emptyAllocation()])}
                  >
                    + Linha
                  </button>
                </div>
                {allocations.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-4">
                      <PopoverSelect
                        id={`payable-create-alloc-cc-${idx}`}
                        value={line.costCenterId}
                        onChange={(v) =>
                          setAllocations((lines) =>
                            lines.map((l, i) => (i === idx ? { ...l, costCenterId: v } : l)),
                          )
                        }
                        placeholder="Centro de custo"
                        options={[
                          { value: "", label: "Centro de custo" },
                          ...costCenters.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    </div>
                    <div className="col-span-4">
                      <PopoverSelect
                        id={`payable-create-alloc-project-${idx}`}
                        value={line.projectId}
                        onChange={(v) =>
                          setAllocations((lines) =>
                            lines.map((l, i) => (i === idx ? { ...l, projectId: v } : l)),
                          )
                        }
                        placeholder="Projeto (opcional)"
                        options={[
                          { value: "", label: "Projeto (opcional)" },
                          ...projects.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className={`${formModalInputClass()} pr-8`}
                          value={line.percent}
                          onChange={(e) =>
                            setAllocations((lines) =>
                              lines.map((l, i) =>
                                i === idx ? { ...l, percent: e.target.value } : l,
                              ),
                            )
                          }
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--muted-foreground)]">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="col-span-1">
                      {allocations.length > 1 && (
                        <button
                          type="button"
                          className="p-2 text-red-600"
                          onClick={() =>
                            setAllocations((lines) => lines.filter((_, i) => i !== idx))
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
