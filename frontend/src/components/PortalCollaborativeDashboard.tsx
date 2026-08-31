"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileStack,
  Gift,
  ImagePlus,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  PartyPopper,
  Plus,
  Sparkles,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, apiFetchBlob, publicFileUrl } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ThemeToggleInline } from "@/components/ThemeToggle";
import { PortalPdfLibrary } from "@/components/PortalPdfLibrary";

type PortalSection = {
  id: string;
  title: string;
  slug: string;
  order: number;
};

type PortalItem = {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata?: unknown;
  createdAt?: string;
};

type PortalEvent = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
};

function portalEventDateKey(date: string): string {
  const d = new Date(String(date ?? "").trim());
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayDateKey(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const day = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function portalEventInCalendarMonth(date: string, year: number, month: number): boolean {
  const d = new Date(String(date ?? "").trim());
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
}

function isBeforeCurrentCalendarMonth(year: number, month: number): boolean {
  const t = new Date();
  const cy = t.getFullYear();
  const cm = t.getMonth() + 1;
  if (year < cy) return true;
  if (year > cy) return false;
  return month < cm;
}

type Birthday = {
  id: string;
  name: string;
  birthDate: string | null;
  cargo?: string | null;
  avatarUrl?: string | null;
};

function PortalFeedbackModal(props: {
  type: "BUG" | "MELHORIA";
  description: string;
  files: File[];
  sending: boolean;
  error: string | null;
  sent: boolean;
  onClose: () => void;
  onChangeType: (v: "BUG" | "MELHORIA") => void;
  onChangeDescription: (v: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (idx: number) => void;
  onSubmit: () => void;
}) {
  const overlayPointerDownRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
        overlayPointerDownRef.current = false;
        if (shouldClose) props.onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-[color:var(--foreground)]">Enviar bug ou sugestão</h3>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Sua mensagem será enviada para o time WPS. Se possível, anexe prints.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl p-2 text-[color:var(--muted-foreground)] hover:bg-black/5"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {props.sent && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[color:var(--foreground)]">
              Enviado com sucesso. Obrigado pelo feedback.
            </div>
          )}
          {props.error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[color:var(--foreground)]">
              {props.error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-[color:var(--muted-foreground)] mb-2">Tipo</label>
              <select
                value={props.type}
                onChange={(e) => props.onChangeType(e.target.value === "MELHORIA" ? "MELHORIA" : "BUG")}
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35"
                disabled={props.sending}
              >
                <option value="BUG">Bug / Erro</option>
                <option value="MELHORIA">Melhoria / Sugestão</option>
              </select>
            </div>
            <div className="sm:text-right">
              <label className="block text-sm font-semibold text-[color:var(--muted-foreground)] mb-2">Imagens</label>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={props.sending || props.files.length >= 5}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/25 px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] hover:bg-black/5 disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" />
                Adicionar prints ({props.files.length}/5)
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  props.onAddFiles(list);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[color:var(--muted-foreground)] mb-2">
              Descrição <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-[color:var(--muted-foreground)]">
                ({props.description.length}/8000)
              </span>
            </label>
            <textarea
              value={props.description}
              onChange={(e) => props.onChangeDescription(e.target.value.slice(0, 8000))}
              rows={5}
              disabled={props.sending}
              className="w-full resize-y rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--foreground)]/45 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/35 disabled:cursor-not-allowed disabled:bg-[color:var(--background)]/35 disabled:text-[color:var(--foreground)]/70 disabled:placeholder:text-[color:var(--foreground)]/40"
              placeholder="Descreva o bug ou a melhoria. Informe passos para reproduzir, resultado esperado e o que aconteceu."
            />
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              Mínimo de 10 caracteres. Se possível, inclua passos para reproduzir e o resultado esperado.
            </p>
          </div>

          {props.files.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[color:var(--muted-foreground)]">Arquivos</div>
              <div className="space-y-2">
                {props.files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/18 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[color:var(--foreground)]">{f.name}</div>
                      <div className="text-xs text-[color:var(--muted-foreground)]">
                        {Math.round(f.size / 1024)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onRemoveFile(idx)}
                      disabled={props.sending}
                      className="rounded-xl p-2 text-[color:var(--muted-foreground)] hover:bg-black/5 disabled:opacity-60"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--border)] bg-[color:var(--background)]/18 px-6 py-4">
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.sending}
            className="rounded-2xl border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] hover:bg-black/5 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onSubmit}
            disabled={props.sending}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95 disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            {props.sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SLUG = {
  news: "noticias",
  newsletter: "newsletter",
  employee: "colaborador-do-mes",
  awards: "premios",
  manuals: "manuais",
  politicaDespesa: "politica-despesa",
  politicaLgpd: "politica-lgpd",
  documentosRh: "documentos-rh",
  institucional: "institucional",
  templates: "templates",
  biblioteca: "biblioteca",
} as const;

/** Slugs cujos itens são carregados no dashboard (seções de conteúdo do portal). */
const PORTAL_ITEM_SLUGS: readonly string[] = [
  SLUG.news,
  SLUG.newsletter,
  SLUG.employee,
  SLUG.awards,
  SLUG.manuals,
  SLUG.politicaDespesa,
  SLUG.politicaLgpd,
  SLUG.documentosRh,
  SLUG.institucional,
  SLUG.templates,
  SLUG.biblioteca,
];

type PortalMainViewName = "empresa" | "admin" | "manuais" | "templates" | "biblioteca";

/** Seções necessárias por view: o portal só busca o que a aba aberta usa. */
const PORTAL_VIEW_SLUGS: Record<PortalMainViewName, readonly string[]> = {
  empresa: [SLUG.news, SLUG.newsletter, SLUG.employee, SLUG.awards],
  manuais: [SLUG.manuals],
  templates: [SLUG.templates],
  biblioteca: [SLUG.biblioteca],
  admin: [SLUG.politicaDespesa, SLUG.politicaLgpd, SLUG.documentosRh, SLUG.institucional],
};

const ADMIN_PORTAL_SUBSECTIONS: readonly { slug: string; label: string }[] = [
  { slug: SLUG.politicaDespesa, label: "Política de despesa" },
  { slug: SLUG.politicaLgpd, label: "Política LGPD" },
  { slug: SLUG.documentosRh, label: "Documentos de RH" },
  { slug: SLUG.institucional, label: "Institucional" },
];

type PortalMainView = PortalMainViewName;

/** Seções com modal simples de uma imagem (substituir arquivo). */
const PORTAL_IMAGE_SECTION_SLUGS = new Set<string>([SLUG.employee]);

const PORTAL_IMAGE_DEFAULT_TITLE: Record<string, string> = {
  [SLUG.employee]: "WPSer do mês",
};

type InspirationRank = 1 | 2 | 3;

type InspirationSlotDraft = {
  id: string | null;
  name: string;
  cargo: string;
  points: string;
  imageUrl: string;
};

type EmployeeImageFit = "contain" | "cover";

function parseEmployeeImageFit(metadata: unknown): EmployeeImageFit {
  if (!metadata || typeof metadata !== "object") return "contain";
  const raw = (metadata as Record<string, unknown>).fit;
  return raw === "cover" || raw === "contain" ? raw : "contain";
}

function parseEmployeeFocal(metadata: unknown): { x: number; y: number } {
  if (!metadata || typeof metadata !== "object") return { x: 50, y: 50 };
  const o = metadata as Record<string, unknown>;
  const x = Number(o.focalX ?? o.focal_x);
  const y = Number(o.focalY ?? o.focal_y);
  return {
    x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
    y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
  };
}

function buildEmployeeImageMetadata(prev: unknown, patch: { fit?: EmployeeImageFit; focalX?: number; focalY?: number }): Record<string, unknown> {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  if (patch.fit) base.fit = patch.fit;
  if (patch.focalX !== undefined) base.focalX = patch.focalX;
  if (patch.focalY !== undefined) base.focalY = patch.focalY;
  return base;
}

function parseInspirationMeta(item: PortalItem): { rank: InspirationRank; points: number | null; cargo: string } | null {
  if (String(item.type || "").toLowerCase() !== "inspiration") return null;
  const meta = item.metadata;
  if (!meta || typeof meta !== "object") return null;
  const r = Number((meta as Record<string, unknown>).rank);
  if (r !== 1 && r !== 2 && r !== 3) return null;
  const rawPts = (meta as Record<string, unknown>).points;
  const points =
    rawPts === undefined || rawPts === null || rawPts === ""
      ? null
      : Number(rawPts);
  const cargo = String((meta as Record<string, unknown>).cargo ?? "");
  return {
    rank: r as InspirationRank,
    points: points != null && Number.isFinite(points) ? points : null,
    cargo,
  };
}

function inspirationItemByRank(items: PortalItem[]): Record<InspirationRank, PortalItem | null> {
  const out: Record<InspirationRank, PortalItem | null> = { 1: null, 2: null, 3: null };
  for (const it of items) {
    const p = parseInspirationMeta(it);
    if (p) out[p.rank] = it;
  }
  return out;
}

function emptyInspirationSlots(): Record<InspirationRank, InspirationSlotDraft> {
  const blank = (): InspirationSlotDraft => ({
    id: null,
    name: "",
    cargo: "",
    points: "",
    imageUrl: "",
  });
  return { 1: blank(), 2: blank(), 3: blank() };
}

function slotsFromAwardItems(items: PortalItem[]): Record<InspirationRank, InspirationSlotDraft> {
  const base = emptyInspirationSlots();
  const by = inspirationItemByRank(items);
  (["1", "2", "3"] as const).forEach((k) => {
    const rank = Number(k) as InspirationRank;
    const it = by[rank];
    if (!it) return;
    const meta = parseInspirationMeta(it);
    base[rank] = {
      id: it.id,
      name: it.title || "",
      cargo: meta?.cargo ?? "",
      points: meta?.points != null ? String(meta.points) : "",
      imageUrl: it.content?.trim() || "",
    };
  });
  return base;
}

const WPS_ONE_ICON_SVG_SRC = "/WPS%20One%20%C3%ADcone.svg";

/** Texto de referência exibido no card de notícias (substitui título + link no portal). */
function parseNewsMarker(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const o = metadata as Record<string, unknown>;
  const m = o.marker ?? o.marcador;
  return typeof m === "string" ? m.trim() : "";
}

function parseNewsPdfUrl(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const o = metadata as Record<string, unknown>;
  const u = o.pdfUrl ?? o.pdf_url ?? o.pdf;
  return typeof u === "string" ? u.trim() : "";
}

/** Capa opcional no carrossel (diferente da imagem principal em `content`). */
function parseNewsCoverUrl(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const o = metadata as Record<string, unknown>;
  const u = o.coverUrl ?? o.cover_url;
  return typeof u === "string" ? u.trim() : "";
}

const NEWS_ALL_PERIODS = "todas";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/**
 * Mês da notícia no formato `YYYY-MM`. Usa o mês de referência informado no
 * cadastro e, na falta dele, o mês em que a notícia foi publicada.
 */
function newsPeriodKey(item: PortalItem): string {
  const meta = item.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const raw = (meta as Record<string, unknown>).referenceMonth ?? (meta as Record<string, unknown>).reference_month;
    if (typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.trim())) return raw.trim();
  }
  return String(item.createdAt ?? "").slice(0, 7);
}

function newsPeriodLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const label = MONTH_LABELS[(month ?? 0) - 1];
  return label && year ? `${label} ${year}` : key;
}

function currentReferenceMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function newsPdfIsOnPortalDiskPath(raw: string): boolean {
  const s = String(raw || "").trim();
  if (s.startsWith("/uploads/portal/")) return true;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      return new URL(s).pathname.startsWith("/uploads/portal/");
    } catch {
      return false;
    }
  }
  return false;
}

function newsDisplayCaption(item: PortalItem): string {
  const t = String(item.title || "").trim();
  if (t) return t;
  const fromMeta = parseNewsMarker(item.metadata);
  if (fromMeta) return fromMeta;
  return "";
}

/** Foco da imagem de notícia (object-position em %). */
function parseNewsFocal(metadata: unknown): { x: number; y: number } {
  if (!metadata || typeof metadata !== "object") return { x: 50, y: 50 };
  const o = metadata as Record<string, unknown>;
  const x = Number(o.focalX ?? o.focal_x);
  const y = Number(o.focalY ?? o.focal_y);
  return {
    x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
    y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
  };
}

function newsObjectPosition(metadata: unknown): string {
  const { x, y } = parseNewsFocal(metadata);
  return `${x}% ${y}%`;
}

function buildNewsMetadata(
  prev: unknown,
  patch: {
    focalX?: number;
    focalY?: number;
    marker?: string;
    pdfUrl?: string | null;
    coverUrl?: string | null;
    referenceMonth?: string;
  },
): Record<string, unknown> {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  if (patch.focalX !== undefined) base.focalX = patch.focalX;
  if (patch.focalY !== undefined) base.focalY = patch.focalY;
  if (patch.marker !== undefined) {
    const m = patch.marker.trim();
    if (m) base.marker = m;
    else delete base.marker;
  }
  if (patch.pdfUrl !== undefined) {
    const u = (patch.pdfUrl || "").trim();
    if (u) base.pdfUrl = u;
    else delete base.pdfUrl;
  }
  if (patch.coverUrl !== undefined) {
    const c = (patch.coverUrl || "").trim();
    if (c) base.coverUrl = c;
    else delete base.coverUrl;
  }
  if (patch.referenceMonth !== undefined) {
    const rm = patch.referenceMonth.trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(rm)) base.referenceMonth = rm;
    else delete base.referenceMonth;
  }
  delete base.href;
  return base;
}

function isImageItem(item: PortalItem): boolean {
  const t = String(item.type || "").toLowerCase();
  if (t === "image") return true;
  const c = item.content.trim();
  return (
    /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?|$)/i.test(c) ||
    c.startsWith("/uploads/") ||
    c.startsWith("data:image/")
  );
}

function isInspirationItem(item: PortalItem): boolean {
  return parseInspirationMeta(item) != null;
}

function PodiumMedal({ rank, size = "md" }: { rank: InspirationRank; size?: "sm" | "md" }) {
  const ring =
    rank === 1
      ? "from-amber-300 via-amber-400 to-amber-600"
      : rank === 2
        ? "from-slate-200 via-slate-300 to-slate-500"
        : "from-amber-700 via-orange-800 to-amber-950";
  const sm = size === "sm";
  return (
    <div
      className={`pointer-events-none absolute right-0 top-0 z-20 flex flex-col items-center ${
        sm ? "translate-x-[14%] -translate-y-[14%]" : "translate-x-[12%] -translate-y-[12%]"
      }`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-gradient-to-br ${ring} shadow-lg ring-2 ring-white/40 ${
          sm ? "h-5 w-5 ring-1" : "h-7 w-7 ring-1"
        }`}
        aria-hidden
      >
        <span className={`font-black tabular-nums text-white drop-shadow ${sm ? "text-[8px]" : "text-[10px]"}`}>
          {rank}
        </span>
      </div>
      <div
        className={`rounded-b-sm bg-gradient-to-b from-red-600 to-red-800 shadow-sm ${sm ? "-mt-px h-1 w-2.5" : "-mt-0.5 h-1.5 w-3"}`}
        aria-hidden
      />
    </div>
  );
}

function isNewsImageFileType(f: File): boolean {
  const t = String(f.type || "").toLowerCase();
  return t === "image/png" || t === "image/jpeg" || t === "image/jpg" || t === "image/webp";
}

function isNewsPdfFileType(f: File): boolean {
  return String(f.type || "").toLowerCase() === "application/pdf";
}

export function PortalCollaborativeDashboard() {
  const { user, can, logout } = useAuth();
  const router = useRouter();
  const canEdit = useMemo(() => can("portal.corporativo.editar"), [can]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"BUG" | "MELHORIA">("BUG");
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [sections, setSections] = useState<PortalSection[]>([]);
  const [itemsBySlug, setItemsBySlug] = useState<Record<string, PortalItem[]>>({});
  const [events, setEvents] = useState<PortalEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<PortalEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calendarFilterEngaged, setCalendarFilterEngaged] = useState(false);
  const isSelectedCurrentMonth = useMemo(() => {
    const today = new Date();
    return calMonth === today.getMonth() + 1 && calYear === today.getFullYear();
  }, [calMonth, calYear]);

  const isSelectedPastCalendarMonth = useMemo(
    () => isBeforeCurrentCalendarMonth(calYear, calMonth),
    [calYear, calMonth],
  );

  const eventsForSelectedMonth = useMemo(
    () => events.filter((ev) => portalEventInCalendarMonth(ev.date, calYear, calMonth)),
    [events, calYear, calMonth],
  );

  /** No mês atual (sem interação no filtro): oculta eventos já passados. */
  const displayedMonthEvents = useMemo(() => {
    const list = eventsForSelectedMonth;
    const showAllInPeriod =
      isSelectedPastCalendarMonth || !isSelectedCurrentMonth || calendarFilterEngaged;
    if (showAllInPeriod) return list;
    const today = todayDateKey();
    return list.filter((ev) => {
      const key = portalEventDateKey(ev.date);
      return key && key >= today;
    });
  }, [
    eventsForSelectedMonth,
    isSelectedPastCalendarMonth,
    isSelectedCurrentMonth,
    calendarFilterEngaged,
  ]);

  const [newsPageIndex, setNewsPageIndex] = useState(0);
  const [newsPeriod, setNewsPeriod] = useState<string | null>(null);
  const [newsReferenceMonth, setNewsReferenceMonth] = useState<string>(() => currentReferenceMonth());

  const [manageSlug, setManageSlug] = useState<string | null>(null);
  const [manageEventsOpen, setManageEventsOpen] = useState(false);
  const [portalView, setPortalView] = useState<PortalMainView>("empresa");
  const [adminTab, setAdminTab] = useState<string>(SLUG.politicaDespesa);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<PortalItem | null>(null);
  const portalImageFileInputRef = useRef<HTMLInputElement>(null);
  const newsAddAnyFileInputRef = useRef<HTMLInputElement>(null);
  const overlayPointerDownRef = useRef(false);
  const [newsNewFiles, setNewsNewFiles] = useState<File[]>([]);
  const [newsSelectedThumbKey, setNewsSelectedThumbKey] = useState<string | null>(null);
  const [newsSelectedPdfKey, setNewsSelectedPdfKey] = useState<string | null>(null);
  const [newsFocalX, setNewsFocalX] = useState(50);
  const [newsFocalY, setNewsFocalY] = useState(50);
  const [newsReplaceThumbId, setNewsReplaceThumbId] = useState<string | null>(null);
  const [newsReplacePdfId, setNewsReplacePdfId] = useState<string | null>(null);
  const [newsTitleDrafts, setNewsTitleDrafts] = useState<Record<string, string>>({});
  const inspirationFileInputRef = useRef<HTMLInputElement>(null);
  const [inspirationUploadRank, setInspirationUploadRank] = useState<InspirationRank | null>(null);
  const [inspirationSlots, setInspirationSlots] = useState<Record<InspirationRank, InspirationSlotDraft>>(emptyInspirationSlots);

  const [newsLightboxItem, setNewsLightboxItem] = useState<PortalItem | null>(null);
  const [newsExpandedPdfBlobUrl, setNewsExpandedPdfBlobUrl] = useState<string | null>(null);
  const [newsExpandedPdfLoading, setNewsExpandedPdfLoading] = useState(false);

  const [newsCoverFile, setNewsCoverFile] = useState<File | null>(null);
  const newsCoverInputRef = useRef<HTMLInputElement>(null);
  const [newsReplaceCoverId, setNewsReplaceCoverId] = useState<string | null>(null);

  const [employeeImageFit, setEmployeeImageFit] = useState<EmployeeImageFit>("contain");
  const [employeeFocalX, setEmployeeFocalX] = useState(50);
  const [employeeFocalY, setEmployeeFocalY] = useState(50);

  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [savingEv, setSavingEv] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);

  const sectionIdBySlug = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sections) m[s.slug] = s.id;
    return m;
  }, [sections]);

  const newsItems = itemsBySlug[SLUG.news] ?? [];
  const employeeItems = itemsBySlug[SLUG.employee] ?? [];
  const awardItems = itemsBySlug[SLUG.awards] ?? [];

  /** Imagem atual no modal simples (WPSer do mês). */
  const currentManageImageItem = useMemo(() => {
    if (manageSlug !== SLUG.employee) return null;
    const imgs = (itemsBySlug[SLUG.employee] ?? []).filter(isImageItem);
    return imgs[0] ?? null;
  }, [manageSlug, itemsBySlug]);

  useEffect(() => {
    if (manageSlug !== SLUG.employee) return;
    const it = currentManageImageItem;
    const fit = it ? parseEmployeeImageFit(it.metadata) : "contain";
    const focal = it ? parseEmployeeFocal(it.metadata) : { x: 50, y: 50 };
    setEmployeeImageFit(fit);
    setEmployeeFocalX(focal.x);
    setEmployeeFocalY(focal.y);
  }, [manageSlug, currentManageImageItem]);

  const newsImageItems = useMemo(() => newsItems.filter(isImageItem), [newsItems]);

  /** Meses com notícias, do mais recente para o mais antigo. */
  const newsPeriods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of newsImageItems) {
      const key = newsPeriodKey(item);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, count]) => ({ key, count, label: newsPeriodLabel(key) }));
  }, [newsImageItems]);

  // Abre no mês mais recente que tenha notícias; os anteriores ficam no seletor.
  useEffect(() => {
    if (newsPeriods.length === 0) return;
    setNewsPeriod((current) => {
      if (current === NEWS_ALL_PERIODS) return current;
      if (current && newsPeriods.some((p) => p.key === current)) return current;
      return newsPeriods[0]!.key;
    });
  }, [newsPeriods]);

  const newsCarousel = useMemo(() => {
    if (!newsPeriod || newsPeriod === NEWS_ALL_PERIODS) return newsImageItems;
    return newsImageItems.filter((item) => newsPeriodKey(item) === newsPeriod);
  }, [newsImageItems, newsPeriod]);

  useEffect(() => {
    setNewsPageIndex(0);
  }, [newsPeriod]);

  const loadedSlugsRef = useRef<Set<string>>(new Set());
  const calRef = useRef({ month: calMonth, year: calYear });
  useEffect(() => {
    calRef.current = { month: calMonth, year: calYear };
  }, [calMonth, calYear]);

  const loadCalendarMeta = useCallback(async (month: number, year: number) => {
    const res = await apiFetch(`/api/portal/events?month=${month}&year=${year}`);
    if (!res.ok) {
      setEvents([]);
      setBirthdays([]);
      return;
    }
    const data = (await res.json()) as { events: PortalEvent[]; birthdays: Birthday[] };
    setEvents(Array.isArray(data.events) ? data.events : []);
    setBirthdays(Array.isArray(data.birthdays) ? data.birthdays : []);
  }, []);

  /** Seções + itens numa só requisição, mesclando com o que já está em memória. */
  const loadBootstrap = useCallback(async (slugs: readonly string[]) => {
    const query = encodeURIComponent(slugs.join(","));
    const res = await apiFetch(`/api/portal/bootstrap?slugs=${query}`);
    if (!res.ok) throw new Error("Não foi possível carregar o portal.");
    const data = (await res.json()) as {
      sections: PortalSection[];
      itemsBySlug: Record<string, PortalItem[]>;
    };
    setSections(Array.isArray(data.sections) ? data.sections : []);
    setItemsBySlug((prev) => ({ ...prev, ...(data.itemsBySlug ?? {}) }));
    for (const slug of slugs) loadedSlugsRef.current.add(slug);
  }, []);

  const loadUpcomingEvents = useCallback(async () => {
    const res = await apiFetch("/api/portal/events?upcoming=1&limit=3");
    if (!res.ok) {
      setUpcomingEvents([]);
      return;
    }
    const data = (await res.json()) as { events: PortalEvent[] };
    setUpcomingEvents(Array.isArray(data?.events) ? data.events : []);
  }, []);

  /** Recarrega o que já foi carregado (usado depois de criar/editar/excluir). */
  const refreshAll = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const slugs = Array.from(
        new Set<string>([...PORTAL_VIEW_SLUGS.empresa, ...loadedSlugsRef.current]),
      );
      const { month, year } = calRef.current;
      await Promise.all([
        loadBootstrap(slugs),
        loadUpcomingEvents(),
        loadCalendarMeta(month, year),
      ]);
      setNewsPageIndex(0);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [loadBootstrap, loadUpcomingEvents, loadCalendarMeta]);

  // Carga inicial: só as seções da tela da empresa + próximos eventos.
  // Os eventos/aniversários do mês vêm do efeito de calendário abaixo.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      setLoading(true);
      try {
        await Promise.all([loadBootstrap(PORTAL_VIEW_SLUGS.empresa), loadUpcomingEvents()]);
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBootstrap, loadUpcomingEvents]);

  useEffect(() => {
    void loadCalendarMeta(calMonth, calYear);
  }, [calMonth, calYear, loadCalendarMeta]);

  // Abas de documentos carregam sob demanda, na primeira vez que são abertas.
  useEffect(() => {
    const pending = (PORTAL_VIEW_SLUGS[portalView] ?? []).filter(
      (slug) => !loadedSlugsRef.current.has(slug),
    );
    if (pending.length === 0) return;
    void loadBootstrap(pending).catch(() => {
      /* mantém a tela utilizável; o erro reaparece no próximo refresh */
    });
  }, [portalView, loadBootstrap]);

  useEffect(() => {
    const pageCount = Math.max(1, newsCarousel.length);
    setNewsPageIndex((i) => Math.min(i, pageCount - 1));
  }, [newsCarousel.length]);

  useEffect(() => {
    if (manageSlug !== SLUG.news) return;
    const imgs = newsItems.filter(isImageItem);
    setNewsTitleDrafts((prev) => {
      const next = { ...prev };
      const ids = new Set(imgs.map((i) => i.id));
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      for (const it of imgs) {
        if (next[it.id] === undefined) next[it.id] = String(it.title || "").trim();
      }
      return next;
    });
  }, [manageSlug, newsItems]);

  useEffect(() => {
    if (!newsLightboxItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewsLightboxItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newsLightboxItem]);

  useEffect(() => {
    if (!newsLightboxItem) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [newsLightboxItem]);

  useEffect(() => {
    const item = newsLightboxItem;
    if (!item) {
      setNewsExpandedPdfBlobUrl(null);
      setNewsExpandedPdfLoading(false);
      return;
    }
    const raw = parseNewsPdfUrl(item.metadata);
    if (!raw) {
      setNewsExpandedPdfBlobUrl(null);
      setNewsExpandedPdfLoading(false);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    setNewsExpandedPdfLoading(true);
    setNewsExpandedPdfBlobUrl(null);

    void (async () => {
      if (raw.startsWith("data:application/pdf") || raw.startsWith("data:application/octet-stream")) {
        try {
          const comma = raw.indexOf(",");
          if (comma === -1) {
            if (!cancelled) setNewsExpandedPdfLoading(false);
            return;
          }
          const base64 = raw.slice(comma + 1);
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          if (!cancelled) setNewsExpandedPdfBlobUrl(blobUrl);
        } catch {
          if (!cancelled) setNewsExpandedPdfBlobUrl(null);
        } finally {
          if (!cancelled) setNewsExpandedPdfLoading(false);
        }
        return;
      }
      if (!newsPdfIsOnPortalDiskPath(raw)) {
        if (!cancelled) {
          setNewsExpandedPdfBlobUrl(publicFileUrl(raw));
          setNewsExpandedPdfLoading(false);
        }
        return;
      }
      try {
        const res = await apiFetchBlob(`/api/portal/items/${item.id}/file?variant=metadata`);
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        if (!cancelled) setNewsExpandedPdfBlobUrl(blobUrl);
      } catch {
        if (!cancelled) setNewsExpandedPdfBlobUrl(publicFileUrl(raw));
      } finally {
        if (!cancelled) setNewsExpandedPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [newsLightboxItem]);

  useEffect(() => {
    if (manageSlug !== SLUG.awards) return;
    setInspirationSlots(slotsFromAwardItems(awardItems));
  }, [manageSlug, awardItems]);

  const inspirationByRank = useMemo(() => inspirationItemByRank(awardItems), [awardItems]);

  const newsCount = newsCarousel.length;
  const newsPageCount = Math.max(1, newsCount);
  const activeNews = newsCarousel[newsPageIndex] ?? newsCarousel[0];

  async function ensureBootstrapSections() {
    if (!canEdit) return;
    try {
      const res = await apiFetch("/api/portal/bootstrap-sections", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Falha ao criar seções.");
      }
      await refreshAll();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Erro ao criar seções.");
    }
  }

  const missingSlugs = useMemo(() => {
    return PORTAL_ITEM_SLUGS.filter((slug) => !sections.some((s) => s.slug === slug));
  }, [sections]);

  async function uploadPortalImage(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Leitura do arquivo falhou."));
      r.readAsDataURL(file);
    });
    const res = await apiFetch("/api/portal/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileData: dataUrl,
        fileType: file.type || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Upload falhou.");
    const fileUrl = data?.fileUrl as string | undefined;
    if (!fileUrl) throw new Error("Resposta sem URL do arquivo.");
    return fileUrl;
  }

  async function uploadPortalMedia(file: File): Promise<string> {
    return uploadPortalImage(file);
  }

  /** Substitui a imagem do WPSer do mês (uma imagem por seção). */
  async function replaceOrCreatePortalSectionImage(file: File) {
    const slug = manageSlug;
    if (!slug || !PORTAL_IMAGE_SECTION_SLUGS.has(slug)) return;
    const sectionId = sectionIdBySlug[slug];
    if (!sectionId) return;

    setSavingItem(true);
    setItemError(null);
    try {
      const content = await uploadPortalImage(file);
      const title = PORTAL_IMAGE_DEFAULT_TITLE[slug] || "Imagem";
      const items = itemsBySlug[slug] ?? [];
      const imageItems = items.filter(isImageItem);
      const metadata =
        slug === SLUG.employee
          ? buildEmployeeImageMetadata(imageItems[0]?.metadata, {
              fit: employeeImageFit,
              focalX: employeeFocalX,
              focalY: employeeFocalY,
            })
          : null;

      if (imageItems.length > 0) {
        const first = imageItems[0];
        const res = await apiFetch(`/api/portal/items/${first.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            type: "image",
            metadata,
          }),
        });
        const errBody = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar imagem.");
        for (const extra of imageItems.slice(1)) {
          await apiFetch(`/api/portal/items/${extra.id}`, { method: "DELETE" });
        }
      } else {
        const res = await apiFetch("/api/portal/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId,
            title,
            content,
            type: "image",
            metadata,
            isActive: true,
          }),
        });
        const errBody = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar imagem.");
      }

      await refreshAll();
      if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function addNewsImage(file: File) {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) return;
    setSavingItem(true);
    setItemError(null);
    try {
      const content = await uploadPortalImage(file);
      const n = newsItems.filter(isImageItem).length;
      const title = `Notícia ${n + 1}`;
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title,
          content,
          type: "image",
          metadata: { focalX: 50, focalY: 50, marker: "" },
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar imagem.");
      await refreshAll();
    if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSavingItem(false);
    }
  }

  const newsNewThumbs = useMemo(
    () => newsNewFiles.filter((f) => isNewsImageFileType(f)),
    [newsNewFiles],
  );
  const newsNewPdfs = useMemo(
    () => newsNewFiles.filter((f) => isNewsPdfFileType(f)),
    [newsNewFiles],
  );

  const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
  const selectedThumb = useMemo(() => {
    if (newsNewThumbs.length === 0) return null;
    const k = newsSelectedThumbKey;
    return (k ? newsNewThumbs.find((f) => fileKey(f) === k) : null) ?? newsNewThumbs[0];
  }, [newsNewThumbs, newsSelectedThumbKey]);
  const selectedPdf = useMemo(() => {
    if (newsNewPdfs.length === 0) return null;
    const k = newsSelectedPdfKey;
    return (k ? newsNewPdfs.find((f) => fileKey(f) === k) : null) ?? newsNewPdfs[0];
  }, [newsNewPdfs, newsSelectedPdfKey]);

  const effectiveThumb = selectedThumb ?? (selectedPdf ? { kind: "static" as const, src: WPS_ONE_ICON_SVG_SRC } : null);
  const effectivePdf = selectedPdf;

  const effectiveThumbPreviewUrl = useMemo(() => {
    if (!effectiveThumb) return "";
    if (typeof effectiveThumb === "object" && "kind" in effectiveThumb && effectiveThumb.kind === "static") {
      return effectiveThumb.src;
    }
    try {
      return URL.createObjectURL(effectiveThumb as File);
    } catch {
      return "";
    }
  }, [effectiveThumb]);

  useEffect(() => {
    if (!effectiveThumbPreviewUrl) return;
    // Revoga apenas URLs blob criadas via createObjectURL
    if (!effectiveThumbPreviewUrl.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(effectiveThumbPreviewUrl);
  }, [effectiveThumbPreviewUrl]);

  const newsCoverPreviewUrl = useMemo(() => {
    if (!newsCoverFile) return "";
    try {
      return URL.createObjectURL(newsCoverFile);
    } catch {
      return "";
    }
  }, [newsCoverFile]);

  useEffect(() => {
    if (!newsCoverPreviewUrl.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(newsCoverPreviewUrl);
  }, [newsCoverPreviewUrl]);

  useEffect(() => {
    if (!selectedThumb) return;
    const k = fileKey(selectedThumb);
    if (newsSelectedThumbKey !== k) setNewsSelectedThumbKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThumb]);

  useEffect(() => {
    if (!selectedPdf) return;
    const k = fileKey(selectedPdf);
    if (newsSelectedPdfKey !== k) setNewsSelectedPdfKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPdf]);

  async function createSingleNewsPost(params: {
    title: string;
    thumbUrl: string;
    pdfUrl: string | null;
    coverUrl?: string | null;
  }) {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) throw new Error("Seção de notícias não encontrada.");
    const patch: {
      focalX: number;
      focalY: number;
      marker: string;
      pdfUrl: string | null;
      coverUrl?: string | null;
      referenceMonth: string;
    } = {
      focalX: newsFocalX,
      focalY: newsFocalY,
      marker: "",
      pdfUrl: params.pdfUrl && String(params.pdfUrl).trim() ? String(params.pdfUrl).trim() : null,
      referenceMonth: newsReferenceMonth,
    };
    if (params.coverUrl && String(params.coverUrl).trim()) {
      patch.coverUrl = String(params.coverUrl).trim();
    }
    const metadata = buildNewsMetadata(null, patch);
    const res = await apiFetch("/api/portal/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sectionId,
        title: params.title.trim() || "Notícia",
        content: params.thumbUrl,
        type: "image",
        metadata,
        isActive: true,
      }),
    });
    const errBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar notícia.");
  }

  function clearNewsDraft() {
    setNewsReferenceMonth(currentReferenceMonth());
    setNewsNewFiles([]);
    setNewsSelectedThumbKey(null);
    setNewsSelectedPdfKey(null);
    setNewsCoverFile(null);
    setNewsFocalX(50);
    setNewsFocalY(50);
    if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
    if (newsCoverInputRef.current) newsCoverInputRef.current.value = "";
  }

  async function createNewsFromModal() {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) return;
    if (!effectiveThumb && !effectivePdf) {
      setItemError("Anexe uma imagem (PNG, JPG ou WebP) ou um PDF.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const normalizeTitle = (name: string) =>
        String(name || "")
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();

      const [thumbUrl, pdfUrl, coverUrlUploaded] = await Promise.all([
        effectiveThumb
          ? typeof effectiveThumb === "object" && "kind" in effectiveThumb
            ? Promise.resolve(effectiveThumb.src)
            : uploadPortalMedia(effectiveThumb as File)
          : Promise.resolve(""),
        effectivePdf ? uploadPortalMedia(effectivePdf) : Promise.resolve(""),
        newsCoverFile ? uploadPortalMedia(newsCoverFile) : Promise.resolve<string | null>(null),
      ]);

      const inferredTitle =
        normalizeTitle(effectivePdf?.name || "") ||
        normalizeTitle((effectiveThumb as File | null)?.name || "") ||
        "Notícia";

      const thumbFinal = thumbUrl || (pdfUrl ? WPS_ONE_ICON_SVG_SRC : "");
      if (!thumbFinal) {
        setItemError("Não foi possível determinar a mídia principal da notícia.");
        return;
      }

      await createSingleNewsPost({
        title: inferredTitle,
        thumbUrl: thumbFinal,
        pdfUrl: pdfUrl || null,
        coverUrl: coverUrlUploaded,
      });
      await refreshAll();
      clearNewsDraft();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function publishEachSelectedFileAsNews() {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) return;
    const imgs = newsNewFiles.filter((f) => isNewsImageFileType(f));
    const pdfs = newsNewFiles.filter((f) => isNewsPdfFileType(f));
    if (imgs.length === 0 && pdfs.length === 0) {
      setItemError("Anexe pelo menos uma imagem (PNG, JPG ou WebP) ou um PDF.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const normalizeTitle = (name: string) =>
        String(name || "")
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();

      let coverUploaded: string | null = null;
      if (newsCoverFile) {
        coverUploaded = await uploadPortalMedia(newsCoverFile);
      }

      const nPair = Math.min(imgs.length, pdfs.length);
      let published = 0;
      for (let i = 0; i < nPair; i++) {
        const thumbUrl = await uploadPortalMedia(imgs[i]);
        const pdfUrl = await uploadPortalMedia(pdfs[i]);
        await createSingleNewsPost({
          title: normalizeTitle(imgs[i].name) || normalizeTitle(pdfs[i].name) || `Notícia ${published + 1}`,
          thumbUrl,
          pdfUrl,
          coverUrl: published === 0 ? coverUploaded : null,
        });
        published++;
      }
      for (let i = nPair; i < imgs.length; i++) {
        const thumbUrl = await uploadPortalMedia(imgs[i]);
        await createSingleNewsPost({
          title: normalizeTitle(imgs[i].name) || `Notícia ${published + 1}`,
          thumbUrl,
          pdfUrl: null,
          coverUrl: published === 0 ? coverUploaded : null,
        });
        published++;
      }
      for (let i = nPair; i < pdfs.length; i++) {
        const pdfUrl = await uploadPortalMedia(pdfs[i]);
        await createSingleNewsPost({
          title: normalizeTitle(pdfs[i].name) || `Notícia ${published + 1}`,
          thumbUrl: WPS_ONE_ICON_SVG_SRC,
          pdfUrl,
          coverUrl: published === 0 ? coverUploaded : null,
        });
        published++;
      }

      await refreshAll();
      clearNewsDraft();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function replaceNewsThumb(itemId: string, file: File) {
    setSavingItem(true);
    setItemError(null);
    try {
      const thumbUrl = await uploadPortalMedia(file);
      const res = await apiFetch(`/api/portal/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: thumbUrl, type: "image" }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar thumbnail.");
      await refreshAll();
      if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setSavingItem(false);
      setNewsReplaceThumbId(null);
    }
  }

  async function replaceNewsPdf(item: PortalItem, file: File) {
    setSavingItem(true);
    setItemError(null);
    try {
      const pdfUrl = await uploadPortalMedia(file);
      const metadata = buildNewsMetadata(item.metadata, { pdfUrl });
      const res = await apiFetch(`/api/portal/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar PDF.");
      await refreshAll();
      if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setSavingItem(false);
      setNewsReplacePdfId(null);
    }
  }

  async function replaceNewsCoverItem(item: PortalItem, file: File) {
    setSavingItem(true);
    setItemError(null);
    try {
      const coverUrl = await uploadPortalMedia(file);
      const metadata = buildNewsMetadata(item.metadata, { coverUrl });
      const res = await apiFetch(`/api/portal/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar capa.");
      await refreshAll();
      if (newsCoverInputRef.current) newsCoverInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setSavingItem(false);
      setNewsReplaceCoverId(null);
    }
  }

  /** Move a notícia para outro mês no portal (não mexe nos arquivos). */
  async function updateNewsReferenceMonth(item: PortalItem, referenceMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(referenceMonth)) return;
    setSavingItem(true);
    setItemError(null);
    try {
      const metadata = buildNewsMetadata(item.metadata, { referenceMonth });
      const res = await apiFetch(`/api/portal/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar o mês da notícia.");
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function saveEmployeeImageDisplaySettings() {
    const it = currentManageImageItem;
    if (!it) return;
    setSavingItem(true);
    setItemError(null);
    try {
      const metadata = buildEmployeeImageMetadata(it.metadata, {
        fit: employeeImageFit,
        focalX: employeeFocalX,
        focalY: employeeFocalY,
      });
      const res = await apiFetch(`/api/portal/items/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar ajuste da imagem.");
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar ajuste.");
    } finally {
      setSavingItem(false);
    }
  }

  async function saveNewsItemTitle(item: PortalItem) {
    const title = (newsTitleDrafts[item.id] ?? "").trim();
    if (!title) {
      setItemError("Informe um nome/título para a notícia.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const res = await apiFetch(`/api/portal/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar.");
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingItem(false);
    }
  }

  function clickOpenInNewTab(href: string) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

function portalDiskPathFromUrl(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("/uploads/portal/")) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      return u.pathname.startsWith("/uploads/portal/") ? u.pathname : "";
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Imagem de item do portal. Usa o URL público (cacheável pelo navegador) e só
 * cai para a rota autenticada se o ficheiro não for entregue — ex.: extensão
 * fora da lista pública em produção.
 */
function PortalItemImage({
  itemId,
  srcRaw,
  alt,
  className,
  style,
  variant = "content",
}: {
  itemId: string;
  srcRaw: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  variant?: "content" | "cover";
}) {
  const [src, setSrc] = useState<string>(() => publicFileUrl(srcRaw));
  const blobUrlRef = useRef<string | null>(null);
  const authTriedRef = useRef(false);

  useEffect(() => {
    authTriedRef.current = false;
    setSrc(publicFileUrl(srcRaw));
  }, [srcRaw]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [],
  );

  async function loadViaApi() {
    if (authTriedRef.current) return;
    authTriedRef.current = true;
    if (!portalDiskPathFromUrl(srcRaw)) return;
    try {
      const query = variant === "cover" ? "?variant=cover" : "";
      const res = await apiFetchBlob(`/api/portal/items/${itemId}/file${query}`);
      if (!res.ok) return;
      const obj = URL.createObjectURL(await res.blob());
      blobUrlRef.current = obj;
      setSrc(obj);
    } catch {
      // sem fallback disponível: mantém o URL público (mostra o alt)
    }
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => void loadViaApi()}
    />
  );
}

  async function openNewsPdfInNewTab(item: PortalItem): Promise<boolean> {
    const raw = parseNewsPdfUrl(item.metadata);
    if (!raw) return false;

    if (raw.startsWith("data:application/pdf") || raw.startsWith("data:application/octet-stream")) {
      try {
        const comma = raw.indexOf(",");
        if (comma === -1) return false;
        const meta = raw.slice(0, comma);
        const base64 = raw.slice(comma + 1);
        const mime = meta.match(/^data:([^;]+);base64$/i)?.[1] || "application/pdf";
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        clickOpenInNewTab(blobUrl);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return true;
      } catch {
        return false;
      }
    }

    if (!newsPdfIsOnPortalDiskPath(raw)) {
      clickOpenInNewTab(publicFileUrl(raw));
      return true;
    }

    try {
      const res = await apiFetchBlob(`/api/portal/items/${item.id}/file?variant=metadata`);
      if (!res.ok) return false;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      clickOpenInNewTab(blobUrl);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
      return true;
    } catch {
      return false;
    }
  }

  function openNewsLightbox(item: PortalItem) {
    setNewsLightboxItem(item);
  }

  async function persistInspirationSlot(rank: InspirationRank, slot: InspirationSlotDraft, sectionId: string) {
    const name = slot.name.trim();
    const cargo = slot.cargo.trim();
    const pointsStr = slot.points.trim();
    const pointsNum = pointsStr === "" ? 0 : Math.max(0, Math.floor(Number(pointsStr) || 0));
    const imageUrl = slot.imageUrl.trim();
    const empty = !name && !imageUrl && !cargo && pointsStr === "";

    if (empty) {
      if (slot.id) {
        const res = await apiFetch(`/api/portal/items/${slot.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || "Erro ao remover colaborador.");
        }
      }
      return;
    }

    const title = name || `Colaborador — ${rank}º lugar`;
    const metadata = { rank, points: pointsNum, cargo };
    const body = { title, content: imageUrl, type: "inspiration", metadata };

    if (slot.id) {
      const res = await apiFetch(`/api/portal/items/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar colaborador.");
    } else {
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, ...body, isActive: true }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar colaborador.");
    }
  }

  async function saveInspirationFromModal() {
    const sectionId = sectionIdBySlug[SLUG.awards];
    if (!sectionId) {
      setItemError("Seção Pontos de Inspiração não encontrada.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const ranks: InspirationRank[] = [1, 2, 3];
      for (const rank of ranks) {
        await persistInspirationSlot(rank, inspirationSlots[rank], sectionId);
      }
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleInspirationPhotoPick(file: File) {
    const rank = inspirationUploadRank;
    setInspirationUploadRank(null);
    if (!rank) return;
    const sectionId = sectionIdBySlug[SLUG.awards];
    if (!sectionId) {
      setItemError("Seção não encontrada.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const url = await uploadPortalImage(file);
      let merged!: InspirationSlotDraft;
      setInspirationSlots((prev) => {
        merged = { ...prev[rank], imageUrl: url };
        return { ...prev, [rank]: merged };
      });
      await persistInspirationSlot(rank, merged, sectionId);
      await refreshAll();
      if (inspirationFileInputRef.current) inspirationFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao enviar foto.");
    } finally {
      setSavingItem(false);
    }
  }

  async function removePortalItem(item: PortalItem) {
    setItemError(null);
    try {
      const res = await apiFetch(`/api/portal/items/${item.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Erro ao remover.");
      }
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  async function confirmRemovePortalItem() {
    const item = confirmDeleteItem;
    if (!item) return;
    setConfirmDeleteItem(null);
    await removePortalItem(item);
  }

  async function handleCreateEvent() {
    if (!evTitle.trim() || !evDate) {
      setEvError("Preencha título e data.");
      return;
    }
    setSavingEv(true);
    setEvError(null);
    try {
      const chosenLocal = new Date(evDate + "T12:00:00");
      // Garante que o evento recém-criado apareça: ajusta o calendário para o mês/ano do evento.
      if (!Number.isNaN(chosenLocal.getTime())) {
        setCalendarFilterEngaged(true);
        setCalMonth(chosenLocal.getMonth() + 1);
        setCalYear(chosenLocal.getFullYear());
      }
      const res = await apiFetch("/api/portal/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: evTitle.trim(),
          date: evDate,
          description: evDesc.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Erro ao criar evento.");
      setEvTitle("");
      setEvDate("");
      setEvDesc("");
      setManageEventsOpen(false);
      await refreshAll();
    } catch (e: unknown) {
      setEvError(e instanceof Error ? e.message : "Erro ao salvar evento.");
    } finally {
      setSavingEv(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!window.confirm("Remover este evento da agenda?")) return;
    try {
      const res = await apiFetch(`/api/portal/events/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Erro ao remover.");
      }
      await refreshAll();
    } catch {
      /* noop */
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-900 text-slate-100">
      <div className="flex min-h-screen">
        {/* Menu lateral (estilo WPS One) — topo ao rodapé, sem bordas arredondadas */}
        <aside
          className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col lg:border-r lg:border-[color:var(--sidebar-border)] lg:bg-[color:var(--sidebar-bg)] lg:shadow-xl lg:backdrop-blur transition-all duration-300 ease-out ${
            sidebarCollapsed ? "lg:w-[72px]" : "lg:w-56"
          }`}
        >
          <div
            className={`flex h-14 shrink-0 items-center border-b border-[color:var(--sidebar-border)] ${
              sidebarCollapsed ? "justify-center" : "justify-between gap-2 px-4"
            }`}
          >
            {!sidebarCollapsed && (
              <img
                src={WPS_ONE_ICON_SVG_SRC}
                alt="WPS One"
                className="h-8 w-8 shrink-0 select-none"
                draggable={false}
              />
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--primary-foreground)]/80 transition hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] focus:ring-inset ${
                !sidebarCollapsed ? "ml-auto" : ""
              }`}
              aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {(
              [
                { id: "empresa" as PortalMainView, label: "Empresa", Icon: Building2 },
                { id: "admin" as PortalMainView, label: "Administrativo", Icon: Briefcase },
                { id: "manuais" as PortalMainView, label: "Manuais", Icon: BookOpen },
                { id: "templates" as PortalMainView, label: "Templates", Icon: FileStack },
                { id: "biblioteca" as PortalMainView, label: "Biblioteca", Icon: Library },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = portalView === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={sidebarCollapsed ? label : undefined}
                  onClick={() => setPortalView(id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium select-none transition ${
                    active ? "text-[color:var(--primary-foreground)] shadow-sm" : "text-[color:var(--primary-foreground)]/85 hover:bg-[color:var(--sidebar-item-hover)]/60"
                  } ${sidebarCollapsed ? "justify-center" : ""}`}
                  style={active ? ({ background: "var(--sidebar-item-active)" } as React.CSSProperties) : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: active ? "rgba(92,0,225,0.55)" : "rgba(255,255,255,0.06)",
                      color: active ? "#fff" : "rgba(244,242,255,0.58)",
                    }}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!sidebarCollapsed && <span className="truncate text-left">{label}</span>}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 border-t border-[color:var(--sidebar-border)] p-3">
            <button
              type="button"
              onClick={() => void logout()}
              title={sidebarCollapsed ? "Sair" : undefined}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-500/10 hover:text-red-100 ${
                sidebarCollapsed ? "justify-center" : ""
              }`}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>Sair</span>}
            </button>
          </div>
        </aside>

        <main
          className={`w-full px-4 py-8 sm:px-6 transition-[padding] duration-300 ease-out lg:px-8 ${
            sidebarCollapsed ? "lg:pl-[96px]" : "lg:pl-[248px]"
          }`}
        >
          <header className="mb-8 border-b border-white/10 bg-black/20 backdrop-blur-md -mx-4 -mt-8 px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/30">
                  <LayoutGrid className="h-5 w-5 text-white" aria-hidden />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Portal colaborativo</h1>
                  <p className="mt-1 max-w-xl text-sm text-slate-300">
                    Intranet WPS: notícias, destaques, manuais, agenda e pessoas — conteúdo publicado pelo administrador do portal.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-4 sm:w-auto sm:min-w-[280px] lg:items-end">
                <p className="w-full text-center text-base font-semibold capitalize leading-snug tracking-wide text-white drop-shadow-sm sm:text-lg lg:text-right">
                  {now.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:justify-end lg:w-auto">
                  <ThemeToggleInline />
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackSent(false);
                      setFeedbackError(null);
                      setFeedbackType("BUG");
                      setFeedbackDescription("");
                      setFeedbackFiles([]);
                      setFeedbackOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/70 px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:bg-black/5"
                    title="Enviar bug ou sugestão"
                  >
                    <Sparkles className="h-4 w-4" />
                    Enviar feedback
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) return;
                      if (user.role === "CLIENTE") router.push("/cliente");
                      else if (user.role === "SUPER_ADMIN") router.push("/admin");
                      else if (user.role === "GESTOR_PROJETOS") router.push("/gestor");
                      else router.push("/consultor");
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/70 px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] shadow-sm transition hover:bg-black/5"
                  >
                    Ir para WPS One
                  </button>
                </div>
              </div>
            </div>
          </header>

          {feedbackOpen && (
            <PortalFeedbackModal
              type={feedbackType}
              description={feedbackDescription}
              files={feedbackFiles}
              sending={feedbackSending}
              error={feedbackError}
              sent={feedbackSent}
              onClose={() => {
                if (feedbackSending) return;
                setFeedbackOpen(false);
              }}
              onChangeType={setFeedbackType}
              onChangeDescription={setFeedbackDescription}
              onAddFiles={(list) => {
                const next = [...feedbackFiles, ...list].slice(0, 5);
                setFeedbackFiles(next);
              }}
              onRemoveFile={(idx) => {
                setFeedbackFiles((prev) => prev.filter((_, i) => i !== idx));
              }}
              onSubmit={async () => {
                if (feedbackSending) return;
                setFeedbackError(null);
                setFeedbackSent(false);

                const desc = feedbackDescription.trim();
                if (!desc || desc.length < 10) {
                  setFeedbackError("Descreva com mais detalhes (mínimo 10 caracteres).");
                  return;
                }
                if (feedbackFiles.length > 5) {
                  setFeedbackError("Envie no máximo 5 imagens.");
                  return;
                }
                for (const f of feedbackFiles) {
                  if (!f.type.startsWith("image/")) {
                    setFeedbackError("Envie somente imagens (PNG/JPG/WebP/GIF).");
                    return;
                  }
                  if (f.size > 2 * 1024 * 1024) {
                    setFeedbackError("Cada imagem deve ter no máximo 2MB.");
                    return;
                  }
                }

                setFeedbackSending(true);
                try {
                  const toDataUrl = (file: File) =>
                    new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result || ""));
                      reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
                      reader.readAsDataURL(file);
                    });
                  const images = await Promise.all(
                    feedbackFiles.map(async (f) => ({
                      fileName: f.name,
                      fileData: await toDataUrl(f),
                    })),
                  );
                  const res = await apiFetch("/api/portal/feedback", {
                    method: "POST",
                    body: JSON.stringify({
                      type: feedbackType,
                      description: desc,
                      images,
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setFeedbackError(data?.error || "Não foi possível enviar. Tente novamente.");
                    return;
                  }
                  setFeedbackSent(true);
                  setFeedbackFiles([]);
                  setFeedbackDescription("");
                } catch (e: any) {
                  setFeedbackError(e?.message || "Não foi possível enviar. Tente novamente.");
                } finally {
                  setFeedbackSending(false);
                }
              }}
            />
          )}
        {loading && (
          <p className="text-center text-sm text-slate-400">Carregando portal…</p>
        )}
        {loadError && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {loadError}
          </div>
        )}

        {!loading && missingSlugs.length > 0 && (
          <div className="mb-8 flex flex-col items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-100">
              Faltam seções do portal neste ambiente ({missingSlugs.join(", ")}).{" "}
              {canEdit ? "Crie as seções padrão com um clique." : "Peça ao administrador do portal para configurar."}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => void ensureBootstrapSections()}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-400 transition"
              >
                <Sparkles className="h-4 w-4" />
                Criar seções padrão
              </button>
            )}
          </div>
        )}

        {portalView === "empresa" && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            {/* Notícias — carrossel de imagens */}
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-fuchsia-300" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Notícias</h2>
                </div>
                <div className="flex items-center gap-2">
                {newsPeriods.length > 1 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="sr-only">Período das notícias</span>
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    <select
                      value={newsPeriod ?? newsPeriods[0]!.key}
                      onChange={(e) => setNewsPeriod(e.target.value)}
                      className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white outline-none focus:border-fuchsia-400/60"
                    >
                      {newsPeriods.map((p) => (
                        <option key={p.key} value={p.key} className="text-slate-900">
                          {p.label} ({p.count})
                        </option>
                      ))}
                      <option value={NEWS_ALL_PERIODS} className="text-slate-900">
                        Todos os meses ({newsImageItems.length})
                      </option>
                    </select>
                  </label>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      clearNewsDraft();
                      setManageSlug(SLUG.news);
                      setItemError(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Gerenciar
                  </button>
                )}
                </div>
              </div>
              <div className="relative w-full bg-slate-900/80 min-h-[220px] max-h-[min(520px,64vh)] sm:min-h-[260px] sm:max-h-[min(560px,56vh)]">
                {newsCount > 0 && activeNews ? (
                  <div className="relative w-full">
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/20">
                      {(() => {
                        const cover = parseNewsCoverUrl(activeNews.metadata);
                        const pos = newsObjectPosition(activeNews.metadata);
                        if (cover) {
                          return (
                            <PortalItemImage
                              itemId={activeNews.id}
                              srcRaw={cover}
                              variant="cover"
                              alt={newsDisplayCaption(activeNews)}
                              className="h-full w-full object-cover"
                              style={{ objectPosition: pos }}
                            />
                          );
                        }
                        return (
                          <PortalItemImage
                            itemId={activeNews.id}
                            srcRaw={activeNews.content}
                            alt={newsDisplayCaption(activeNews)}
                            className="h-full w-full object-cover"
                            style={{ objectPosition: pos }}
                          />
                        );
                      })()}

                      {/* Gradiente tipo Windows 11 */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                      {(() => {
                        const hasPdf = !!parseNewsPdfUrl(activeNews.metadata);
                        const label = hasPdf
                          ? "Ampliar notícia (PDF ou imagem)"
                          : "Ampliar imagem da notícia";
                        return (
                          <button
                            type="button"
                            aria-label={label}
                            className="absolute inset-0 z-[2] h-full w-full cursor-zoom-in bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400/60"
                            onClick={() => {
                              openNewsLightbox(activeNews);
                            }}
                          />
                        );
                      })()}

                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[3] p-4 sm:p-6">
                        {(() => {
                          const cap = newsDisplayCaption(activeNews);
                          return cap ? (
                            <p className="max-w-[90%] text-xl font-semibold leading-tight text-white drop-shadow-md line-clamp-2 sm:text-2xl">
                              {cap}
                            </p>
                          ) : null;
                        })()}
                      </div>

                      {/* Setas só quando tiver mais de uma notícia */}
                      {newsCount > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Anterior"
                            onClick={() => setNewsPageIndex((i) => (i - 1 + newsPageCount) % newsPageCount)}
                            className="absolute left-3 top-1/2 z-[4] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70"
                          >
                            <ChevronLeft className="h-6 w-6" />
                          </button>
                          <button
                            type="button"
                            aria-label="Próximo"
                            onClick={() => setNewsPageIndex((i) => (i + 1) % newsPageCount)}
                            className="absolute right-3 top-1/2 z-[4] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70"
                          >
                            <ChevronRight className="h-6 w-6" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Bolinhas de navegação */}
                    {newsCount > 1 && (
                      <div className="pointer-events-auto py-3 flex justify-center gap-1.5">
                        {Array.from({ length: newsPageCount }, (_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            aria-label={`Notícia ${idx + 1}`}
                            onClick={() => setNewsPageIndex(idx)}
                            className={`h-1.5 rounded-full transition-all ${
                              idx === newsPageIndex ? "w-7 bg-fuchsia-400" : "w-1.5 bg-white/40"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                    <ImagePlus className="h-10 w-10 opacity-50" />
                    <p className="text-sm">Nenhuma imagem de notícia ainda.</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          clearNewsDraft();
                          setManageSlug(SLUG.news);
                        }}
                        className="text-xs font-semibold text-fuchsia-300 hover:underline"
                      >
                        Enviar primeira imagem
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Pontos de Inspiração — pódio compacto abaixo das notícias */}
            <section className="overflow-hidden rounded-2xl border border-amber-500/15 bg-amber-950/15 p-3 shadow-lg backdrop-blur sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-amber-300/90" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-100/85">Pontos de Inspiração</h2>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setManageSlug(SLUG.awards);
                      setItemError(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25"
                  >
                    <ImagePlus className="h-3 w-3" />
                    Gerenciar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-start justify-center gap-5 sm:gap-8 px-1 pb-1">
                {([1, 2, 3] as const).map((rank) => {
                  const item = inspirationByRank[rank];
                  const meta = item ? parseInspirationMeta(item) : null;
                  const name = (item?.title || "").trim() || `— ${rank}º lugar —`;
                  const cargo = (meta?.cargo || "").trim();
                  const points = meta?.points ?? null;
                  const photo = item?.content?.trim() || "";
                  const initials = name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase() || "?";
                  return (
                    <div key={rank} className="flex w-[128px] shrink-0 flex-col items-center sm:w-[138px]">
                      <div className="relative mx-auto aspect-square w-[96px] max-w-full sm:w-[104px]">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-white/5 shadow-inner ring-1 ring-amber-400/20" />
                        <div className="absolute inset-[2px] overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/10">
                          {photo && item ? (
                            <PortalItemImage itemId={item.id} srcRaw={photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-800 text-xs font-bold text-slate-500">
                              {initials}
                            </div>
                          )}
                        </div>
                        <PodiumMedal rank={rank} size="sm" />
                        {points != null && (
                          <div className="absolute bottom-0.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-sky-600 px-1.5 py-px text-[9px] font-bold tabular-nums text-white shadow ring-1 ring-slate-950/80">
                            {points}
                          </div>
                        )}
                      </div>
                      <p className="mt-2 max-w-full truncate text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-sky-200/95">
                        {name}
                      </p>
                      {cargo ? (
                        <p className="mt-0.5 line-clamp-2 max-w-full text-center text-[8px] font-medium uppercase leading-snug tracking-wide text-sky-300/80">
                          {cargo}
                        </p>
                      ) : (
                        <p className="mt-0.5 h-2.5 text-[8px] text-slate-600"> </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {!canEdit && ![1, 2, 3].some((r) => inspirationByRank[r as InspirationRank]) && (
                <p className="text-center text-[10px] text-slate-500">Em breve o pódio do mês será publicado aqui.</p>
              )}
            </section>
          </div>

          {/* Coluna direita: agenda, aniversariantes e WPSer do mês */}
          <div className="flex w-full min-w-0 flex-col gap-6">
            <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-sky-300" />
                  <h2 className="text-sm font-semibold text-slate-200">Agenda</h2>
                </div>
                <div
                  className="flex flex-wrap items-center gap-2"
                  onFocusCapture={() => setCalendarFilterEngaged(true)}
                >
                  <select
                    value={calMonth}
                    onChange={(e) => {
                      setCalendarFilterEngaged(true);
                      setCalMonth(Number(e.target.value));
                    }}
                    className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1, 1).toLocaleString("pt-BR", { month: "long" })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={calYear}
                    onChange={(e) => {
                      setCalendarFilterEngaged(true);
                      setCalYear(Number(e.target.value));
                    }}
                    className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
                  >
                    {Array.from({ length: 9 }, (_, i) => now.getFullYear() - 4 + i).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setManageEventsOpen(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/30"
                    >
                      <Plus className="h-3 w-3" />
                      Evento
                    </button>
                  )}
                </div>
              </div>

              {!isSelectedCurrentMonth && upcomingEvents.length > 0 && (
                <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300/90">
                    Próximos eventos
                  </p>
                  <ul className="space-y-2">
                    {upcomingEvents.slice(0, 3).map((ev) => (
                      <li key={ev.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/25 to-violet-600/25 text-center">
                          <span className="text-[9px] font-bold uppercase text-sky-200">
                            {new Date(ev.date).toLocaleDateString("pt-BR", { month: "short" })}
                          </span>
                          <span className="text-base font-bold leading-none text-white">
                            {new Date(ev.date).getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{ev.title}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {new Date(ev.date).toLocaleDateString("pt-BR", { weekday: "short", year: "numeric" })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {displayedMonthEvents.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {isSelectedCurrentMonth && eventsForSelectedMonth.length > 0 && !calendarFilterEngaged
                    ? "Nenhum evento futuro neste mês."
                    : "Nenhum evento neste mês."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {displayedMonthEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex gap-3 rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5"
                    >
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-violet-600/30 text-center">
                        <span className="text-[10px] font-bold uppercase text-sky-200">
                          {new Date(ev.date).toLocaleDateString("pt-BR", { month: "short" })}
                        </span>
                        <span className="text-lg font-bold leading-none text-white">
                          {new Date(ev.date).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{ev.title}</p>
                        {ev.description && (
                          <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{ev.description}</p>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEvent(ev.id)}
                          className="self-start rounded-lg p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                          aria-label="Excluir evento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="w-full rounded-3xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-950/40 to-slate-950/60 p-4 shadow-xl backdrop-blur sm:p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fuchsia-100">
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
                Aniversariantes do mês
              </h2>
              {birthdays.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Ninguém com data de nascimento cadastrada neste mês — incentive o time a preencher o perfil.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {birthdays.map((b) => {
                    // `birthDate` é uma data "pura". Se vier como ISO UTC (ex.: 2026-03-07T00:00:00.000Z),
                    // `new Date()` + `getDate()` pode voltar 1 dia em fusos negativos. Por isso, exibimos em UTC.
                    const d = b.birthDate ? new Date(b.birthDate) : null;
                    const day = d ? d.getUTCDate() : "—";
                    const monthShort = d
                      ? d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
                      : "";
                    return (
                      <li
                        key={b.id}
                        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/40 hover:bg-white/10"
                      >
                        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-2xl" />
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-700 shadow-lg">
                            <span className="text-[9px] font-bold uppercase text-white/80">{monthShort}</span>
                            <span className="text-xl font-black text-white">{day}</span>
                          </div>
                          <Avatar
                            name={b.name}
                            avatarUrl={b.avatarUrl}
                            size={48}
                            className="ring-2 ring-white/20 shadow-md"
                            imgClassName="object-cover"
                            fallbackClassName="text-sm font-bold"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white">{b.name}</p>
                            {b.cargo && <p className="truncate text-[11px] text-fuchsia-100/80">{b.cargo}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* WPSer do mês — abaixo dos aniversariantes */}
            <section className="w-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-violet-300" />
                  <h2 className="text-sm font-semibold text-slate-200">WPSer do mês</h2>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setManageSlug(SLUG.employee);
                      setItemError(null);
                    }}
                    className="text-[11px] font-semibold text-violet-300 hover:underline"
                  >
                    Gerenciar
                  </button>
                )}
              </div>
              <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                {employeeItems[0] && isImageItem(employeeItems[0]) ? (
                  (() => {
                    const it = employeeItems[0];
                    const fit = parseEmployeeImageFit(it.metadata);
                    const focal = parseEmployeeFocal(it.metadata);
                    return (
                      <PortalItemImage
                        itemId={it.id}
                        srcRaw={it.content}
                        alt={it.title}
                        className={`w-full max-w-full bg-black/20 max-h-[min(520px,60vh)] ${
                          fit === "cover" ? "h-[min(520px,60vh)] object-cover" : "h-auto object-contain"
                        }`}
                        style={fit === "cover" ? { objectPosition: `${focal.x}% ${focal.y}%` } : undefined}
                      />
                    );
                  })()
                ) : (
                  <div className="flex min-h-[240px] w-full max-w-full flex-col items-center justify-center gap-2 text-center text-slate-500">
                    <p className="text-xs px-4">Arte do WPSer do mês (imagem).</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
        )}

        {portalView === "admin" && (
          <div className="mx-auto max-w-4xl space-y-4 px-1">
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
              {ADMIN_PORTAL_SUBSECTIONS.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setAdminTab(s.slug)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    adminTab === s.slug
                      ? "bg-violet-600 text-white"
                      : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <PortalPdfLibrary
              title={ADMIN_PORTAL_SUBSECTIONS.find((x) => x.slug === adminTab)?.label ?? "Documento"}
              sectionId={sectionIdBySlug[adminTab]}
              items={itemsBySlug[adminTab] ?? []}
              canEdit={canEdit}
              onRefresh={refreshAll}
            />
          </div>
        )}

        {portalView === "manuais" && (
          <div className="mx-auto max-w-4xl px-1">
            <PortalPdfLibrary
              title="Manuais e documentos"
              description="Procedimentos, normas e materiais em PDF."
              sectionId={sectionIdBySlug[SLUG.manuals]}
              items={itemsBySlug[SLUG.manuals] ?? []}
              canEdit={canEdit}
              onRefresh={refreshAll}
            />
          </div>
        )}

        {portalView === "templates" && (
          <div className="mx-auto max-w-4xl px-1">
            <PortalPdfLibrary
              title="Templates oficiais"
              description="Modelos e formulários padronizados da empresa."
              sectionId={sectionIdBySlug[SLUG.templates]}
              items={itemsBySlug[SLUG.templates] ?? []}
              canEdit={canEdit}
              onRefresh={refreshAll}
            />
          </div>
        )}

        {portalView === "biblioteca" && (
          <div className="mx-auto max-w-4xl px-1">
            <PortalPdfLibrary
              title="Biblioteca"
              description="Materiais de referência e documentos gerais."
              sectionId={sectionIdBySlug[SLUG.biblioteca]}
              items={itemsBySlug[SLUG.biblioteca] ?? []}
              canEdit={canEdit}
              onRefresh={refreshAll}
            />
          </div>
        )}

      </main>
      </div>

      {/* Modal: gerenciar itens de uma seção */}
      {manageSlug && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="presentation"
          onPointerDown={(e) => {
            overlayPointerDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
            overlayPointerDownRef.current = false;
            if (shouldClose) {
              if (manageSlug === SLUG.news) {
                clearNewsDraft();
                setNewsReplaceThumbId(null);
                setNewsReplacePdfId(null);
                setNewsReplaceCoverId(null);
              }
              setManageSlug(null);
              setItemError(null);
              setConfirmDeleteItem(null);
              setInspirationUploadRank(null);
              if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
              if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
              if (newsCoverInputRef.current) newsCoverInputRef.current.value = "";
              if (inspirationFileInputRef.current) inspirationFileInputRef.current.value = "";
            }
          }}
        >
          <div
            className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl ${
              manageSlug === SLUG.awards ? "max-w-4xl" : manageSlug === SLUG.news ? "max-w-2xl" : "max-w-lg"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">
                {manageSlug === SLUG.news && "Notícias"}
                {manageSlug === SLUG.employee && "WPSer do mês"}
                {manageSlug === SLUG.awards && "Pontos de Inspiração"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (manageSlug === SLUG.news) {
                    clearNewsDraft();
                    setNewsReplaceThumbId(null);
                    setNewsReplacePdfId(null);
                    setNewsReplaceCoverId(null);
                  }
                  setManageSlug(null);
                  setItemError(null);
                  setConfirmDeleteItem(null);
                  setInspirationUploadRank(null);
                  if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
                  if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
                  if (newsCoverInputRef.current) newsCoverInputRef.current.value = "";
                  if (inspirationFileInputRef.current) inspirationFileInputRef.current.value = "";
                }}
                className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Fechar
              </button>
            </div>

            {manageSlug === SLUG.news && (
              <div className="mb-4 space-y-4">
                <p className="text-[11px] text-slate-400">
                  Anexe <strong className="text-slate-200">PNG, JPG, WebP</strong> e/ou <strong className="text-slate-200">PDF</strong>.
                  Opcionalmente defina uma <strong className="text-slate-200">capa</strong> (imagem diferente da principal). No portal,
                  use as setas se houver mais de uma notícia; ao clicar na capa, a imagem ou o PDF abre em tela cheia.
                </p>
                <input
                  ref={newsCoverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!f || !isNewsImageFileType(f)) {
                      setItemError("Selecione uma imagem PNG, JPG ou WebP para a capa.");
                      return;
                    }
                    if (newsReplaceCoverId) {
                      const it = newsImageItems.find((x) => x.id === newsReplaceCoverId);
                      if (it) void replaceNewsCoverItem(it, f);
                      setNewsReplaceCoverId(null);
                      return;
                    }
                    setItemError(null);
                    setNewsCoverFile(f);
                  }}
                />
                <input
                  ref={newsAddAnyFileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length === 0) return;

                    const firstImg = files.find((f) => isNewsImageFileType(f)) ?? null;
                    const firstPdf = files.find((f) => isNewsPdfFileType(f)) ?? null;

                    if (newsReplaceThumbId) {
                      if (!firstImg) setItemError("Selecione uma imagem (PNG, JPG ou WebP) para trocar a prévia principal.");
                      else void replaceNewsThumb(newsReplaceThumbId, firstImg);
                      e.currentTarget.value = "";
                      return;
                    }

                    if (newsReplacePdfId) {
                      const it = newsImageItems.find((x) => x.id === newsReplacePdfId);
                      if (!firstPdf) setItemError("Selecione um arquivo PDF.");
                      else if (it) void replaceNewsPdf(it, firstPdf);
                      e.currentTarget.value = "";
                      return;
                    }

                    setItemError(null);
                    setNewsNewFiles((prev) => {
                      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
                      const next = [...prev];
                      for (const f of files) {
                        if (!isNewsImageFileType(f) && !isNewsPdfFileType(f)) continue;
                        const key = `${f.name}|${f.size}|${f.lastModified}`;
                        if (!seen.has(key)) next.push(f);
                      }
                      return next;
                    });
                    e.currentTarget.value = "";
                  }}
                />
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nova notícia</p>
                  <p className="text-xs text-slate-400">
                    <strong className="text-slate-200">Capa no portal:</strong> proporção sugerida{" "}
                    <strong className="text-slate-200">16:9</strong> (ex.: 1280×720). A capa pode ser a mesma imagem principal,
                    só o PDF (ícone até abrir) ou uma imagem separada.
                  </p>
                  <label className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="font-semibold text-slate-200">Mês de referência</span>
                    <input
                      type="month"
                      value={newsReferenceMonth}
                      onChange={(e) => setNewsReferenceMonth(e.target.value)}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400/60"
                    />
                    <span className="text-[11px] text-slate-400">
                      Define em qual mês a notícia aparece no portal. As dos meses anteriores continuam
                      disponíveis no seletor de período.
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => {
                        setNewsReplaceThumbId(null);
                        setNewsReplacePdfId(null);
                        setNewsReplaceCoverId(null);
                        newsAddAnyFileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {newsNewFiles.length ? `Arquivos da notícia (${newsNewFiles.length})` : "Anexar imagem ou PDF"}
                    </button>
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => {
                        setNewsReplaceThumbId(null);
                        setNewsReplacePdfId(null);
                        setNewsReplaceCoverId(null);
                        newsCoverInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {newsCoverFile ? "Trocar capa (opcional)" : "Capa opcional (imagem)"}
                    </button>
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => void createNewsFromModal()}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {savingItem ? "Salvando…" : "Publicar 1 notícia"}
                    </button>
                    <button
                      type="button"
                      disabled={savingItem || newsNewFiles.length < 2}
                      onClick={() => void publishEachSelectedFileAsNews()}
                      className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-2 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-40"
                      title="Cada imagem ou PDF vira uma notícia; se houver o mesmo número de imagens e PDFs, são pareados na ordem."
                    >
                      {savingItem ? "Salvando…" : "Publicar cada arquivo"}
                    </button>
                  </div>
                  {newsNewFiles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>
                        Selecionados: <strong className="text-slate-200">{newsNewThumbs.length}</strong> imagem(ns) e{" "}
                        <strong className="text-slate-200">{newsNewPdfs.length}</strong> PDF(s)
                      </span>
                      <button
                        type="button"
                        disabled={savingItem}
                        onClick={() => {
                          setNewsNewFiles([]);
                          if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
                          setNewsSelectedThumbKey(null);
                          setNewsSelectedPdfKey(null);
                          setNewsCoverFile(null);
                          if (newsCoverInputRef.current) newsCoverInputRef.current.value = "";
                          setNewsFocalX(50);
                          setNewsFocalY(50);
                        }}
                        className="ml-auto text-[11px] font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  )}
                  {(newsNewFiles.length > 0 || effectiveThumb) && (
                    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Composição da notícia</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-400">Escolha a imagem principal</p>
                          {newsNewThumbs.length === 0 ? (
                            <p className="text-xs text-slate-400">
                              Sem imagem principal (se publicar só PDF, usamos ícone até abrir o PDF).
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {newsNewThumbs.map((f) => {
                                const key = fileKey(f);
                                const selected = key === newsSelectedThumbKey;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={savingItem}
                                    onClick={() => setNewsSelectedThumbKey(key)}
                                    className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs ${
                                      selected
                                        ? "border-fuchsia-400/60 bg-fuchsia-500/10 text-white"
                                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                                    }`}
                                  >
                                    {f.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-400">Escolha o PDF</p>
                          {newsNewPdfs.length === 0 ? (
                            <p className="text-xs text-slate-400">Sem PDF (se publicar só PNG, a notícia será a própria imagem).</p>
                          ) : (
                            <div className="space-y-1">
                              {newsNewPdfs.map((f) => {
                                const key = fileKey(f);
                                const selected = key === newsSelectedPdfKey;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={savingItem}
                                    onClick={() => setNewsSelectedPdfKey(key)}
                                    className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs ${
                                      selected
                                        ? "border-fuchsia-400/60 bg-fuchsia-500/10 text-white"
                                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                                    }`}
                                  >
                                    {f.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      {newsCoverPreviewUrl && (
                        <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                          <p className="text-[11px] text-slate-400 mb-2">Prévia da capa opcional</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={newsCoverPreviewUrl}
                            alt=""
                            className="mx-auto max-h-32 w-auto max-w-full rounded object-contain"
                          />
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-[11px] text-slate-400">
                          Posição horizontal (X): <span className="text-slate-200">{newsFocalX}%</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={newsFocalX}
                            onChange={(e) => setNewsFocalX(Number(e.target.value))}
                            className="mt-1 w-full"
                            disabled={savingItem}
                          />
                        </label>
                        <label className="text-[11px] text-slate-400">
                          Posição vertical (Y): <span className="text-slate-200">{newsFocalY}%</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={newsFocalY}
                            onChange={(e) => setNewsFocalY(Number(e.target.value))}
                            className="mt-1 w-full"
                            disabled={savingItem}
                          />
                        </label>
                      </div>
                      {effectiveThumbPreviewUrl && (
                        <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                          <div className="text-[11px] text-slate-400 mb-2">Prévia</div>
                          <div className="relative h-40 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={effectiveThumbPreviewUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              style={{ objectPosition: `${newsFocalX}% ${newsFocalY}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                </div>
                <ul className="space-y-4">
                  {newsImageItems.map((it) => {
                    const title = newsTitleDrafts[it.id] ?? String(it.title || "").trim();
                    return (
                      <li
                        key={it.id}
                        className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4"
                      >
                        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Nome da notícia
                          <input
                            type="text"
                            value={title}
                            onChange={(e) =>
                              setNewsTitleDrafts((p) => ({ ...p, [it.id]: e.target.value }))
                            }
                            placeholder="Ex.: Radar WPS — Abril"
                            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
                          />
                        </label>

                        <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Mês no portal
                          <input
                            type="month"
                            disabled={savingItem}
                            value={newsPeriodKey(it)}
                            onChange={(e) => void updateNewsReferenceMonth(it, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                          />
                        </label>

                        <div className="mb-2 grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              setNewsReplaceCoverId(null);
                              setNewsReplacePdfId(null);
                              setNewsReplaceThumbId(it.id);
                              newsAddAnyFileInputRef.current?.click();
                            }}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                          >
                            Imagem principal
                          </button>
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              setNewsReplaceThumbId(null);
                              setNewsReplacePdfId(null);
                              setNewsReplaceCoverId(it.id);
                              newsCoverInputRef.current?.click();
                            }}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                          >
                            Capa (opcional)
                          </button>
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              setNewsReplaceThumbId(null);
                              setNewsReplaceCoverId(null);
                              setNewsReplacePdfId(it.id);
                              newsAddAnyFileInputRef.current?.click();
                            }}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                          >
                            {parseNewsPdfUrl(it.metadata) ? "Trocar PDF" : "Anexar PDF"}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => void saveNewsItemTitle(it)}
                            className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-500 disabled:opacity-50"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => setConfirmDeleteItem(it)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {newsImageItems.length === 0 && (
                  <p className="text-center text-xs text-slate-500">Nenhuma imagem ainda. Anexe a primeira acima.</p>
                )}
              </div>
            )}

            {manageSlug === SLUG.awards && (
              <div className="mb-4 space-y-4">
                <p className="text-[11px] text-slate-400">
                  Configure os três lugares do pódio (foto, nome, cargo e pontos). Atualize todo mês conforme o ranking.
                </p>
                <input
                  ref={inspirationFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleInspirationPhotoPick(f);
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {([1, 2, 3] as const).map((rank) => {
                    const slot = inspirationSlots[rank];
                    const label = rank === 1 ? "1º lugar" : rank === 2 ? "2º lugar" : "3º lugar";
                    return (
                      <div
                        key={rank}
                        className="rounded-2xl border border-white/10 bg-black/30 p-3 space-y-2.5"
                      >
                        <p className="text-center text-xs font-bold uppercase tracking-wide text-amber-200">{label}</p>
                        <div className="relative mx-auto h-[118px] w-[118px] max-w-full">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
                          <div className="absolute inset-[2px] overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
                            {slot.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={publicFileUrl(slot.imageUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">Foto</div>
                            )}
                          </div>
                          <PodiumMedal rank={rank} />
                        </div>
                        <button
                          type="button"
                          disabled={savingItem}
                          onClick={() => {
                            setInspirationUploadRank(rank);
                            inspirationFileInputRef.current?.click();
                          }}
                          className="w-full rounded-lg border border-white/15 bg-white/5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                        >
                          {savingItem ? "Aguarde…" : "Trocar foto"}
                        </button>
                        <input
                          type="text"
                          value={slot.name}
                          onChange={(e) =>
                            setInspirationSlots((p) => ({ ...p, [rank]: { ...p[rank], name: e.target.value } }))
                          }
                          placeholder="Nome"
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                        />
                        <input
                          type="text"
                          value={slot.cargo}
                          onChange={(e) =>
                            setInspirationSlots((p) => ({ ...p, [rank]: { ...p[rank], cargo: e.target.value } }))
                          }
                          placeholder="Cargo"
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                        />
                        <input
                          type="number"
                          min={0}
                          value={slot.points}
                          onChange={(e) =>
                            setInspirationSlots((p) => ({ ...p, [rank]: { ...p[rank], points: e.target.value } }))
                          }
                          placeholder="Pontos"
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                        />
                        {slot.id && (
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              const it = awardItems.find((x) => x.id === slot.id);
                              if (it) setConfirmDeleteItem(it);
                            }}
                            className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-1.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Remover do pódio
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => void saveInspirationFromModal()}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingItem ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            )}

            {manageSlug && PORTAL_IMAGE_SECTION_SLUGS.has(manageSlug) && (
              <div className="mb-4 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-[11px] text-slate-400">
                  Envie uma imagem (PNG, JPG, WebP ou GIF). Se já existir uma imagem, o novo arquivo substitui a anterior.
                </p>
                <input
                  ref={portalImageFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void replaceOrCreatePortalSectionImage(f);
                  }}
                />

                {manageSlug === SLUG.employee && (
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Ajuste de exibição (WPSer do mês)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEmployeeImageFit("contain")}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          employeeImageFit === "contain"
                            ? "bg-violet-600 text-white"
                            : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Sem corte
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmployeeImageFit("cover")}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          employeeImageFit === "cover"
                            ? "bg-violet-600 text-white"
                            : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Preencher (pode cortar)
                      </button>
                    </div>

                    {employeeImageFit === "cover" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-[11px] text-slate-300">
                          Posição horizontal
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={employeeFocalX}
                            onChange={(e) => setEmployeeFocalX(Number(e.target.value))}
                            className="mt-1 w-full"
                          />
                        </label>
                        <label className="text-[11px] text-slate-300">
                          Posição vertical
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={employeeFocalY}
                            onChange={(e) => setEmployeeFocalY(Number(e.target.value))}
                            className="mt-1 w-full"
                          />
                        </label>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500">
                      Dica: “Sem corte” mostra a imagem inteira. “Preencher” ocupa todo o card, mas pode cortar — use as barras para ajustar.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => portalImageFileInputRef.current?.click()}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingItem ? "Enviando…" : "Anexar arquivo"}
                </button>
                {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                {currentManageImageItem ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    {manageSlug === SLUG.employee ? (
                      <PortalItemImage
                        itemId={currentManageImageItem.id}
                        srcRaw={currentManageImageItem.content}
                        alt={currentManageImageItem.title}
                        className={`w-full bg-black/20 ${
                          employeeImageFit === "cover" ? "aspect-video object-cover" : "h-auto max-h-[min(520px,60vh)] object-contain"
                        }`}
                        style={
                          employeeImageFit === "cover"
                            ? { objectPosition: `${employeeFocalX}% ${employeeFocalY}%` }
                            : undefined
                        }
                      />
                    ) : (
                    <PortalItemImage
                      itemId={currentManageImageItem.id}
                      srcRaw={currentManageImageItem.content}
                      alt={currentManageImageItem.title}
                      className="aspect-video w-full object-cover"
                    />
                    )}
                    <div className="flex justify-end border-t border-white/10 p-3">
                      {manageSlug === SLUG.employee && (
                        <button
                          type="button"
                          disabled={savingItem}
                          onClick={() => void saveEmployeeImageDisplaySettings()}
                          className="mr-auto inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-50"
                        >
                          Salvar ajuste
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingItem}
                        onClick={() => setConfirmDeleteItem(currentManageImageItem)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-500">Nenhuma imagem anexada ainda.</p>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {newsLightboxItem && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-3 sm:p-5"
          role="presentation"
          onClick={() => setNewsLightboxItem(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-[102] rounded-full border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation();
              setNewsLightboxItem(null);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[92vh] w-full max-w-[min(96vw,1600px)] overflow-auto rounded-xl border border-white/10 bg-slate-950/90 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {parseNewsPdfUrl(newsLightboxItem.metadata) ? (
              newsExpandedPdfLoading ? (
                <p className="py-20 text-center text-slate-300">Carregando PDF…</p>
              ) : newsExpandedPdfBlobUrl ? (
                <iframe
                  title={newsDisplayCaption(newsLightboxItem)}
                  src={newsExpandedPdfBlobUrl}
                  className="mx-auto block h-[min(88vh,1100px)] w-full min-h-[50vh] rounded-lg bg-white"
                />
              ) : (
                <p className="py-10 text-center text-red-200">Não foi possível carregar o PDF.</p>
              )
            ) : (
              <PortalItemImage
                itemId={newsLightboxItem.id}
                srcRaw={newsLightboxItem.content}
                alt={newsDisplayCaption(newsLightboxItem)}
                className="mx-auto block max-h-[92vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
          <p className="mt-3 max-w-2xl px-2 text-center text-sm font-medium text-slate-200">
            {newsDisplayCaption(newsLightboxItem)}
          </p>
          <p className="mt-1 text-center text-[10px] text-slate-500">
            {parseNewsPdfUrl(newsLightboxItem.metadata)
              ? "Use os controles do leitor de PDF ou role a página."
              : "Role a tela se a imagem for maior que a janela."}
          </p>
        </div>
      )}

      {confirmDeleteItem && (
        <ConfirmModal
          title={
            isInspirationItem(confirmDeleteItem)
              ? "Remover do pódio"
              : isImageItem(confirmDeleteItem)
                ? "Excluir imagem"
                : "Excluir item"
          }
          message={
            isInspirationItem(confirmDeleteItem)
              ? `Remover "${confirmDeleteItem.title || "este colaborador"}" do pódio de inspiração? Esta ação não pode ser desfeita.`
              : isImageItem(confirmDeleteItem)
                ? "Deseja realmente excluir esta imagem? Esta ação não pode ser desfeita."
                : `Deseja realmente excluir "${confirmDeleteItem.title}"? Esta ação não pode ser desfeita.`
          }
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => void confirmRemovePortalItem()}
          onCancel={() => setConfirmDeleteItem(null)}
        />
      )}

      {/* Modal: novo evento */}
      {manageEventsOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="presentation"
          onPointerDown={(e) => {
            overlayPointerDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
            overlayPointerDownRef.current = false;
            if (shouldClose) {
              setManageEventsOpen(false);
              setEvError(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Novo evento</h3>
              <button
                type="button"
                onClick={() => {
                  setManageEventsOpen(false);
                  setEvError(null);
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                placeholder="Título do evento"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              <input
                type="date"
                value={evDate}
                onChange={(e) => setEvDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={evDesc}
                onChange={(e) => setEvDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              {evError && <p className="text-xs text-red-400">{evError}</p>}
              <button
                type="button"
                disabled={savingEv}
                onClick={() => void handleCreateEvent()}
                className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingEv ? "Salvando…" : "Salvar evento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
