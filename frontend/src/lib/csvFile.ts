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
