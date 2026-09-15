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
  ImagePlus,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  PartyPopper,
  Plus,
  Sparkles,
  Trash2,
  X,
  Rocket,
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

type ProductUpdate = {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  createdAt?: string;
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
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
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-white">
              Enviado com sucesso. Obrigado pelo feedback.
            </div>
          )}
          {props.error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-white">
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

function inspirationItemsByRank(items: PortalItem[]): Record<InspirationRank, PortalItem[]> {
  const out: Record<InspirationRank, PortalItem[]> = { 1: [], 2: [], 3: [] };
  for (const it of items) {
    const p = parseInspirationMeta(it);
    if (!p) continue;
    if (it.content?.trim() || String(it.type || "").toLowerCase() === "inspiration") {
      out[p.rank].push(it);
    }
  }
  const byNewest = (a: PortalItem, b: PortalItem) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  };
  out[1].sort(byNewest);
  out[2].sort(byNewest);
  out[3].sort(byNewest);
  return out;
}

function inspirationItemByRank(items: PortalItem[]): Record<InspirationRank, PortalItem | null> {
  const lists = inspirationItemsByRank(items);
  return {
    1: lists[1][0] ?? null,
    2: lists[2][0] ?? null,
    3: lists[3][0] ?? null,
  };
}

function sortImagesNewestFirst(items: PortalItem[]): PortalItem[] {
  return [...items]
    .filter(isImageItem)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
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
  const [newsNewFile, setNewsNewFile] = useState<File | null>(null);
  const [newsNewTitle, setNewsNewTitle] = useState("");
  const inspirationFileInputRef = useRef<HTMLInputElement>(null);
  const [inspirationUploadRank, setInspirationUploadRank] = useState<InspirationRank | null>(null);
  const [inspirationSlots, setInspirationSlots] = useState<Record<InspirationRank, InspirationSlotDraft>>(emptyInspirationSlots);

  const [newsLightboxItem, setNewsLightboxItem] = useState<PortalItem | null>(null);
  const [newsExpandedPdfBlobUrl, setNewsExpandedPdfBlobUrl] = useState<string | null>(null);
  const [newsExpandedPdfLoading, setNewsExpandedPdfLoading] = useState(false);

  const [employeeImageFit, setEmployeeImageFit] = useState<EmployeeImageFit>("contain");
  const [employeeFocalX, setEmployeeFocalX] = useState(50);
  const [employeeFocalY, setEmployeeFocalY] = useState(50);
  const [employeeGalleryIndex, setEmployeeGalleryIndex] = useState(0);
  const [inspirationGalleryIndex, setInspirationGalleryIndex] = useState<Record<InspirationRank, number>>({
    1: 0,
    2: 0,
    3: 0,
  });
  const [productUpdates, setProductUpdates] = useState<ProductUpdate[]>([]);

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
  const employeeGallery = useMemo(() => sortImagesNewestFirst(employeeItems), [employeeItems]);
  const inspirationGalleryByRank = useMemo(() => inspirationItemsByRank(awardItems), [awardItems]);

  useEffect(() => {
    setEmployeeGalleryIndex((i) => Math.min(i, Math.max(0, employeeGallery.length - 1)));
  }, [employeeGallery.length]);

  useEffect(() => {
    setInspirationGalleryIndex((prev) => ({
      1: Math.min(prev[1], Math.max(0, inspirationGalleryByRank[1].length - 1)),
      2: Math.min(prev[2], Math.max(0, inspirationGalleryByRank[2].length - 1)),
      3: Math.min(prev[3], Math.max(0, inspirationGalleryByRank[3].length - 1)),
    }));
  }, [
    inspirationGalleryByRank[1].length,
    inspirationGalleryByRank[2].length,
    inspirationGalleryByRank[3].length,
  ]);

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

  // Abre em "Todos os meses" para manter o histórico navegável no carrossel.
  useEffect(() => {
    if (newsPeriods.length === 0) return;
    setNewsPeriod((current) => {
      if (current === NEWS_ALL_PERIODS) return current;
      if (current && newsPeriods.some((p) => p.key === current)) return current;
      return newsPeriods.length > 1 ? NEWS_ALL_PERIODS : newsPeriods[0]!.key;
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

  const loadProductUpdates = useCallback(async () => {
    const res = await apiFetch("/api/product-updates?limit=30");
    if (!res.ok) {
      setProductUpdates([]);
      return;
    }
    const data = (await res.json()) as { items?: ProductUpdate[] };
    setProductUpdates(Array.isArray(data?.items) ? data.items : []);
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
        loadProductUpdates(),
      ]);
      setNewsPageIndex(0);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [loadBootstrap, loadUpcomingEvents, loadCalendarMeta, loadProductUpdates]);

  // Carga inicial: só as seções da tela da empresa + próximos eventos.
  // Os eventos/aniversários do mês vêm do efeito de calendário abaixo.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      setLoading(true);
      try {
        await Promise.all([
          loadBootstrap(PORTAL_VIEW_SLUGS.empresa),
          loadUpcomingEvents(),
          loadProductUpdates(),
        ]);
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBootstrap, loadUpcomingEvents, loadProductUpdates]);

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

  /** Anexa nova imagem ao WPSer do mês (mantém histórico para Voltar). */
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
      const metadata =
        slug === SLUG.employee
          ? buildEmployeeImageMetadata(null, {
              fit: employeeImageFit,
              focalX: employeeFocalX,
              focalY: employeeFocalY,
            })
          : null;

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

      await refreshAll();
      setEmployeeGalleryIndex(0);
      if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSavingItem(false);
    }
  }

  function clearNewsDraft() {
    setNewsReferenceMonth(currentReferenceMonth());
    setNewsNewFile(null);
    setNewsNewTitle("");
    if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
  }

  async function publishNewsFromModal() {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) {
      setItemError("Seção de notícias não encontrada.");
      return;
    }
    if (!newsNewFile) {
      setItemError("Anexe uma imagem (PNG, JPG ou WebP).");
      return;
    }
    const title = newsNewTitle.trim();
    if (!title) {
      setItemError("Informe o nome da notícia.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const thumbUrl = await uploadPortalMedia(newsNewFile);
      const metadata = buildNewsMetadata(null, {
        focalX: 50,
        focalY: 50,
        marker: "",
        pdfUrl: null,
        referenceMonth: newsReferenceMonth || currentReferenceMonth(),
      });
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title,
          content: thumbUrl,
          type: "image",
          metadata,
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar notícia.");
      await refreshAll();
      clearNewsDraft();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
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
    const imageUrl = slot.imageUrl.trim();
    const empty = !imageUrl;

    if (empty) {
      if (slot.id) {
        const res = await apiFetch(`/api/portal/items/${slot.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || "Erro ao remover imagem.");
        }
      }
      return;
    }

    const title = `Pódio — ${rank}º lugar`;
    const metadata = { rank };
    const body = { title, content: imageUrl, type: "inspiration", metadata };

    if (slot.id) {
      const res = await apiFetch(`/api/portal/items/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao atualizar imagem.");
    } else {
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, ...body, isActive: true }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar imagem.");
    }
  }

  async function saveInspirationFromModal() {
    const sectionId = sectionIdBySlug[SLUG.awards];
    if (!sectionId) {
      setItemError("Seção do pódio não encontrada.");
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
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title: `Pódio — ${rank}º lugar`,
          content: url,
          type: "inspiration",
          metadata: { rank },
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar imagem.");
      await refreshAll();
      setInspirationGalleryIndex((prev) => ({ ...prev, [rank]: 0 }));
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
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
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
          <header className="mb-8 border-b border-[color:var(--border)] bg-[color:var(--surface-2)] backdrop-blur-md -mx-4 -mt-8 px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/30">
                  <LayoutGrid className="h-5 w-5 text-white" aria-hidden />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[color:var(--foreground)] sm:text-2xl">Portal colaborativo</h1>
                  <p className="mt-1 max-w-xl text-sm text-[color:var(--muted-foreground)]">
                    Intranet WPS: notícias, destaques, manuais, agenda e pessoas — conteúdo publicado pelo administrador do portal.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-4 sm:w-auto sm:min-w-[280px] lg:items-end">
                <p className="w-full text-center text-base font-semibold capitalize leading-snug tracking-wide text-[color:var(--foreground)]  sm:text-lg lg:text-right">
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
          <p className="text-center text-sm text-[color:var(--muted-foreground)]">Carregando portal…</p>
        )}
        {loadError && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm text-red-100">
            {loadError}
          </div>
        )}

        {!loading && missingSlugs.length > 0 && (
          <div className="mb-8 flex flex-col items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950">
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
        <div className="space-y-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            {/* Notícias — carrossel de imagens */}
            <section className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-fuchsia-700" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]">Notícias</h2>
                </div>
                <div className="flex items-center gap-2">
                {(newsPeriods.length > 0 || newsImageItems.length > 0) && (
                  <label className="flex items-center gap-1.5 text-[11px] text-[color:var(--muted-foreground)]">
                    <span className="sr-only">Período das notícias</span>
                    <CalendarDays className="h-3.5 w-3.5 text-[color:var(--muted-foreground)]" />
                    <select
                      value={newsPeriod ?? (newsPeriods.length > 1 ? NEWS_ALL_PERIODS : newsPeriods[0]?.key ?? NEWS_ALL_PERIODS)}
                      onChange={(e) => setNewsPeriod(e.target.value)}
                      className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--foreground)] outline-none focus:border-fuchsia-400/60"
                    >
                      <option value={NEWS_ALL_PERIODS} className="text-slate-900">
                        Todos os meses ({newsImageItems.length})
                      </option>
                      {newsPeriods.map((p) => (
                        <option key={p.key} value={p.key} className="text-slate-900">
                          {p.label} ({p.count})
                        </option>
                      ))}
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)]"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Gerenciar
                  </button>
                )}
                </div>
              </div>
              <div className="relative w-full bg-[color:var(--surface-2)] min-h-[320px] sm:min-h-[420px]">
                {newsCount > 0 && activeNews ? (
                  <div className="relative w-full">
                    <div className="relative aspect-[16/9] min-h-[320px] w-full overflow-hidden bg-[color:var(--surface-2)] sm:min-h-[440px] lg:min-h-[520px]">
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
                        {newsCount > 1 ? (
                          <p className="mt-1 text-[11px] font-medium text-white/80">
                            {newsPageIndex + 1} de {newsCount}
                          </p>
                        ) : null}
                      </div>

                      {newsCount > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Anterior"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setNewsPageIndex((i) => (i - 1 + newsPageCount) % newsPageCount);
                            }}
                            className="absolute left-3 top-1/2 z-[5] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/20 hover:bg-black/75"
                          >
                            <ChevronLeft className="h-7 w-7" />
                          </button>
                          <button
                            type="button"
                            aria-label="Próximo"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setNewsPageIndex((i) => (i + 1) % newsPageCount);
                            }}
                            className="absolute right-3 top-1/2 z-[5] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/20 hover:bg-black/75"
                          >
                            <ChevronRight className="h-7 w-7" />
                          </button>
                        </>
                      )}
                    </div>

                    {newsCount > 1 && (
                      <div className="pointer-events-auto flex justify-center gap-1.5 py-3">
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

                    {newsImageItems.length > 1 && (
                      <div className="border-t border-[color:var(--border)] px-4 py-3 sm:px-5">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                          Histórico de notícias
                        </p>
                        <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                          {newsImageItems.map((item, idx) => {
                            const inCarousel = newsCarousel.some((n) => n.id === item.id);
                            const carouselIdx = newsCarousel.findIndex((n) => n.id === item.id);
                            const active = inCarousel && carouselIdx === newsPageIndex;
                            const when = item.createdAt
                              ? new Date(item.createdAt).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : newsPeriodLabel(newsPeriodKey(item));
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newsPeriod !== NEWS_ALL_PERIODS) setNewsPeriod(NEWS_ALL_PERIODS);
                                    window.setTimeout(() => {
                                      const allIdx = newsImageItems.findIndex((n) => n.id === item.id);
                                      if (allIdx >= 0) setNewsPageIndex(allIdx);
                                    }, 0);
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition ${
                                    active
                                      ? "bg-fuchsia-500/20 text-white ring-1 ring-fuchsia-400/40"
                                      : "bg-[color:var(--surface)] text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-2)]"
                                  }`}
                                >
                                  <span className="min-w-0 truncate font-medium">
                                    {newsDisplayCaption(item) || `Notícia ${idx + 1}`}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-[color:var(--muted-foreground)]">{when}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-[color:var(--muted-foreground)] sm:min-h-[420px]">
                    <ImagePlus className="h-10 w-10 opacity-50" />
                    <p className="text-sm">Nenhuma imagem de notícia ainda.</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          clearNewsDraft();
                          setManageSlug(SLUG.news);
                        }}
                        className="text-xs font-semibold text-fuchsia-700 hover:underline"
                      >
                        Enviar primeira imagem
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Pódio de imagens — sem título de seção */}
            <section className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-lg sm:p-4">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setManageSlug(SLUG.awards);
                    setItemError(null);
                  }}
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--foreground)]"
                >
                  <ImagePlus className="h-3 w-3" />
                  Gerenciar
                </button>
              )}
              <div className={`flex flex-wrap items-start justify-center gap-5 sm:gap-8 px-1 pb-1 ${canEdit ? "pt-6" : ""}`}>
                {([1, 2, 3] as const).map((rank) => {
                  const gallery = inspirationGalleryByRank[rank];
                  const idx = Math.min(inspirationGalleryIndex[rank], Math.max(0, gallery.length - 1));
                  const item = gallery[idx] ?? null;
                  const photo = item?.content?.trim() || "";
                  return (
                    <div key={rank} className="flex w-[128px] shrink-0 flex-col items-center sm:w-[138px]">
                      <div className="relative mx-auto aspect-square w-[96px] max-w-full sm:w-[104px]">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-100/80 to-orange-50 shadow-inner ring-1 ring-amber-300/40" />
                        <div className="absolute inset-[2px] overflow-hidden rounded-full bg-[color:var(--surface)] ring-1 ring-[color:var(--border)]">
                          {photo && item ? (
                            <PortalItemImage itemId={item.id} srcRaw={photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[color:var(--surface-2)] px-2 text-center text-[9px] font-medium text-[color:var(--muted-foreground)]">
                              <ImagePlus className="h-4 w-4 opacity-60" />
                              Anexar
                            </div>
                          )}
                        </div>
                        <PodiumMedal rank={rank} size="sm" />
                      </div>
                      {gallery.length > 1 ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Voltar imagem anterior"
                            disabled={idx >= gallery.length - 1}
                            onClick={() =>
                              setInspirationGalleryIndex((prev) => ({
                                ...prev,
                                [rank]: Math.min(gallery.length - 1, prev[rank] + 1),
                              }))
                            }
                            className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] p-1 text-[color:var(--foreground)] disabled:opacity-35"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[9px] tabular-nums text-[color:var(--muted-foreground)]">
                            {idx + 1}/{gallery.length}
                          </span>
                          <button
                            type="button"
                            aria-label="Próxima imagem"
                            disabled={idx <= 0}
                            onClick={() =>
                              setInspirationGalleryIndex((prev) => ({
                                ...prev,
                                [rank]: Math.max(0, prev[rank] - 1),
                              }))
                            }
                            className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] p-1 text-[color:var(--foreground)] disabled:opacity-35"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 h-6" />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Coluna direita: agenda, aniversariantes e WPSer do mês */}
          <div className="flex w-full min-w-0 flex-col gap-6">
            <section className="w-full rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-xl backdrop-blur sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-sky-700" />
                  <h2 className="text-sm font-semibold text-[color:var(--foreground)]">Agenda</h2>
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
                    className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-1 text-xs text-[color:var(--foreground)]"
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
                    className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-1 text-xs text-[color:var(--foreground)]"
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
                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-500/30"
                    >
                      <Plus className="h-3 w-3" />
                      Evento
                    </button>
                  )}
                </div>
              </div>

              {!isSelectedCurrentMonth && upcomingEvents.length > 0 && (
                <div className="mb-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]/90">
                    Próximos eventos
                  </p>
                  <ul className="space-y-2">
                    {upcomingEvents.slice(0, 3).map((ev) => (
                      <li key={ev.id} className="flex items-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/25 to-violet-600/25 text-center">
                          <span className="text-[9px] font-bold uppercase text-sky-800">
                            {new Date(ev.date).toLocaleDateString("pt-BR", { month: "short" })}
                          </span>
                          <span className="text-base font-bold leading-none text-[color:var(--foreground)]">
                            {new Date(ev.date).getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">{ev.title}</p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--muted-foreground)]">
                            {new Date(ev.date).toLocaleDateString("pt-BR", { weekday: "short", year: "numeric" })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {displayedMonthEvents.length === 0 ? (
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {isSelectedCurrentMonth && eventsForSelectedMonth.length > 0 && !calendarFilterEngaged
                    ? "Nenhum evento futuro neste mês."
                    : "Nenhum evento neste mês."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {displayedMonthEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5"
                    >
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-violet-600/30 text-center">
                        <span className="text-[10px] font-bold uppercase text-sky-800">
                          {new Date(ev.date).toLocaleDateString("pt-BR", { month: "short" })}
                        </span>
                        <span className="text-lg font-bold leading-none text-[color:var(--foreground)]">
                          {new Date(ev.date).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[color:var(--foreground)]">{ev.title}</p>
                        {ev.description && (
                          <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)] line-clamp-2">{ev.description}</p>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEvent(ev.id)}
                          className="self-start rounded-lg p-1 text-[color:var(--muted-foreground)] hover:bg-red-500/20 hover:text-red-300"
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

            <section className="w-full rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-xl sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                <PartyPopper className="h-4 w-4 text-[color:var(--primary)]" />
                Aniversariantes do mês
              </h2>
              {birthdays.length === 0 ? (
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Ninguém com data de nascimento cadastrada neste mês.
                </p>
              ) : (
                <ul className="space-y-2">
                  {birthdays.map((b) => {
                    const d = b.birthDate ? new Date(b.birthDate) : null;
                    const day = d ? d.getUTCDate() : "—";
                    const monthShort = d
                      ? d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "")
                      : "";
                    return (
                      <li
                        key={b.id}
                        className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5"
                      >
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[color:var(--primary)] text-center text-white shadow-sm">
                          <span className="text-[9px] font-bold uppercase leading-none opacity-90">{monthShort}</span>
                          <span className="text-lg font-black leading-none">{day}</span>
                        </div>
                        <Avatar
                          name={b.name}
                          avatarUrl={b.avatarUrl}
                          size={40}
                          className="ring-1 ring-[color:var(--border)]"
                          imgClassName="object-cover"
                          fallbackClassName="text-xs font-bold"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">{b.name}</p>
                          {b.cargo ? (
                            <p className="truncate text-[11px] text-[color:var(--muted-foreground)]">{b.cargo}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Área de imagem (ex-WPSer) — sem título de seção */}
            <section className="relative w-full overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-xl sm:p-4">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setManageSlug(SLUG.employee);
                    setItemError(null);
                  }}
                  className="absolute right-3 top-3 z-10 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--foreground)]"
                >
                  Gerenciar
                </button>
              )}
              <div className="relative w-full overflow-hidden rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-2)]">
                {employeeGallery.length > 0 ? (
                  (() => {
                    const idx = Math.min(employeeGalleryIndex, employeeGallery.length - 1);
                    const it = employeeGallery[idx]!;
                    const fit = parseEmployeeImageFit(it.metadata);
                    const focal = parseEmployeeFocal(it.metadata);
                    return (
                      <>
                        <PortalItemImage
                          itemId={it.id}
                          srcRaw={it.content}
                          alt=""
                          className={`w-full max-w-full bg-[color:var(--surface-2)] max-h-[min(520px,60vh)] ${
                            fit === "cover" ? "h-[min(520px,60vh)] object-cover" : "h-auto object-contain"
                          }`}
                          style={fit === "cover" ? { objectPosition: `${focal.x}% ${focal.y}%` } : undefined}
                        />
                        {employeeGallery.length > 1 ? (
                          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border)] px-3 py-2">
                            <button
                              type="button"
                              disabled={idx >= employeeGallery.length - 1}
                              onClick={() =>
                                setEmployeeGalleryIndex((i) => Math.min(employeeGallery.length - 1, i + 1))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--foreground)] disabled:opacity-40"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              Voltar
                            </button>
                            <span className="text-[11px] tabular-nums text-[color:var(--muted-foreground)]">
                              {idx + 1} de {employeeGallery.length}
                            </span>
                            <button
                              type="button"
                              disabled={idx <= 0}
                              onClick={() => setEmployeeGalleryIndex((i) => Math.max(0, i - 1))}
                              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--foreground)] disabled:opacity-40"
                            >
                              Avançar
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  <div className="flex min-h-[220px] w-full max-w-full flex-col items-center justify-center gap-2 text-center text-[color:var(--muted-foreground)]">
                    <ImagePlus className="h-8 w-8 opacity-50" />
                    <p className="text-xs px-4">Anexe uma imagem</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-violet-400/25 bg-[color:var(--surface)] shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]">
                Atualizações do WPS One
              </h2>
            </div>
          </div>
          <div className="px-4 py-4 sm:px-5">
            {productUpdates.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Em breve publicaremos novidades e melhorias do produto por aqui.
              </p>
            ) : (
              <ul className="space-y-3">
                {productUpdates.map((item) => {
                  const whenRaw = item.publishedAt || item.createdAt || "";
                  const when = whenRaw
                    ? new Date(whenRaw).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  return (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">{item.title}</h3>
                        <time className="shrink-0 text-[11px] text-violet-700">{when}</time>
                      </div>
                      {item.content?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                          {item.content}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
        </div>
        )}

        {portalView === "admin" && (
          <div className="mx-auto max-w-4xl space-y-4 px-1">
            <div className="flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-3">
              {ADMIN_PORTAL_SUBSECTIONS.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setAdminTab(s.slug)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    adminTab === s.slug
                      ? "bg-violet-600 text-white"
                      : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)]"
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
              }
              setManageSlug(null);
              setItemError(null);
              setConfirmDeleteItem(null);
              setInspirationUploadRank(null);
              if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
              if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
              if (inspirationFileInputRef.current) inspirationFileInputRef.current.value = "";
            }
          }}
        >
          <div
            className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl ${
              manageSlug === SLUG.awards ? "max-w-4xl" : "max-w-lg"
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                {manageSlug === SLUG.news && "Notícias"}
                {manageSlug === SLUG.employee && "Anexar imagem"}
                {manageSlug === SLUG.awards && "Anexar imagens do pódio"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (manageSlug === SLUG.news) {
                    clearNewsDraft();
                  }
                  setManageSlug(null);
                  setItemError(null);
                  setConfirmDeleteItem(null);
                  setInspirationUploadRank(null);
                  if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
                  if (newsAddAnyFileInputRef.current) newsAddAnyFileInputRef.current.value = "";
                  if (inspirationFileInputRef.current) inspirationFileInputRef.current.value = "";
                }}
                className="rounded-full px-2 py-1 text-xs text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--foreground)]"
              >
                Fechar
              </button>
            </div>

            {manageSlug === SLUG.news && (
              <div className="mb-4 space-y-5">
                <input
                  ref={newsAddAnyFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.currentTarget.value = "";
                    if (!f) return;
                    if (!isNewsImageFileType(f)) {
                      setItemError("Selecione uma imagem PNG, JPG ou WebP.");
                      return;
                    }
                    setItemError(null);
                    setNewsNewFile(f);
                    if (!newsNewTitle.trim()) {
                      const inferred = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
                      if (inferred) setNewsNewTitle(inferred);
                    }
                  }}
                />
                <div className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Nova notícia
                  </p>
                  <label className="block text-[11px] text-[color:var(--muted-foreground)]">
                    Nome
                    <input
                      type="text"
                      value={newsNewTitle}
                      onChange={(e) => setNewsNewTitle(e.target.value)}
                      placeholder="Ex.: Radar WPS — Setembro"
                      className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => newsAddAnyFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)] disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {newsNewFile ? "Trocar imagem" : "Anexar imagem"}
                    </button>
                    {newsNewFile ? (
                      <span className="truncate text-[11px] text-[color:var(--muted-foreground)]" title={newsNewFile.name}>
                        {newsNewFile.name}
                      </span>
                    ) : null}
                  </div>
                  {itemError ? <p className="text-xs text-red-500">{itemError}</p> : null}
                  <button
                    type="button"
                    disabled={savingItem}
                    onClick={() => void publishNewsFromModal()}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {savingItem ? "Publicando…" : "Publicar"}
                  </button>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Anexadas
                  </p>
                  {newsImageItems.length === 0 ? (
                    <p className="text-center text-xs text-[color:var(--muted-foreground)]">
                      Nenhuma imagem ainda.
                    </p>
                  ) : (
                    <ul className="max-h-72 space-y-2 overflow-y-auto">
                      {newsImageItems.map((it) => (
                        <li
                          key={it.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2.5"
                        >
                          <p className="min-w-0 truncate text-sm font-medium text-[color:var(--foreground)]">
                            {String(it.title || "").trim() || "Sem nome"}
                          </p>
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => setConfirmDeleteItem(it)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Apagar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {manageSlug === SLUG.awards && (
              <div className="mb-4 space-y-4">
                <p className="text-[11px] text-[color:var(--muted-foreground)]">
                  Anexe uma imagem por lugar do pódio. Cada novo anexo entra no histórico — use as setas no card para voltar às imagens anteriores.
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
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3 space-y-2.5"
                      >
                        <p className="text-center text-xs font-bold uppercase tracking-wide text-amber-200">{label}</p>
                        <div className="relative mx-auto h-[118px] w-[118px] max-w-full">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
                          <div className="absolute inset-[2px] overflow-hidden rounded-full bg-[color:var(--surface-2)] ring-1 ring-[color:var(--border)]">
                            {slot.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={publicFileUrl(slot.imageUrl)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-[color:var(--muted-foreground)]">
                                <ImagePlus className="h-5 w-5 opacity-50" />
                                Anexar
                              </div>
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
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] py-1.5 text-[11px] font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)] disabled:opacity-50"
                        >
                          {savingItem ? "Aguarde…" : slot.imageUrl ? "Trocar imagem" : "Anexar imagem"}
                        </button>
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
                            Remover imagem
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
              <div className="mb-4 space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                <p className="text-[11px] text-[color:var(--muted-foreground)]">
                  Anexe uma imagem (PNG, JPG, WebP ou GIF). Novas imagens entram no histórico — use <strong className="text-[color:var(--foreground)]">Voltar</strong> no card para ver as anteriores.
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
                  <div className="grid gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                      Ajuste de exibição
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEmployeeImageFit("contain")}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          employeeImageFit === "contain"
                            ? "bg-violet-600 text-white"
                            : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)]"
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
                            : "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-2)]"
                        }`}
                      >
                        Preencher (pode cortar)
                      </button>
                    </div>

                    {employeeImageFit === "cover" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-[11px] text-[color:var(--muted-foreground)]">
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
                        <label className="text-[11px] text-[color:var(--muted-foreground)]">
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
                    <p className="text-[10px] text-[color:var(--muted-foreground)]">
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
                  <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--input-bg)]">
                    {manageSlug === SLUG.employee ? (
                      <PortalItemImage
                        itemId={currentManageImageItem.id}
                        srcRaw={currentManageImageItem.content}
                        alt={currentManageImageItem.title}
                        className={`w-full bg-[color:var(--surface-2)] ${
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
                    <div className="flex justify-end border-t border-[color:var(--border)] p-3">
                      {manageSlug === SLUG.employee && (
                        <button
                          type="button"
                          disabled={savingItem}
                          onClick={() => void saveEmployeeImageDisplaySettings()}
                          className="mr-auto inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-500/20 disabled:opacity-50"
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
                  <p className="text-center text-xs text-[color:var(--muted-foreground)]">Nenhuma imagem anexada ainda.</p>
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
            className="absolute right-3 top-3 z-[102] rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] p-2 text-[color:var(--foreground)] transition hover:bg-white/20"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation();
              setNewsLightboxItem(null);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[92vh] w-full max-w-[min(96vw,1600px)] overflow-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {parseNewsPdfUrl(newsLightboxItem.metadata) ? (
              newsExpandedPdfLoading ? (
                <p className="py-20 text-center text-[color:var(--muted-foreground)]">Carregando PDF…</p>
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
          <p className="mt-3 max-w-2xl px-2 text-center text-sm font-medium text-[color:var(--foreground)]">
            {newsDisplayCaption(newsLightboxItem)}
          </p>
          <p className="mt-1 text-center text-[10px] text-[color:var(--muted-foreground)]">
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
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[color:var(--foreground)]">Novo evento</h3>
              <button
                type="button"
                onClick={() => {
                  setManageEventsOpen(false);
                  setEvError(null);
                }}
                className="text-xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
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
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              />
              <input
                type="date"
                value={evDate}
                onChange={(e) => setEvDate(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              />
              <textarea
                value={evDesc}
                onChange={(e) => setEvDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                rows={3}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
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
