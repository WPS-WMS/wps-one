/** Chave Pix da WPS (CNPJ). */
export const WPS_PIX_CNPJ_FORMATTED = "40.392.929/0001-28";
export const WPS_PIX_CNPJ_KEY = "40392929000128";

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

/** CRC16-CCITT (0x1021) exigido pelo BR Code Pix. */
function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Formata centavos no padrão EMV Pix (campo 54): `558.70`. */
export function formatPixAmount(amountCents: number): string {
  const cents = Math.max(0, Math.round(amountCents));
  return (cents / 100).toFixed(2);
}

/**
 * Gera Pix copia e cola da WPS (chave = CNPJ).
 * Se `amountCents` for informado e > 0, o valor já vai no QR (campo 54).
 */
export function buildWpsStaticPixBrCode(params?: {
  merchantName?: string;
  merchantCity?: string;
  /** Mensalidade do tenant em centavos (ex.: 55870 → R$ 558,70). */
  amountCents?: number | null;
}): string {
  const merchantName = (params?.merchantName ?? "WPS ONE").slice(0, 25);
  const merchantCity = (params?.merchantCity ?? "SAO PAULO").slice(0, 15);
  const amountCents =
    params?.amountCents != null && Number.isFinite(params.amountCents)
      ? Math.max(0, Math.round(params.amountCents))
      : 0;
  const amountField = amountCents > 0 ? tlv("54", formatPixAmount(amountCents)) : "";
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", WPS_PIX_CNPJ_KEY);
  const payload =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    amountField +
    tlv("58", "BR") +
    tlv("59", merchantName) +
    tlv("60", merchantCity) +
    tlv("62", tlv("05", "***")) +
    "6304";
  return payload + crc16Ccitt(payload);
}

export function pixQrImageUrl(brCode: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(brCode)}`;
}
