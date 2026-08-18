/** Constantes compartilhadas da tela de Contas a Pagar. */

export const PAYABLE_STATUS_LABELS: Record<string, string> = {
  ABERTO: "Aberto",
  PAGO: "Pago",
  VENCIDO: "Atrasado",
  CANCELADO: "Cancelado",
  PENDENTE_APROVACAO: "Pendente aprovação",
};

export const PAYABLE_STATUS_BADGE_CLASS: Record<string, string> = {
  PAGO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELADO: "bg-red-100 text-red-800 border-red-200",
  VENCIDO: "bg-amber-100 text-amber-800 border-amber-200",
  ABERTO: "bg-slate-100 text-slate-700 border-slate-200",
  PENDENTE_APROVACAO: "bg-sky-100 text-sky-800 border-sky-200",
};

export const PAYABLE_ATTACHMENT_LABELS: Record<string, string> = {
  NOTA_FISCAL: "Nota fiscal",
  BOLETO: "Boleto",
  COMPROVANTE: "Comprovante",
  OUTRO: "Documento",
  DOCUMENTO: "Documento",
};

export const PAYABLE_ATTACHMENT_UPLOAD_CATEGORIES = [
  "NOTA_FISCAL",
  "BOLETO",
  "COMPROVANTE",
  "OUTRO",
] as const;

export const PAYABLE_FREQUENCY_LABELS: Record<string, string> = {
  MENSAL: "Mensal",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

export const PAYABLE_MONTH_OPTIONS = [
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
] as const;
