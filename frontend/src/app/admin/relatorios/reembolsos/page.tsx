"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRelatorioReembolsos } from "@/lib/featureNav";
import { Link } from "@/components/Link";
import {
  ReportsCard,
  ReportsCardHeader,
  ReportsEmpty,
  ReportsPageShell,
  reportsPrimaryBtnClass,
  reportsSecondaryBtnClass,
} from "@/components/reports/ReportsPrimitives";
import { ChevronDown, Download, FileText, Filter, Receipt, X } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";

/** Datas: igual à Lista de Tarefas (filtros avançados). */
const LISTA_DATE_CLASS =
  "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30";

/** Gatilho dos filtros Membro/Status na Lista de Tarefas (sem `<select>` nativo — o menu é o portal). */
const LISTA_TRIGGER_CLASS =
  "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-2.5 px-3 text-sm text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 text-left inline-flex items-center justify-between gap-2";

type UserOption = { id: string; name: string; role?: string };
type TypeOption = { id: string; name: string };
type ProjectOption = { id: string; name: string; client?: { name: string } };

type Row = {
  id: string;
  createdAt: string;
  expenseDate?: string | null;
  amountCents: number;
  description: string;
  paymentTo?: "EMPRESA" | "CONSULTOR" | null;
  user: { id: string; name: string; email?: string };
  project: { id: string; name: string; client?: { id: string; name: string } | null };
  type: { id: string; name: string };
  attachments: Array<{ id: string; filename: string; fileType: string; fileSize: number; createdAt: string }>;
};

function fmtBrlFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDateTime(iso: string) {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentToLabel(value: string | null | undefined): string {
  if (value === "EMPRESA") return "Empresa";
  if (value === "CONSULTOR") return "Consultor";
  return "—";
}

const REPORT_DESCRIPTION_MAX_LEN = 10;

function fmtDescriptionPreview(text: string | null | undefined, maxLen = REPORT_DESCRIPTION_MAX_LEN): string {
  const s = String(text ?? "").trim();
  if (!s) return "—";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  const ymd = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function RelatorioReembolsosPage() {
  const { user, can, permissionsReady } = useAuth();
  const pathname = usePathname();
  const roleUpper = String(user?.role ?? "").toUpperCase();
  /** Escopo global: gestor/financeiro padrão ou permissão relatorios.reembolsosVerTodos na Gestão de perfis. */
  const canSeeAll =
    roleUpper === "SUPER_ADMIN" ||
    roleUpper === "GESTOR_PROJETOS" ||
    roleUpper === "FINANCEIRO" ||
    can("relatorios.reembolsosVerTodos");

  const relatoriosBase = useMemo(() => {
    if (pathname.startsWith("/gestor")) return "/gestor";
    if (pathname.startsWith("/consultor")) return "/consultor";
    return "/admin";
  }, [pathname]);

  const canAccessReport = useMemo(() => {
    if (!user) return false;
    return user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || canAccessRelatorioReembolsos(can);
  }, [user, can]);

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState<string>("");
  const [typeId, setTypeId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiltered, setHasFiltered] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const userAnchorRef = useRef<HTMLButtonElement | null>(null);
  const typeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [userMenuRect, setUserMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [typeMenuRect, setTypeMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [projectMenuRect, setProjectMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!userMenuOpen && !typeMenuOpen && !projectMenuOpen) return;
    const update = () => {
      if (userMenuOpen && userAnchorRef.current) {
        const r = userAnchorRef.current.getBoundingClientRect();
        setUserMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
      }
      if (typeMenuOpen && typeAnchorRef.current) {
        const r = typeAnchorRef.current.getBoundingClientRect();
        setTypeMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
      }
      if (projectMenuOpen && projectAnchorRef.current) {
        const r = projectAnchorRef.current.getBoundingClientRect();
        setProjectMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [userMenuOpen, typeMenuOpen, projectMenuOpen]);

  useEffect(() => {
    if (!userMenuOpen && !typeMenuOpen && !projectMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setTypeMenuOpen(false);
        setProjectMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const userMenu = document.getElementById("reemb-user-menu-portal");
      const typeMenu = document.getElementById("reemb-type-menu-portal");
      const projectMenu = document.getElementById("reemb-project-menu-portal");
      if (userMenuOpen) {
        const inside =
          (userAnchorRef.current && target && userAnchorRef.current.contains(target)) ||
          (userMenu && target && userMenu.contains(target));
        if (!inside) setUserMenuOpen(false);
      }
      if (typeMenuOpen) {
        const inside =
          (typeAnchorRef.current && target && typeAnchorRef.current.contains(target)) ||
          (typeMenu && target && typeMenu.contains(target));
        if (!inside) setTypeMenuOpen(false);
      }
      if (projectMenuOpen) {
        const inside =
          (projectAnchorRef.current && target && projectAnchorRef.current.contains(target)) ||
          (projectMenu && target && projectMenu.contains(target));
        if (!inside) setProjectMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [userMenuOpen, typeMenuOpen, projectMenuOpen]);

  useEffect(() => {
    apiFetch("/api/reimbursements/types")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setTypes(Array.isArray(list) ? list : []))
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    if (!canSeeAll) return;
    apiFetch("/api/users/for-select")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, [canSeeAll]);

  useEffect(() => {
    const url = canSeeAll ? "/api/projects?light=true" : "/api/reimbursements/eligible-projects";
    apiFetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        const opts: ProjectOption[] = list
          .map((p: any) => ({
            id: String(p?.id ?? "").trim(),
            name: String(p?.name ?? "").trim() || "—",
            client: p?.client?.name ? { name: String(p.client.name) } : undefined,
          }))
          .filter((p) => p.id);
        opts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        setProjects(opts);
      })
      .catch(() => setProjects([]));
  }, [canSeeAll]);

  const selectedUserLabel = useMemo(() => {
    if (!canSeeAll) return user?.name ?? "—";
    if (!userId) return "Todos";
    return users.find((u) => u.id === userId)?.name ?? "Todos";
  }, [canSeeAll, user?.name, userId, users]);

  const selectedTypeLabel = useMemo(() => {
    if (!typeId) return "Todos";
    return types.find((t) => t.id === typeId)?.name ?? "Todos";
  }, [typeId, types]);

  const selectedProjectLabel = useMemo(() => {
    if (!projectId) return "Todos";
    const p = projects.find((x) => x.id === projectId);
    if (!p) return "Todos";
    return p.client?.name ? `${p.name} · ${p.client.name}` : p.name;
  }, [projectId, projects]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (canSeeAll && userId) params.set("userId", userId);
      if (typeId) params.set("typeId", typeId);
      if (projectId) params.set("projectId", projectId);
      const res = await apiFetch(`/api/reimbursements/report?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Erro ao carregar relatório");
      setRows(Array.isArray(body) ? body : []);
      setHasFiltered(true);
    } catch (e: unknown) {
      setRows([]);
      setHasFiltered(true);
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }

  async function openAttachment(attId: string, filename: string) {
    const res = await apiFetchBlob(`/api/reimbursements/attachments/${encodeURIComponent(attId)}/file`);
    if (!res.ok) {
      setError("Não foi possível baixar o anexo.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "anexo";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const totalCents = useMemo(() => rows.reduce((s, r) => s + (Number.isFinite(r.amountCents) ? r.amountCents : 0), 0), [rows]);

  async function handleDownloadXlsx() {
    if (rows.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    const [{ default: ExcelJS }] = await Promise.all([import("exceljs")]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Reembolsos");

    sheet.getCell("A2").value = "Período:";
    sheet.getCell("B2").value = `${fmtDateOnly(start)} a ${fmtDateOnly(end)}`;
    sheet.getCell("A3").value = "Usuário:";
    sheet.getCell("B3").value = selectedUserLabel;
    sheet.getCell("A4").value = "Tipo:";
    sheet.getCell("B4").value = selectedTypeLabel;
    sheet.getCell("A5").value = "Projeto:";
    sheet.getCell("B5").value = selectedProjectLabel;
    sheet.getCell("A6").value = "Total:";
    sheet.getCell("B6").value = fmtBrlFromCents(totalCents);

    const infoRows = [2, 3, 4, 5, 6];
    for (const rowIdx of infoRows) {
      const labelCell = sheet.getCell(`A${rowIdx}`);
      const valueCell = sheet.getCell(`B${rowIdx}`);
      labelCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      [labelCell, valueCell].forEach((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
    }

    try {
      const logoResp = await fetch(`${window.location.origin}/logo-wps-2.png`);
      const logoBuffer = await logoResp.arrayBuffer();
      const imageId = workbook.addImage({ buffer: logoBuffer, extension: "png" });
      sheet.addImage(imageId, { tl: { col: 4, row: 1 }, ext: { width: 160, height: 64 } });
    } catch {
      // segue sem logo
    }

    const headerRowIndex = 9;
    const header = [
      "Usuário",
      "E-mail",
      "Data solicitação",
      "Data da despesa",
      "Cliente",
      "Projeto",
      "Tipo",
      "Valor (R$)",
      "Descrição",
      "Pagamento para",
      "Anexos",
    ];
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = header;
    headerRow.height = 18;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    const widths = [22, 28, 20, 16, 22, 22, 18, 14, 50, 16, 40];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    let currentRow = headerRowIndex + 1;
    for (const r of rows) {
      const row = sheet.getRow(currentRow++);
      const valor = (Number.isFinite(r.amountCents) ? r.amountCents : 0) / 100;
      const anexos = (r.attachments ?? []).map((a) => a.filename).join("; ");
      row.values = [
        r.user.name ?? "",
        r.user.email ?? "",
        fmtDateTime(r.createdAt),
        fmtDateOnly(r.expenseDate),
        r.project.client?.name ?? "",
        r.project.name ?? "",
        r.type.name ?? "",
        valor,
        r.description ?? "",
        paymentToLabel(r.paymentTo),
        anexos,
      ];
      const valorCell = row.getCell(8);
      valorCell.numFmt = '"R$" #,##0.00';
      valorCell.alignment = { horizontal: "right" };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });
    }

    const totalRow = sheet.getRow(currentRow);
    totalRow.getCell(7).value = "Total";
    totalRow.getCell(7).font = { bold: true };
    totalRow.getCell(7).alignment = { horizontal: "right" };
    totalRow.getCell(8).value = totalCents / 100;
    totalRow.getCell(8).numFmt = '"R$" #,##0.00';
    totalRow.getCell(8).font = { bold: true };
    totalRow.getCell(8).alignment = { horizontal: "right" };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reembolsos-${start}-a-${end}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (rows.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Permita pop-ups para gerar o PDF.");
      return;
    }
    const logoUrl = `${window.location.origin}/logo-wps.png`;
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tbody = rows
      .map((r) => {
        const cliente = r.project.client?.name ?? "";
        const anexos = (r.attachments ?? []).map((a) => a.filename).join(", ");
        return `<tr>
          <td>${escape(r.user.name ?? "")}</td>
          <td>${escape(fmtDateTime(r.createdAt))}</td>
          <td>${escape(fmtDateOnly(r.expenseDate))}</td>
          <td>${escape(cliente)}${cliente ? " — " : ""}${escape(r.project.name ?? "")}</td>
          <td>${escape(r.type.name ?? "")}</td>
          <td style="text-align:right;">${escape(fmtBrlFromCents(r.amountCents))}</td>
          <td>${escape(r.description ?? "")}</td>
          <td>${escape(paymentToLabel(r.paymentTo))}</td>
          <td>${escape(anexos)}</td>
        </tr>`;
      })
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório de Reembolsos - ${escape(start)} a ${escape(end)}</title>
          <style>
            @page { size: A4 landscape; margin: 14mm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #111827; }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
            }
            .header-left { display: flex; align-items: center; gap: 10px; }
            .header-logo { height: 50px; }
            h1 { font-size: 18px; margin: 0; color: #111827; }
            .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
            .meta { font-size: 11px; color: #374151; margin: 4px 0 12px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; vertical-align: top; }
            th {
              background: #1E3A5F;
              color: #f9fafb;
              font-weight: 600;
              font-size: 9px;
              text-transform: uppercase;
            }
            tr:nth-child(even) td { background: #f9fafb; }
            .total { margin-top: 8px; font-weight: 600; text-align: right; }
            .footer { margin-top: 8px; font-size: 10px; color: #9ca3af; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <img src="${logoUrl}" alt="WPS" class="header-logo" />
              <div>
                <h1>Relatório de Reembolsos</h1>
                <div class="subtitle">Lista de solicitações de reembolso por período</div>
              </div>
            </div>
            <div style="font-size:10px;color:#6b7280;">
              Gerado em ${escape(new Date().toLocaleString("pt-BR"))}
            </div>
          </div>

          <table style="margin-bottom: 10px; border:none;">
            <tr>
              <td style="border:none; font-size:11px;">
                <strong>Período:</strong> ${escape(fmtDateOnly(start))} a ${escape(fmtDateOnly(end))}<br/>
                <strong>Usuário:</strong> ${escape(selectedUserLabel)}<br/>
                <strong>Tipo:</strong> ${escape(selectedTypeLabel)}<br/>
                <strong>Projeto:</strong> ${escape(selectedProjectLabel)}<br/>
                <strong>Registros:</strong> ${rows.length}
              </td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Solicitação</th>
                <th>Data despesa</th>
                <th>Projeto</th>
                <th>Tipo</th>
                <th style="text-align:right;">Valor</th>
                <th>Descrição</th>
                <th>Pagamento para</th>
                <th>Anexos</th>
              </tr>
            </thead>
            <tbody>${tbody}</tbody>
          </table>
          <p class="total">Total no período: ${escape(fmtBrlFromCents(totalCents))}</p>
          <div class="footer">WPS One - WPS Warehouse Process Solutions</div>

          <script>
            window.addEventListener('load', function () {
              setTimeout(function () {
                window.print();
                window.close();
              }, 400);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  }

  if (!user || !permissionsReady) {
    return (
      <ReportsPageShell title="Relatório de Reembolsos" subtitle="Filtre por período, usuário, tipo e projeto.">
        <div className="flex items-center justify-center min-h-[40vh] text-sm text-[color:var(--muted-foreground)]">
          Carregando…
        </div>
      </ReportsPageShell>
    );
  }

  if (!canAccessReport) {
    return (
      <ReportsPageShell
        title="Relatório de Reembolsos"
        subtitle="Relatórios · Reembolsos"
      >
        <ReportsCard>
          <div className="px-5 py-8 text-center max-w-lg mx-auto">
            <div className="text-xs font-semibold text-[color:var(--muted-foreground)] tracking-wider">Sem permissão</div>
            <h2 className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">Não pode ver este relatório</h2>
            <p className="mt-3 text-sm text-[color:var(--muted-foreground)] leading-relaxed">
              O seu perfil não inclui permissão para aceder a <strong>Relatórios · Reembolsos</strong>. Um administrador
              pode ativar a funcionalidade <strong>Relatórios &gt; Reembolsos</strong> em{" "}
              <strong>Gestão de perfis</strong>.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`${relatoriosBase}/relatorios`}
                className={reportsSecondaryBtnClass + " gap-2"}
                style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
              >
                Voltar aos relatórios
              </Link>
            </div>
          </div>
        </ReportsCard>
      </ReportsPageShell>
    );
  }

  return (
    <ReportsPageShell
      title="Relatório de Reembolsos"
      subtitle="Filtre por período, usuário, tipo e projeto. Exportar Excel ou PDF."
    >
      {error ? (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}>
          {error}
        </div>
      ) : null}

      {typeof document !== "undefined" && canSeeAll && userMenuOpen && userMenuRect
        ? createPortal(
            <div
              id="reemb-user-menu-portal"
              style={{
                position: "fixed",
                left: userMenuRect.left,
                top: userMenuRect.top,
                width: userMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserId("");
                    setUserMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {users.map((u) => {
                  const active = userId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setUserId(u.id);
                        setUserMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && typeMenuOpen && typeMenuRect
        ? createPortal(
            <div
              id="reemb-type-menu-portal"
              style={{
                position: "fixed",
                left: typeMenuRect.left,
                top: typeMenuRect.top,
                width: typeMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    setTypeId("");
                    setTypeMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {types.map((t) => {
                  const active = typeId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTypeId(t.id);
                        setTypeMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && projectMenuOpen && projectMenuRect
        ? createPortal(
            <div
              id="reemb-project-menu-portal"
              style={{
                position: "fixed",
                left: projectMenuRect.left,
                top: projectMenuRect.top,
                width: projectMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto"
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    setProjectId("");
                    setProjectMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {projects.map((p) => {
                  const active = projectId === p.id;
                  const label = p.client?.name ? `${p.name} · ${p.client.name}` : p.name;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProjectId(p.id);
                        setProjectMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <ReportsCard className="overflow-visible">
        <ReportsCardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              Filtros
            </span>
          }
        />

        <div
          className="p-4 md:p-5 border-t"
          style={{
            borderColor: "var(--border)",
            background: "linear-gradient(135deg, rgba(92,0,225,0.08), rgba(0,0,0,0.02))",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <label className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">De</span>
              <DatePicker
                value={start}
                onChange={setStart}
                buttonClassName={LISTA_DATE_CLASS}
                clearable={false}
                aria-label="Data inicial"
              />
            </label>

            <label className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Até</span>
              <DatePicker
                value={end}
                onChange={setEnd}
                buttonClassName={LISTA_DATE_CLASS}
                clearable={false}
                aria-label="Data final"
              />
            </label>

            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Usuário</span>
              {canSeeAll ? (
                <button
                  ref={userAnchorRef}
                  type="button"
                  onClick={() => {
                    setTypeMenuOpen(false);
                    setProjectMenuOpen(false);
                    setUserMenuOpen((v) => !v);
                  }}
                  className={LISTA_TRIGGER_CLASS}
                  title={selectedUserLabel}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="min-w-0 truncate text-left">{selectedUserLabel}</span>
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] opacity-60" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className={`${LISTA_TRIGGER_CLASS} cursor-default opacity-80`}
                  title={selectedUserLabel}
                >
                  <span className="min-w-0 truncate text-left">{selectedUserLabel}</span>
                </button>
              )}
            </div>

            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Tipo</span>
              <button
                ref={typeAnchorRef}
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setProjectMenuOpen(false);
                  setTypeMenuOpen((v) => !v);
                }}
                className={LISTA_TRIGGER_CLASS}
                title={selectedTypeLabel}
                aria-expanded={typeMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="min-w-0 truncate text-left">{selectedTypeLabel}</span>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] opacity-60" aria-hidden />
              </button>
            </div>

            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] mb-1">Projeto</span>
              <button
                ref={projectAnchorRef}
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setTypeMenuOpen(false);
                  setProjectMenuOpen((v) => !v);
                }}
                className={LISTA_TRIGGER_CLASS}
                title={selectedProjectLabel}
                aria-expanded={projectMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="min-w-0 truncate text-left">{selectedProjectLabel}</span>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-[color:var(--muted-foreground)] opacity-60" aria-hidden />
              </button>
            </div>
          </div>

          <div className="px-4 pb-4 pt-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-xs text-[color:var(--muted-foreground)]">
              {hasFiltered ? <span>{rows.length} registro(s)</span> : <span>Defina os filtros e clique em Filtrar.</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setStart(d.toISOString().slice(0, 10));
                  setEnd(new Date().toISOString().slice(0, 10));
                  setUserId("");
                  setTypeId("");
                  setProjectId("");
                  setRows([]);
                  setHasFiltered(false);
                  setError(null);
                  setUserMenuOpen(false);
                  setTypeMenuOpen(false);
                  setProjectMenuOpen(false);
                }}
                className={reportsSecondaryBtnClass + " gap-2"}
                style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
                disabled={loading}
              >
                <X className="h-4 w-4" />
                Limpar
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className={reportsPrimaryBtnClass + " gap-2"}
                style={{ background: "var(--primary)" }}
                disabled={loading}
              >
                <Filter className="h-4 w-4" />
                {loading ? "Filtrando..." : "Filtrar"}
              </button>
            </div>
          </div>
        </div>
      </ReportsCard>

      {hasFiltered && rows.length > 0 ? (
        <div className="mt-5 mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className={reportsSecondaryBtnClass + " gap-2"}
            style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
          >
            <FileText className="h-4 w-4" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadXlsx()}
            className={reportsSecondaryBtnClass + " gap-2"}
            style={{
              borderColor: "rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.10)",
              color: "rgb(16 185 129)",
            }}
          >
            <Download className="h-4 w-4" />
            Download Excel
          </button>
          <span className="ml-auto text-xs text-[color:var(--muted-foreground)]">
            Total: <strong className="text-[color:var(--foreground)]">{fmtBrlFromCents(totalCents)}</strong>
          </span>
        </div>
      ) : (
        <div className="mt-4" />
      )}

      <ReportsCard className="overflow-hidden">
        <ReportsCardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Receipt className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              Resultados
            </span>
          }
        />

        {!hasFiltered ? (
          <ReportsEmpty>Use os filtros acima para carregar o relatório.</ReportsEmpty>
        ) : rows.length === 0 ? (
          <ReportsEmpty>Nenhum resultado encontrado para os filtros.</ReportsEmpty>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Usuário</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Data solicitação</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Data da despesa</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Projeto</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Tipo</th>
                  <th className="text-right px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Valor</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Descrição</th>
                  <th className="text-left px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: "var(--border)" }}>Pagamento para</th>
                  <th className="text-left px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>Anexo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const firstAtt = r.attachments?.[0] ?? null;
                  return (
                    <tr key={r.id} className="hover:bg-[color:var(--background)]/40">
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <div className="min-w-0">
                          <p className="font-semibold text-[color:var(--foreground)] truncate" title={r.user.name}>{r.user.name}</p>
                          {r.user.email ? <p className="text-xs text-[color:var(--muted-foreground)] truncate">{r.user.email}</p> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[color:var(--foreground)]">{fmtDateTime(r.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[color:var(--foreground)]">{fmtDateOnly(r.expenseDate)}</p>
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[color:var(--foreground)] font-medium">{r.project.name}</p>
                        {r.project.client?.name ? <p className="text-xs text-[color:var(--muted-foreground)]">{r.project.client.name}</p> : null}
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>{r.type.name}</td>
                      <td className="px-4 py-3 border-b text-right tabular-nums" style={{ borderColor: "var(--border)" }}>{fmtBrlFromCents(r.amountCents)}</td>
                      <td className="px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                        <span
                          className="block cursor-help underline decoration-dotted decoration-[color:var(--muted-foreground)]/50 underline-offset-2"
                          title={r.description?.trim() ? r.description : undefined}
                        >
                          {fmtDescriptionPreview(r.description)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                        {paymentToLabel(r.paymentTo)}
                      </td>
                      <td className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                        {firstAtt ? (
                          <button
                            type="button"
                            onClick={() => void openAttachment(firstAtt.id, firstAtt.filename)}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
                            style={{
                              borderColor: "rgba(92,0,225,0.35)",
                              background: "linear-gradient(135deg, rgba(92,0,225,0.12), rgba(0,0,0,0.01))",
                              color: "var(--foreground)",
                            }}
                            title="Baixar anexo"
                          >
                            <Download className="h-4 w-4" />
                            <span className="truncate max-w-[240px]">{firstAtt.filename}</span>
                            {r.attachments.length > 1 ? (
                              <span className="text-[10px] text-[color:var(--muted-foreground)]">+{r.attachments.length - 1}</span>
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-xs text-[color:var(--muted-foreground)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReportsCard>
    </ReportsPageShell>
  );
}

