import DOMPurify from "dompurify";
import { prepareRichHtmlForDisplay } from "@/lib/linkifyContent";

export type TicketTaskPdfComment = {
  authorName: string;
  createdAt: string;
  contentHtml: string;
};

export type TicketTaskPdfBudget = {
  status: string;
  horas: number;
  observacao: string;
  rejectionReason?: string | null;
  sentByName?: string | null;
  sentAt?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
} | null;

export type TicketTaskPdfInput = {
  code: string;
  title: string;
  projectName?: string | null;
  statusLabel?: string | null;
  prioridade?: string | null;
  descriptionHtml: string;
  budget: TicketTaskPdfBudget;
  comments: TicketTaskPdfComment[];
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML seguro para o PDF: sem imagens/mídia (versão leve). */
export function sanitizeHtmlForTicketPdf(html: string): string {
  if (typeof window === "undefined") return String(html || "");
  const prepared = prepareRichHtmlForDisplay(html);
  return DOMPurify.sanitize(prepared, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: [
      "svg",
      "math",
      "iframe",
      "object",
      "embed",
      "script",
      "style",
      "link",
      "meta",
      "img",
      "video",
      "audio",
      "source",
      "picture",
      "canvas",
    ],
  });
}

function budgetStatusLabel(status: string): string {
  const s = String(status ?? "").toUpperCase();
  if (s === "AGUARDANDO_APROVACAO") return "Aguardando aprovação";
  if (s === "APROVADO") return "Aprovado";
  if (s === "REPROVADO") return "Reprovado";
  if (s === "NENHUM" || !s) return "Sem orçamento";
  return status;
}

function formatDateTime(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

/**
 * Abre o diálogo de impressão/salvar PDF do navegador (sem pop-up),
 * no mesmo padrão das exportações financeiras.
 */
export function printTicketTaskPdf(input: TicketTaskPdfInput): void {
  const descriptionBody = sanitizeHtmlForTicketPdf(input.descriptionHtml).trim();
  const descriptionHtml = descriptionBody
    ? descriptionBody
    : `<p class="empty">Sem descrição.</p>`;

  const budget = input.budget;
  const budgetStatus = String(budget?.status ?? "").toUpperCase();
  const hasBudget = Boolean(budget) && budgetStatus && budgetStatus !== "NENHUM";

  let budgetHtml: string;
  if (!hasBudget || !budget) {
    budgetHtml = `<p class="empty">Nenhum orçamento registrado.</p>`;
  } else {
    const rows = [
      `<tr><th>Status</th><td>${escapeHtml(budgetStatusLabel(budget.status))}</td></tr>`,
      `<tr><th>Horas</th><td>${escapeHtml(String(Number(budget.horas ?? 0)))}</td></tr>`,
      `<tr><th>Observação</th><td>${escapeHtml(String(budget.observacao ?? "").trim() || "—")}</td></tr>`,
      `<tr><th>Enviado por</th><td>${escapeHtml(
        [budget.sentByName, budget.sentAt ? formatDateTime(budget.sentAt) : ""]
          .filter(Boolean)
          .join(" • ") || "—",
      )}</td></tr>`,
      `<tr><th>Decidido por</th><td>${escapeHtml(
        [budget.decidedByName, budget.decidedAt ? formatDateTime(budget.decidedAt) : ""]
          .filter(Boolean)
          .join(" • ") || "—",
      )}</td></tr>`,
    ];
    if (budgetStatus === "REPROVADO") {
      rows.push(
        `<tr><th>Motivo</th><td>${escapeHtml(String(budget.rejectionReason ?? "").trim() || "—")}</td></tr>`,
      );
    }
    budgetHtml = `<table class="meta">${rows.join("")}</table>`;
  }

  const commentsHtml =
    input.comments.length === 0
      ? `<p class="empty">Nenhum comentário público.</p>`
      : input.comments
          .map((c) => {
            const body = sanitizeHtmlForTicketPdf(c.contentHtml).trim();
            return `<article class="comment">
  <header>
    <strong>${escapeHtml(c.authorName || "Usuário")}</strong>
    <span>${escapeHtml(formatDateTime(c.createdAt))}</span>
  </header>
  <div class="rich">${body || "<p class=\"empty\">(sem texto)</p>"}</div>
</article>`;
          })
          .join("");

  const metaRows = [
    input.code
      ? `<tr><th>Código</th><td>${escapeHtml(`#${input.code}`)}</td></tr>`
      : "",
    input.projectName
      ? `<tr><th>Projeto</th><td>${escapeHtml(input.projectName)}</td></tr>`
      : "",
    input.statusLabel
      ? `<tr><th>Status</th><td>${escapeHtml(input.statusLabel)}</td></tr>`
      : "",
    input.prioridade
      ? `<tr><th>Prioridade</th><td>${escapeHtml(input.prioridade)}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title || "Tarefa")}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 12px; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    h2 { font-size: 13px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; color: #1e293b; }
    p.sub { margin: 0 0 14px; color: #64748b; font-size: 11px; }
    table.meta { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
    table.meta th, table.meta td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
    table.meta th { width: 28%; background: #f8fafc; color: #475569; font-weight: 600; }
    .rich { word-break: break-word; }
    .rich p { margin: 0 0 8px; white-space: pre-wrap; }
    .rich ul, .rich ol { margin: 0 0 8px; padding-left: 1.25rem; }
    .rich a { color: #5c00e1; }
    .comment { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin: 0 0 10px; background: #fafafa; page-break-inside: avoid; }
    .comment header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 11px; color: #64748b; }
    .comment header strong { color: #0f172a; font-size: 12px; }
    .empty { color: #94a3b8; font-style: italic; margin: 0; }
    .note { margin-top: 8px; font-size: 10px; color: #64748b; }
    .footer { margin-top: 18px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.title || "Tarefa")}</h1>
  <p class="sub">WPS One — relatório da tarefa (comentários públicos)</p>
  ${metaRows ? `<table class="meta">${metaRows}</table>` : ""}

  <h2>Descrição</h2>
  <div class="rich">${descriptionHtml}</div>

  <h2>Orçamento</h2>
  ${budgetHtml}

  <h2>Comentários públicos (${input.comments.length})</h2>
  ${commentsHtml}
  <p class="note">Imagens e anexos não foram incluídos neste PDF.</p>

  <p class="footer">Exportado em ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p>
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
      window.setTimeout(cleanup, 1000);
    }
  };

  if (frameDoc.readyState === "complete") {
    window.setTimeout(runPrint, 50);
  } else {
    iframe.addEventListener("load", () => window.setTimeout(runPrint, 50), { once: true });
  }
}
