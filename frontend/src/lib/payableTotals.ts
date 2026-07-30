import { moedaParaCentavos } from "@/lib/brFormatters";

/** Espelha `computePayableTotalCents` do backend. */
export function computePayableTotalCents(input: {
  totalAmountCents?: number | null;
  hourRateCents?: number | null;
  complementaryHours?: number | null;
  benefitCents?: number | null;
  reimbursementCents?: number | null;
  discountCents?: number | null;
  interestFineCents?: number | null;
}): number {
  const hours = Number(input.complementaryHours ?? 0);
  const rateCents = input.hourRateCents ?? 0;
  const complementaryCents =
    Number.isFinite(hours) && hours > 0 && rateCents > 0 ? Math.round(rateCents * hours) : 0;
  return (
    (input.totalAmountCents ?? 0) +
    complementaryCents +
    (input.benefitCents ?? 0) +
    (input.reimbursementCents ?? 0) -
    (input.discountCents ?? 0) +
    (input.interestFineCents ?? 0)
  );
}

/** Total a partir dos campos de formulário (strings de moeda / horas). */
export function computePayableFormTotalCents(form: {
  amount?: string;
  hourRate?: string;
  complementaryHours?: string;
  benefit?: string;
  reimbursement?: string;
  discount?: string;
  interestFine?: string;
}): number {
  const hoursRaw = String(form.complementaryHours ?? "").trim().replace(",", ".");
  const hours = hoursRaw === "" ? 0 : Number(hoursRaw);
  return computePayableTotalCents({
    totalAmountCents: moedaParaCentavos(form.amount ?? "") ?? 0,
    hourRateCents: moedaParaCentavos(form.hourRate ?? "") ?? 0,
    complementaryHours: Number.isFinite(hours) ? hours : 0,
    benefitCents: moedaParaCentavos(form.benefit ?? "") ?? 0,
    reimbursementCents: moedaParaCentavos(form.reimbursement ?? "") ?? 0,
    discountCents: moedaParaCentavos(form.discount ?? "") ?? 0,
    interestFineCents: moedaParaCentavos(form.interestFine ?? "") ?? 0,
  });
}
