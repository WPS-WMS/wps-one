import { apiFetch } from "@/lib/api";
import { unwrapPaginatedList } from "@/lib/financePaginated";

export type FinanceExportColumn = {
  key: string;
  header: string;
  width?: number;
};

const EXPORT_PAGE_LIMIT = 500;
const EXPORT_MAX_PAGES = 80; // 80 * 500 = 40k linhas

/** Busca todas as páginas da listagem filtrada (cap do backend = 500). */
export async function fetchAllFilteredFinanceRows<T>(opts: {
  path: string;
  buildFilterParams: () => URLSearchParams;
}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
    const params = opts.buildFilterParams();
    params.set("limit", String(EXPORT_PAGE_LIMIT));
    params.set("offset", String(page * EXPORT_PAGE_LIMIT));
    const res = await apiFetch(`${opts.path}?${params.toString()}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "Erro ao carregar dados para exportação.");
    }
    const pageData = unwrapPaginatedList<T>(body);
    all.push(...pageData.items);
    if (pageData.items.length === 0) break;
    if (all.length >= pageData.total) break;
    if (pageData.items.length < EXPORT_PAGE_LIMIT) break;
  }
  return all;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadFinanceExcel(opts: {
  sheetName: string;
  fileName: string;
  title: string;
  columns: FinanceExportColumn[];
  rows: Array<Record<string, string>>;
}): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName.slice(0, 31));

  sheet.getCell("A1").value = opts.title;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, Math.max(opts.columns.length, 1));

  const headerRowIndex = 3;
  const headerRow = sheet.getRow(headerRowIndex);
  opts.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF5C00E1" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  headerRow.commit();

  opts.rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + rowIdx);
    opts.columns.forEach((col, i) => {
      excelRow.getCell(i + 1).value = row[col.key] ?? "";
    });
    excelRow.commit();
  });

  opts.columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width ?? Math.max(12, col.header.length + 2);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    opts.fileName.endsWith(".xlsx") ? opts.fileName : `${opts.fileName}.xlsx`,
  );
}

/** Gera PDF via diálogo de impressão do navegador, sem abrir pop-up (evita bloqueio). */
export function printFinancePdf(opts: {
  title: string;
  subtitle?: string;
  columns: FinanceExportColumn[];
  rows: Array<Record<string, string>>;
}): void {
  const headCells = opts.columns
    .map((c) => `<th>${escapeHtml(c.header)}</th>`)
    .join("");
  const bodyRows = opts.rows
    .map(
      (row) =>
        `<tr>${opts.columns
          .map((c) => `<td>${escapeHtml(row[c.key] ?? "")}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { margin: 0 0 16px; color: #555; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #5c00e1; color: #fff; font-weight: 600; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 14px; font-size: 10px; color: #64748b; }
  </style>
</head>
<body>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ""}
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="${opts.columns.length}">Nenhum registro</td></tr>`}</tbody>
  </table>
  <p class="footer">WPS One — exportado em ${escapeHtml(new Date().toLocaleString("pt-BR"))} · ${opts.rows.length} registro(s)</p>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    throw new Error("Não foi possível preparar a impressão do PDF.");
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      // Remove após o diálogo de impressão (ou cancelamento).
      window.setTimeout(cleanup, 1000);
    }
  };

  // Aguarda o documento do iframe carregar antes de imprimir.
  if (frameDoc.readyState === "complete") {
    window.setTimeout(runPrint, 50);
  } else {
    iframe.addEventListener("load", () => window.setTimeout(runPrint, 50), { once: true });
  }
}

export function financeExportFileStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
