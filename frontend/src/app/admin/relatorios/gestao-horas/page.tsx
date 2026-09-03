"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canViewAllUsersInGestaoHorasReport } from "@/lib/featureNav";
import { EditTaskModalFull } from "@/components/EditTaskModalFull";
import {
  PayableCreateModal,
  type PayableCreatePrefill,
} from "@/components/finance/PayableCreateModal";
import { Download, FileText, ChevronDown, Wallet } from "lucide-react";
import {
  ReportsCard,
  ReportsEmpty,
  ReportsPageShell,
  reportsInputClass,
  reportsSecondaryBtnClass,
  reportsSelectClass,
} from "@/components/reports/ReportsPrimitives";
import { DatePicker } from "@/components/ui/DatePicker";
import { TruncatedHoverText } from "@/components/ui/TruncatedHoverText";

type UserOption = {
  id: string;
  name: string;
  ativo?: boolean;
  role?: string;
  hourlyRate?: number | null;
};
type UserRosterFilter = "ativos" | "inativos" | "todos";
type ProjectRosterFilter = "ativos" | "arquivados" | "todos";
type ApprovalFilter = "all" | "approved" | "pending";
type ProjectOption = {
  id: string;
  name: string;
  clientId?: string;
  client?: { id: string; name: string };
  arquivado?: boolean;
  horasMensaisAMS?: number | null;
};
type EntryRow = {
  id: string;
  date: string;
  horaInicio: string;
  horaFim: string;
  totalHoras: number;
  description?: string | null;
  user?: { id: string; name: string };
  project?: { id: string; name: string; client?: { id: string; name: string } };
  ticket?: { id: string; code: string; title: string } | null;
  approvalStatus?: "PENDING" | "APPROVED";
};

function isPendingEntry(row: EntryRow): boolean {
  return row.approvalStatus === "PENDING" || String(row.id).startsWith("pending:");
}

type PaginatedEntries = { items: EntryRow[]; nextCursor: string | null };

function fmtHours(n: number): string {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHorasContratadas(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  return fmtHours(hours);
}

function formatDateOnly(dateStr: string): string {
  // Evitar shift de fuso: `date` vem como ISO e pode renderizar "dia anterior" em timezone local.
  // Preferimos usar a parte YYYY-MM-DD da string.
  const ymd = (dateStr || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function parseYmdParts(dateStr: string): { y: number; m: number } | null {
  const ymd = (dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = parseInt(ymd.slice(0, 4), 10);
  const m = parseInt(ymd.slice(5, 7), 10);
  if (!Number.isFinite(y) || m < 1 || m > 12) return null;
  return { y, m };
}

function formatMonthYearLabel(year: number, month1to12: number): string {
  const mes = MESES_ABREV[month1to12 - 1] ?? "?";
  return `${mes}/${String(year).slice(-2)}`;
}

/** Meses do período filtrado (evita shift de fuso ao usar só `start`). */
function formatFilteredMonthsLabel(startStr: string, endStr: string): string {
  const start = parseYmdParts(startStr);
  if (!start) return "";
  const end = parseYmdParts(endStr) ?? start;
  const endKey = end.y * 12 + end.m;
  const labels: string[] = [];
  let y = start.y;
  let m = start.m;
  while (y * 12 + m <= endKey) {
    labels.push(formatMonthYearLabel(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return labels.join(", ");
}

function resolveExportHeaderMeta(
  projectId: string,
  projects: ProjectOption[],
  exportEntries: EntryRow[],
): { projetoLabel: string; horasContratadasLabel: string } {
  const selected = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const uniqueIds = Array.from(
    new Set(exportEntries.map((e) => e.project?.id).filter((id): id is string => !!id)),
  );
  const uniqueNames = Array.from(
    new Set(
      exportEntries
        .map((e) => e.project?.name)
        .filter((n): n is string => !!n && n.trim().length > 0),
    ),
  );

  let projetoLabel = "—";
  if (selected?.name) {
    projetoLabel = selected.name;
  } else if (uniqueNames.length === 1) {
    projetoLabel = uniqueNames[0];
  } else if (uniqueNames.length > 1) {
    projetoLabel = "Vários projetos";
  }

  const targetId = selected?.id ?? (uniqueIds.length === 1 ? uniqueIds[0] : undefined);
  const targetProject = targetId ? projects.find((p) => p.id === targetId) : undefined;
  const horasContratadasLabel = formatHorasContratadas(targetProject?.horasMensaisAMS);

  return { projetoLabel, horasContratadasLabel };
}

export default function RelatorioGestaoHorasPage() {
  const { user, can } = useAuth();
  const canFilterByUser = canViewAllUsersInGestaoHorasReport(user?.role, can);
  const canGerarContasPagar =
    String(user?.role ?? "").toUpperCase() === "SUPER_ADMIN" ||
    can("relatorios.gestaoHoras.gerarContasPagar");
  const [userId, setUserId] = useState("");
  const [userRosterFilter, setUserRosterFilter] = useState<UserRosterFilter>("todos");
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [projectRosterFilter, setProjectRosterFilter] = useState<ProjectRosterFilter>("ativos");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingPayable, setGeneratingPayable] = useState(false);
  const [payableModalOpen, setPayableModalOpen] = useState(false);
  const [payablePrefill, setPayablePrefill] = useState<PayableCreatePrefill | null>(null);
  const [hasFiltered, setHasFiltered] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const userAnchorRef = useRef<HTMLButtonElement | null>(null);
  const projectAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [userMenuRect, setUserMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [projectMenuRect, setProjectMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedTicketProjectName, setSelectedTicketProjectName] = useState<string>("");

  const ticketCacheRef = useRef<
    Map<
      string,
      {
        ts: number;
        value?: any;
        promise?: Promise<any>;
      }
    >
  >(new Map());
  const TICKET_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min

  function getCachedTicket(ticketId: string): any | null {
    const hit = ticketCacheRef.current.get(ticketId);
    if (!hit) return null;
    if (Date.now() - hit.ts > TICKET_CACHE_TTL_MS) {
      ticketCacheRef.current.delete(ticketId);
      return null;
    }
    return hit.value ?? null;
  }

  async function fetchTicketWithCache(ticketId: string): Promise<any | null> {
    const cached = getCachedTicket(ticketId);
    if (cached) return cached;

    const existing = ticketCacheRef.current.get(ticketId);
    if (existing?.promise) return existing.promise;

    const p = apiFetch(`/api/tickets/${ticketId}?light=true&noAvatar=true`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((full) => {
        if (full) {
          ticketCacheRef.current.set(ticketId, { ts: Date.now(), value: full });
        } else {
          ticketCacheRef.current.delete(ticketId);
        }
        return full;
      });

    ticketCacheRef.current.set(ticketId, { ts: Date.now(), promise: p });
    return p;
  }

  function prefetchTicket(ticketId: string | null | undefined) {
    const id = String(ticketId ?? "").trim();
    if (!id) return;
    // fire-and-forget
    void fetchTicketWithCache(id);
  }

  async function fetchAllEntriesForExport(): Promise<EntryRow[]> {
    const all: EntryRow[] = [];
    let cursor: string | null = null;
    // Guard rail: evita loop infinito por bug/instabilidade.
    const MAX_PAGES = 120; // 120 * 200 = 24k linhas
    for (let i = 0; i < MAX_PAGES; i++) {
      // Exportação precisa da descrição completa sempre (mesmo quando a listagem usa preview).
      const params = buildTimeEntriesParams({ ...(cursor ? { cursorId: cursor } : {}), includeDescription: "true" });
      const res = await apiFetch(`/api/time-entries?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as PaginatedEntries | EntryRow[] | null;
      if (Array.isArray(data)) {
        all.push(...data);
        break;
      }
      if (!data || !Array.isArray(data.items)) break;
      all.push(...data.items);
      cursor = data.nextCursor ?? null;
      if (!cursor) break;
    }
    return all;
  }

  useEffect(() => {
    apiFetch(
      `/api/users/for-select?scope=relatorios&status=${encodeURIComponent(userRosterFilter)}`,
    )
      .then((r) => r.json())
      .then((data: UserOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setUsers(list);
        setUserId((prev) => (prev && list.some((u) => u.id === prev) ? prev : ""));
      })
      .catch(() => setUsers([]));
  }, [userRosterFilter]);

  useEffect(() => {
    const qs =
      projectRosterFilter === "arquivados"
        ? "light=true&arquivado=true"
        : projectRosterFilter === "todos"
          ? "light=true&arquivado=todos"
          : "light=true";
    apiFetch(`/api/projects?${qs}`)
      .then((r) => r.json())
      .then((data: ProjectOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        setProjectId((prev) => (prev && list.some((p) => p.id === prev) ? prev : ""));
      })
      .catch(() => setProjects([]));
  }, [projectRosterFilter]);

  useEffect(() => {
    if (!start || !end) return;
    const timer = setTimeout(() => {
      setHasFiltered(true);
      setLoading(true);
      const params = buildTimeEntriesParams();
      apiFetch(`/api/time-entries?${params.toString()}`)
        .then((r) => r.json())
        .then((data: PaginatedEntries | EntryRow[]) => {
          if (Array.isArray(data)) {
            setEntries(data);
            setNextCursor(null);
            return;
          }
          setEntries(Array.isArray(data.items) ? data.items : []);
          setNextCursor(data.nextCursor ?? null);
        })
        .catch(() => {
          setEntries([]);
          setNextCursor(null);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtros disparam reload com debounce
  }, [start, end, userId, projectId, userRosterFilter, projectRosterFilter, approvalFilter]);

  const selectedUserLabel = useMemo(() => {
    if (!userId) return "Todos";
    return users.find((u) => u.id === userId)?.name ?? "Todos";
  }, [userId, users]);

  const selectedProjectLabel = useMemo(() => {
    if (!projectId) return "Todos";
    const p = projects.find((x) => x.id === projectId);
    if (!p) return "Todos";
    const base = `${p.client?.name ? `${p.client.name} – ` : ""}${p.name}`.trim() || "Todos";
    return p.arquivado ? `${base} (arquivado)` : base;
  }, [projectId, projects]);

  useEffect(() => {
    if (!userOpen) return;
    const update = () => {
      const el = userAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setUserMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [userOpen]);

  useEffect(() => {
    if (!projectOpen) return;
    const update = () => {
      const el = projectAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setProjectMenuRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [projectOpen]);

  useEffect(() => {
    if (!userOpen && !projectOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserOpen(false);
        setProjectOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const userAnchor = userAnchorRef.current;
      const projectAnchor = projectAnchorRef.current;
      const userMenu = document.getElementById("gestao-horas-user-menu");
      const projectMenu = document.getElementById("gestao-horas-project-menu");
      if (userOpen) {
        const inside =
          (userAnchor && target && userAnchor.contains(target)) || (userMenu && target && userMenu.contains(target));
        if (!inside) setUserOpen(false);
      }
      if (projectOpen) {
        const inside =
          (projectAnchor && target && projectAnchor.contains(target)) ||
          (projectMenu && target && projectMenu.contains(target));
        if (!inside) setProjectOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [userOpen, projectOpen]);

  function buildTimeEntriesParams(extra?: Record<string, string>) {
    const params = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end + "T23:59:59.999Z").toISOString(),
      light: "true",
      report: "gestao-horas",
      // Mantém páginas menores para reduzir payload e evitar OOM/502 na API.
      limit: "200",
      ...(extra ?? {}),
    });
    if (userId) params.set("userId", userId);
    if (projectId) params.set("projectId", projectId);
    if (userRosterFilter !== "todos") params.set("userStatus", userRosterFilter);
    if (projectRosterFilter !== "todos") params.set("projectStatus", projectRosterFilter);
    if (approvalFilter !== "all") params.set("approvalStatus", approvalFilter);
    // Só traz descrição quando o filtro já está “estreito” (reduz payload enorme no modo Todos).
    if (userId || projectId) params.set("includeDescription", "true");
    return params;
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoading(true);
    const params = buildTimeEntriesParams({ cursorId: nextCursor });
    apiFetch(`/api/time-entries?${params.toString()}`)
      .then((r) => r.json())
      .then((data: PaginatedEntries | EntryRow[]) => {
        if (Array.isArray(data)) {
          setEntries(data);
          setNextCursor(null);
          return;
        }
        setEntries((prev) => prev.concat(Array.isArray(data.items) ? data.items : []));
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const totalHoras = entries.reduce((s, e) => s + (isPendingEntry(e) ? 0 : e.totalHoras), 0);
  const totalHorasPendentes = entries.reduce((s, e) => s + (isPendingEntry(e) ? e.totalHoras : 0), 0);

  const selectedOnDemandUser = useMemo(() => {
    if (!userId) return null;
    const selected = users.find((u) => u.id === userId);
    if (!selected || String(selected.role ?? "").toUpperCase() !== "CONSULTOR_ONDEMAND") return null;
    return selected;
  }, [userId, users]);

  const showGerarContasPagar = canGerarContasPagar;
  const gerarContasPagarDisabled =
    generatingPayable || totalHoras <= 0 || !selectedOnDemandUser;
  const gerarContasPagarTitle = !selectedOnDemandUser
    ? "Selecione um consultor OnDemand no filtro de usuário para gerar a conta a pagar."
    : `Gera Nova conta com valor = taxa hora × total de horas do período (${fmtHours(totalHoras)} na página atual; o cálculo usa todas as horas filtradas).`;

  const canEditTarefa = can("tarefa.editar");

  async function handleGerarContasPagar() {
    if (!selectedOnDemandUser) return;
    const hourlyRate = Number(selectedOnDemandUser.hourlyRate);
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      alert(
        "O usuário selecionado não possui taxa hora cadastrada. Preencha a taxa hora em Configurações > Usuários.",
      );
      return;
    }
    setGeneratingPayable(true);
    try {
      const allEntries = await fetchAllEntriesForExport();
      const approvedEntries = allEntries.filter((row) => !isPendingEntry(row));
      const total = approvedEntries.reduce((sum, row) => sum + (row.totalHoras ?? 0), 0);
      if (total <= 0) {
        alert("Não há horas apontadas no período filtrado para gerar a conta a pagar.");
        return;
      }
      const amountCents = Math.round(hourlyRate * total * 100);
      if (amountCents <= 0) {
        alert("Valor calculado inválido. Verifique a taxa hora e o total de horas.");
        return;
      }
      setPayablePrefill({
        professionalUserId: selectedOnDemandUser.id,
        professionalName: selectedOnDemandUser.name,
        amountCents,
        dueDate: end || new Date().toISOString().slice(0, 10),
        categoryName: "Folha",
        hourRateCents: Math.round(hourlyRate * 100),
        description: `Horas OnDemand — ${selectedOnDemandUser.name} (${start} a ${end})`,
      });
      setPayableModalOpen(true);
    } finally {
      setGeneratingPayable(false);
    }
  }

  async function openTaskModal(row: EntryRow) {
    const t = row.ticket;
    if (!t?.id) return;
    setSelectedTicketProjectName(row.project?.name ?? "");
    const cached = getCachedTicket(t.id);
    if (cached) {
      setSelectedTicket(cached);
      return;
    }

    // Abre imediatamente com payload mínimo.
    setSelectedTicket({
      id: t.id,
      projectId: row.project?.id,
      code: t.code,
      title: t.title,
      // Mantém descrição vazia para a UI não "piscar" com texto errado.
      description: null,
    } as any);

    // Hidrata em background (preferencialmente já vindo do prefetch do hover).
    const full = await fetchTicketWithCache(t.id);
    if (!full) return;
    setSelectedTicket((prev: any | null) => {
      if (!prev || prev?.id !== t.id) return prev;
      return full;
    });
  }

  async function handleDownloadXlsx() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    setLoading(true);
    const exportEntries = await fetchAllEntriesForExport().finally(() => setLoading(false));
    if (exportEntries.length === 0) {
      alert("Não há dados para exportar para este filtro.");
      return;
    }
    const [{ default: ExcelJS }] = await Promise.all([import("exceljs")]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Gestão de horas");

    const mesLabel = formatFilteredMonthsLabel(start, end);
    const { projetoLabel, horasContratadasLabel } = resolveExportHeaderMeta(projectId, projects, exportEntries);
    const totalExportHoras = exportEntries
      .filter((e) => !isPendingEntry(e))
      .reduce((s, e) => s + (e.totalHoras ?? 0), 0);

    // Cabeçalho superior (começando na linha 2)
    sheet.getCell("A2").value = "Projeto:";
    sheet.getCell("B2").value = projetoLabel;
    sheet.getCell("A3").value = "Mês:";
    sheet.getCell("B3").value = mesLabel;
    sheet.getCell("A4").value = "Horas contratadas:";
    sheet.getCell("B4").value = horasContratadasLabel;
    sheet.getCell("A5").value = "Horas utilizadas:";
    sheet.getCell("B5").value = fmtHours(totalExportHoras);

    // Estilo das linhas de informação (fundo azul escuro e cinza, com bordas)
    const infoRows = [2, 3, 4, 5];
    for (const rowIdx of infoRows) {
      const labelCell = sheet.getCell(`A${rowIdx}`);
      const valueCell = sheet.getCell(`B${rowIdx}`);
      labelCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" }, // azul mais escuro
      };
      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5E7EB" }, // cinza claro
      };
      [labelCell, valueCell].forEach((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
    }

    // Tentar adicionar logo na planilha (canto superior direito)
    try {
      const logoResp = await fetch(`${window.location.origin}/logo-wps-2.png`);
      const logoBuffer = await logoResp.arrayBuffer();
      const imageId = workbook.addImage({
        buffer: logoBuffer,
        extension: "png",
      });
      sheet.addImage(imageId, {
        tl: { col: 4, row: 1 }, // coluna E, linha 2 (ao lado das infos)
        // Tamanho mais proporcional à nova arte (aprox. 2,5:1)
        ext: { width: 160, height: 64 },
      });
    } catch {
      // Se der erro na logo, seguimos sem imagem
    }

    // Duas linhas em branco após as informações e antes do cabeçalho da tabela
    const headerRowIndex = 8;
    const header = ["Data", "Colaborador", "Cliente", "Projeto", "ID", "Tarefa", "Horas", "Status", "Descrição"];
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = header;
    headerRow.height = 18;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" }, // azul WPS aproximado
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    // Largura das colunas
    const widths = [14, 20, 20, 22, 10, 34, 12, 22, 50];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    // Linhas de dados
    let currentRow = headerRowIndex + 1;
    for (const e of exportEntries) {
      const row = sheet.getRow(currentRow++);
      const data = formatDateOnly(e.date);
      const colaborador = e.user?.name ?? "";
      const cliente = e.project?.client?.name ?? "";
      const projeto = e.project?.name ?? "";
      const id = e.ticket?.code ?? "";
      const tarefa = e.ticket?.title ?? "";
      const horas = fmtHours(e.totalHoras);
      const status = isPendingEntry(e) ? "Aguardando aprovação" : "Aprovado";
      const descricao = e.description ?? "";
      row.values = [data, colaborador, cliente, projeto, id, tarefa, horas, status, descricao];
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gestao-horas-${start}-a-${end}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (entries.length === 0) {
      alert("Não há dados para exportar. Aplique os filtros primeiro.");
      return;
    }
    setLoading(true);
    fetchAllEntriesForExport()
      .then((exportEntries) => {
        if (exportEntries.length === 0) {
          alert("Não há dados para exportar para este filtro.");
          return;
        }
        const totalExportHoras = exportEntries
          .filter((e) => !isPendingEntry(e))
          .reduce((s, e) => s + (e.totalHoras ?? 0), 0);
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          alert("Permita pop-ups para gerar o PDF.");
          return;
        }
        // Logo do relatório (arquivo em public/logo-wps.png no frontend)
        const logoUrl = `${window.location.origin}/logo-wps.png`;

        const clienteNames = Array.from(
          new Set(
            exportEntries
              .map((e) => e.project?.client?.name)
              .filter((n): n is string => !!n && n.trim().length > 0),
          ),
        );
        const clienteLabel =
          clienteNames.length === 1 ? clienteNames[0] : clienteNames.length > 1 ? "Vários clientes" : "—";

        const mesLabel = formatFilteredMonthsLabel(start, end);
        const { projetoLabel, horasContratadasLabel } = resolveExportHeaderMeta(
          projectId,
          projects,
          exportEntries,
        );

        const rows = exportEntries
          .map((row) => {
            const tarefa = `${row.ticket?.code ?? ""} ${row.ticket?.title ?? ""}`.trim();
            const status = isPendingEntry(row) ? "Aguardando aprovação" : "Aprovado";
            return `<tr>
          <td>${(tarefa || "").replace(/</g, "&lt;")}</td>
          <td>${formatDateOnly(row.date)}</td>
          <td>${(row.user?.name ?? "").replace(/</g, "&lt;")}</td>
          <td>${fmtHours(row.totalHoras)}</td>
          <td>${status}</td>
          <td>${(row.description ?? "").replace(/</g, "&lt;")}</td>
        </tr>`;
          })
          .join("");
        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Gestão de horas - ${start} a ${end}</title>
          <style>
            @page { size: A4; margin: 18mm; }
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111827; }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
            }
            .header-left {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .header-logo {
              height: 50px;
            }
            h1 { font-size: 20px; margin: 0; color: #111827; }
            .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
            .meta { font-size: 11px; color: #374151; margin: 4px 0 12px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; }
            th {
              background: #111827;
              color: #f9fafb;
              font-weight: 600;
              font-size: 10px;
              text-transform: uppercase;
            }
            tr:nth-child(even) td { background: #f9fafb; }
            .total {
              margin-top: 8px;
              font-weight: 600;
            }
            .footer {
              margin-top: 8px;
              font-size: 10px;
              color: #9ca3af;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <img src="${logoUrl}" alt="WPS" class="header-logo" />
              <div>
                <h1>Gestão de horas</h1>
                <div class="subtitle">Relatório detalhado de apontamentos por usuário / projeto</div>
              </div>
            </div>
            <div style="font-size:10px;color:#6b7280;">
              Gerado em ${new Date().toLocaleString("pt-BR")}
            </div>
          </div>

          <table style="margin-bottom: 10px; border:none;">
            <tr>
              <td style="border:none; font-size:12px;">
                <strong>Cliente:</strong> ${escapeHtml(clienteLabel)}<br/>
                <strong>Projeto:</strong> ${escapeHtml(projetoLabel)}<br/>
                <strong>Mês:</strong> ${escapeHtml(mesLabel)}<br/>
                <strong>Horas contratadas:</strong> ${escapeHtml(horasContratadasLabel)}<br/>
                <strong>Horas utilizadas:</strong> ${fmtHours(totalExportHoras)}
              </td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Data</th>
                <th>Usuário</th>
                <th>Horas</th>
                <th>Status</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="total">Total apontado no período: ${fmtHours(totalExportHoras)}</p>
          <div class="footer">WPS One - WPS Warehouse Process Solutions</div>

          <script>
            window.addEventListener('load', function () {
              // Aguarda logo e tabela carregarem antes de imprimir
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
      })
      .finally(() => setLoading(false));
  }

  return (
    <>
      <ReportsPageShell
        title="Gestão de horas"
        subtitle="Lista de apontamentos com filtros por usuário, período, projeto e status de aprovação. Exportar Excel ou PDF."
      >
      {typeof document !== "undefined" && canFilterByUser && userOpen && userMenuRect
        ? createPortal(
            <div
              id="gestao-horas-user-menu"
              style={{
                position: "fixed",
                left: userMenuRect.left,
                top: userMenuRect.top,
                width: userMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto" role="listbox">
                <button
                  type="button"
                  onClick={() => {
                    setUserId("");
                    setUserOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setUserId(u.id);
                      setUserOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                      userId === u.id ? "font-semibold" : ""
                    }`}
                  >
                    {u.name}
                    {u.ativo === false ? (
                      <span className="ml-1 text-[color:var(--muted-foreground)] font-normal">(inativo)</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && projectOpen && projectMenuRect
        ? createPortal(
            <div
              id="gestao-horas-project-menu"
              style={{
                position: "fixed",
                left: projectMenuRect.left,
                top: projectMenuRect.top,
                width: projectMenuRect.width,
                zIndex: 10000,
              }}
            >
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--popover)] shadow-lg p-2 max-h-64 overflow-auto" role="listbox">
                <button
                  type="button"
                  onClick={() => {
                    setProjectId("");
                    setProjectOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-[color:var(--background)]/60 transition"
                >
                  Todos
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                {projects.map((p) => {
                  const label = `${p.client?.name ? `${p.client.name} – ` : ""}${p.name}`.trim();
                  const active = projectId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProjectId(p.id);
                        setProjectOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:var(--background)]/60 transition ${
                        active ? "font-semibold" : ""
                      }`}
                      title={label}
                    >
                      <span className="truncate block">
                        {label}
                        {p.arquivado ? (
                          <span className="ml-1 text-[color:var(--muted-foreground)] font-normal">(arquivado)</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="space-y-4">
          {/* Filtros */}
          <ReportsCard>
            <div className="p-4 flex flex-wrap items-end gap-4">
            {canFilterByUser ? (
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Usuário</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {(
                  [
                    { id: "ativos" as const, label: "Ativos" },
                    { id: "inativos" as const, label: "Inativos" },
                    { id: "todos" as const, label: "Todos" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setUserRosterFilter(opt.id);
                      setUserOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      userRosterFilter === opt.id
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-[color:var(--foreground)]"
                        : "border-[color:var(--border)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--background)]/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                ref={userAnchorRef}
                onClick={() => {
                  setProjectOpen(false);
                  setUserOpen((v) => !v);
                }}
                className={reportsSelectClass + " min-w-[220px] text-left inline-flex items-center justify-between gap-2"}
                aria-expanded={userOpen}
              >
                <span className="truncate">{selectedUserLabel}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${userOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)]">Período</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <DatePicker
                    value={start}
                    onChange={setStart}
                    buttonClassName={reportsInputClass}
                    clearable={false}
                    aria-label="Data inicial"
                  />
                </div>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>até</span>
                <div className="relative flex-1 min-w-[160px]">
                  <DatePicker
                    value={end}
                    onChange={setEnd}
                    buttonClassName={reportsInputClass}
                    clearable={false}
                    aria-label="Data final"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Projeto</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {(
                  [
                    { id: "ativos" as const, label: "Ativos" },
                    { id: "arquivados" as const, label: "Arquivados" },
                    { id: "todos" as const, label: "Todos" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setProjectRosterFilter(opt.id);
                      setProjectOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      projectRosterFilter === opt.id
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-[color:var(--foreground)]"
                        : "border-[color:var(--border)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--background)]/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                ref={projectAnchorRef}
                onClick={() => {
                  setUserOpen(false);
                  setProjectOpen((v) => !v);
                }}
                className={reportsSelectClass + " min-w-[260px] text-left inline-flex items-center justify-between gap-2"}
                aria-expanded={projectOpen}
              >
                <span className="truncate">{selectedProjectLabel}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${projectOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[color:var(--muted-foreground)] mb-1">Status</label>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: "all" as const, label: "Todos" },
                    { id: "approved" as const, label: "Aprovados" },
                    { id: "pending" as const, label: "Aguardando aprovação" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setApprovalFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      approvalFilter === opt.id
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-[color:var(--foreground)]"
                        : "border-[color:var(--border)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--background)]/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </ReportsCard>

          {/* Botões de download */}
          {hasFiltered && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={entries.length === 0}
                className={reportsSecondaryBtnClass + " gap-2"}
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadXlsx}
                disabled={entries.length === 0}
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
              {showGerarContasPagar ? (
                <button
                  type="button"
                  onClick={() => void handleGerarContasPagar()}
                  disabled={gerarContasPagarDisabled}
                  className={reportsSecondaryBtnClass + " gap-2 disabled:opacity-50 disabled:cursor-not-allowed"}
                  style={{
                    borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border))",
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}
                  title={gerarContasPagarTitle}
                >
                  <Wallet className="h-4 w-4" />
                  {generatingPayable ? "Preparando..." : "Gerar contas a pagar"}
                </button>
              ) : null}
            </div>
          )}

          {hasFiltered && nextCursor && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className={reportsSecondaryBtnClass}
                style={{ borderColor: "var(--border)", background: "transparent", color: "var(--foreground)" }}
              >
                {loading ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}

          {/* Grid */}
          <ReportsCard className="overflow-hidden">
            {!hasFiltered || loading ? (
              <ReportsEmpty>Carregando...</ReportsEmpty>
            ) : entries.length === 0 ? (
              <ReportsEmpty>
                {approvalFilter === "pending"
                  ? "Nenhum apontamento aguardando aprovação no período."
                  : "Nenhum apontamento no período."}
              </ReportsEmpty>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead style={{ background: "rgba(0,0,0,0.04)" }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Data</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Colaborador</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Projeto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Tarefa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Início</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Fim</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Hora total</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row) => {
                        const pending = isPendingEntry(row);
                        return (
                        <tr
                          key={row.id}
                          className="border-t"
                          style={{
                            borderColor: pending ? "rgba(217, 119, 6, 0.28)" : "var(--border)",
                            background: pending
                              ? "color-mix(in srgb, rgb(245 158 11) 22%, var(--surface))"
                              : undefined,
                            boxShadow: pending ? "inset 3px 0 0 rgb(217 119 6)" : undefined,
                          }}
                        >
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-[color:var(--foreground)]">{formatDateOnly(row.date)}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">{row.user?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            {pending ? (
                              <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                Aguardando aprovação
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                Aprovado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)]">{row.project?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm font-mono">
                            {(() => {
                              const code = row.ticket?.code ?? "—";
                              if (!row.ticket?.id || !row.ticket?.code) {
                                return <span className="text-[color:var(--muted-foreground)]">{code}</span>;
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() => void openTaskModal(row)}
                                  onMouseEnter={() => prefetchTicket(row.ticket?.id)}
                                  className="text-[color:var(--primary)] hover:underline"
                                  title="Abrir tarefa"
                                >
                                  {code}
                                </button>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-sm text-[color:var(--foreground)] max-w-[200px]">
                            <TruncatedHoverText text={row.ticket?.title} />
                          </td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)]">{row.horaInicio}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)]">{row.horaFim}</td>
                          <td className="px-4 py-3 text-sm text-right font-mono tabular-nums text-[color:var(--foreground)]">{fmtHours(row.totalHoras)}</td>
                          <td className="px-4 py-3 text-sm text-[color:var(--muted-foreground)] max-w-[240px]">
                            <TruncatedHoverText text={row.description} />
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t text-sm font-semibold flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.03)", color: "var(--foreground)" }}>
                  <span>Total apontado: {fmtHours(totalHoras)}</span>
                  {totalHorasPendentes > 0 ? (
                    <span className="font-semibold text-amber-800">
                      Aguardando aprovação: {fmtHours(totalHorasPendentes)}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </ReportsCard>
      </div>
      </ReportsPageShell>

      {selectedTicket && (
        <EditTaskModalFull
          ticket={selectedTicket}
          projectId={selectedTicket.projectId ?? undefined}
          projectName={selectedTicketProjectName}
          readOnly={!canEditTarefa}
          onClose={() => setSelectedTicket(null)}
          onSaved={() => setSelectedTicket(null)}
        />
      )}

      <PayableCreateModal
        open={payableModalOpen}
        prefill={payablePrefill}
        onClose={() => {
          setPayableModalOpen(false);
          setPayablePrefill(null);
        }}
        onCreated={() => {
          setPayableModalOpen(false);
          setPayablePrefill(null);
          alert("Conta a pagar criada com sucesso.");
        }}
      />
    </>
  );
}

