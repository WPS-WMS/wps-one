import { moedaParaCentavos } from "@/lib/brFormatters";

/** Espelha `computePayableTotalCents` do backend. */
export function computePayableTotalCents(input: {
  totalAmountCents?: number | null;
  hourRateCents?: number | null;
  complementaryHours?: number | null;
  complementaryCents?: number | null;
  benefitCents?: number | null;
  reimbursementCents?: number | null;
  discountCents?: number | null;
  interestFineCents?: number | null;
}): number {
  let complementaryCents = input.complementaryCents ?? null;
  if (complementaryCents == null) {
    const hours = Number(input.complementaryHours ?? 0);
    const rateCents = input.hourRateCents ?? 0;
    if (Number.isFinite(hours) && hours > 0 && rateCents > 0) {
      complementaryCents = Math.round(rateCents * hours);
    } else {
      complementaryCents = 0;
    }
  }
  return (
    (input.totalAmountCents ?? 0) +
    complementaryCents +
    (input.benefitCents ?? 0) +
    (input.reimbursementCents ?? 0) -
    (input.discountCents ?? 0) +
    (input.interestFineCents ?? 0)
  );
}

/** Total a partir dos campos de formulário (strings de moeda). H. compl. em R$. */
export function computePayableFormTotalCents(form: {
  amount?: string;
  hourRate?: string;
  complementaryHours?: string;
  benefit?: string;
  reimbursement?: string;
  discount?: string;
  interestFine?: string;
}): number {
  return computePayableTotalCents({
    totalAmountCents: moedaParaCentavos(form.amount ?? "") ?? 0,
    hourRateCents: moedaParaCentavos(form.hourRate ?? "") ?? 0,
    complementaryCents: moedaParaCentavos(form.complementaryHours ?? "") ?? 0,
    benefitCents: moedaParaCentavos(form.benefit ?? "") ?? 0,
    reimbursementCents: moedaParaCentavos(form.reimbursement ?? "") ?? 0,
    discountCents: moedaParaCentavos(form.discount ?? "") ?? 0,
    interestFineCents: moedaParaCentavos(form.interestFine ?? "") ?? 0,
  });
}
