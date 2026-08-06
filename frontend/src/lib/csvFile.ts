/** BOM UTF-8 decodificado como Windows-1252 ("ï»¿"), comum em planilhas salvas pelo Excel. */
const BOM_AS_WINDOWS_1252 = "\u00EF\u00BB\u00BF";

/** Remove o BOM em qualquer das formas para não corromper o primeiro cabeçalho do CSV. */
export function stripBom(text: string): string {
  let out = text;
  if (out.startsWith("\uFEFF")) out = out.slice(1);
  if (out.startsWith(BOM_AS_WINDOWS_1252)) out = out.slice(BOM_AS_WINDOWS_1252.length);
  return out;
}

/**
 * Lê o CSV como texto tratando planilhas salvas em UTF-8 ou Windows-1252 (Excel pt-BR).
 * `utf8Hint` mantém UTF-8 quando o conteúdo esperado já está legível.
 */
export async function readCsvFileAsText(
  file: File,
  options?: { utf8Hint?: RegExp },
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const looksMojibake =
    /Ã.|Â./.test(utf8Text) && !(options?.utf8Hint?.test(utf8Text) ?? false);
  const text = looksMojibake ? new TextDecoder("windows-1252").decode(buffer) : utf8Text;
  return stripBom(text);
}

const CSV_SEPARATOR = ";";

export function isXlsxFile(file: File): boolean {
  return /\.xlsx$/i.test(file.name);
}

/** Célula vazia formatada como data no Excel virava 0 → 30/12/1899 ("00/01/1900"). */
const MIN_VALID_YEAR = 1950;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const EXCEL_SERIAL_MIN = 20000;
const EXCEL_SERIAL_MAX = 80000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_UTC + Math.round(serial) * 86400000);
}

/** Datas do .xlsx vêm em UTC; ler em UTC evita voltar um dia no fuso do navegador. */
function dateToBrDate(value: Date): string {
  return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
}

/**
 * Números de contrato como "01/2024" são convertidos pelo Excel em data (jan/24).
 * Reconstrói o texto original a partir do mês/ano.
 */
function dateToContractNumber(value: Date): string {
  return `${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
}

/** Desembrulha fórmula, rich text e hyperlink no valor efetivo da célula. */
function resolveCellValue(value: unknown): unknown {
  if (value == null || value instanceof Date) return value;
  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if ("error" in cell) return null;
    if ("result" in cell) return resolveCellValue(cell.result);
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => String((part as { text?: unknown }).text ?? "")).join("");
    }
    if ("text" in cell) return String(cell.text ?? "");
  }
  return value;
}

/** Converte o valor da célula do ExcelJS no texto que o importador do backend entende. */
function cellValueToText(value: unknown, asContractNumber = false): string {
  const resolved = resolveCellValue(value);
  if (resolved == null) return "";
  if (resolved instanceof Date) {
    // Descarta a data-zero do Excel para não importar vencimento em 1899.
    if (resolved.getUTCFullYear() < MIN_VALID_YEAR) return "";
    return asContractNumber ? dateToContractNumber(resolved) : dateToBrDate(resolved);
  }
  if (typeof resolved === "number") {
    // Contrato que o Excel converteu em data e ficou exibido como número de série.
    if (asContractNumber && resolved >= EXCEL_SERIAL_MIN && resolved <= EXCEL_SERIAL_MAX) {
      return dateToContractNumber(excelSerialToDate(resolved));
    }
    return String(resolved);
  }
  if (typeof resolved === "boolean") return String(resolved);
  if (typeof resolved === "string") return resolved;
  return String(resolved);
}

function escapeCsvCell(text: string): string {
  return /["\r\n]|;/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type XlsxReadOptions = {
  /**
   * Cabeçalhos cujas datas são, na verdade, número de contrato (ex.: "01/2024" que o
   * Excel converteu em jan/24). Nessas colunas a data volta para mês/ano.
   */
  contractNumberHeaders?: RegExp;
};

/**
 * Lê o .xlsx e devolve CSV equivalente usando o valor real de cada célula.
 * Imune à largura da coluna (o Excel exporta "#####" no CSV quando ela está estreita)
 * e a problemas de codificação/BOM.
 */
export async function readXlsxAsCsvText(
  file: File,
  options?: XlsxReadOptions,
): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets.find((item) => item.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) return "";

  const columnCount = Math.max(sheet.columnCount, 1);
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      values.push(row.getCell(column).value);
    }
    rows.push(values);
  });
  if (rows.length === 0) return "";

  const contractColumns = new Set<number>();
  const headerPattern = options?.contractNumberHeaders;
  if (headerPattern) {
    rows[0]!.forEach((value, index) => {
      if (headerPattern.test(cellValueToText(value).trim())) contractColumns.add(index);
    });
  }

  return rows
    .map((values) =>
      values
        .map((value, index) =>
          escapeCsvCell(cellValueToText(value, contractColumns.has(index)).trim()),
        )
        .join(CSV_SEPARATOR),
    )
    .join("\r\n");
}

/**
 * Lê planilha de importação financeira.
 * Só .xlsx: no CSV o Excel grava `#####` quando a coluna está estreita;
 * no .xlsx lemos o valor real da célula.
 */
export async function readImportFileAsCsvText(
  file: File,
  options?: XlsxReadOptions,
): Promise<string> {
  if (!isXlsxFile(file)) {
    throw new Error("Envie um arquivo Excel (.xlsx). CSV não é aceito (datas estreitas viram #####).");
  }
  return readXlsxAsCsvText(file, options);
}
