import { centsToDecimalString, moedaParaCentavos } from "@/lib/brFormatters";

/**
 * Tx hora sugerida quando a conta financeira tem o campo habilitado:
 * usa a taxa hora do cadastro do profissional e, sem ela, cai no Valor ÷ 168.
 * Retorna null quando não há sugestão (mantém o valor digitado).
 */
export function suggestedHourRateFormValue(input: {
  enableHourRate?: boolean;
  enableAmount?: boolean;
  professionalHourlyRate?: number | null;
  amount?: string;
}): string | null {
  if (!input.enableHourRate) return null;

  const userRate = Number(input.professionalHourlyRate);
  if (Number.isFinite(userRate) && userRate > 0) {
    return centsToDecimalString(Math.round(userRate * 100));
  }

  if (!input.enableAmount) return null;
  const amountCents = moedaParaCentavos(input.amount ?? "");
  if (amountCents == null) return "";
  return centsToDecimalString(Math.round(amountCents / 168));
}
