/** Nomes seguros para pastas no SharePoint (remove caracteres inválidos). */
export function sanitizeSharePointFolderName(raw: string, maxLen = 120): string {
  const cleaned = String(raw ?? "")
    .replace(/[\\/:*?"<>|#%{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
  if (!cleaned) return "Sem nome";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trim()}…` : cleaned;
}

export function projectSharePointFolderName(clientName: string, projectName: string): string {
  return sanitizeSharePointFolderName(`${clientName} - ${projectName}`);
}

export function ticketSharePointFolderName(code: string, title: string): string {
  return sanitizeSharePointFolderName(`${code} - ${title}`);
}
