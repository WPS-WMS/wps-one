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
import { API_BASE_URL, apiFetch } from "@/lib/api";
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
};

type PortalEvent = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
};

type Birthday = {
  id: string;
  name: string;
  birthDate: string | null;
  cargo?: string | null;
  avatarUrl?: string | null;
};

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

const ADMIN_PORTAL_SUBSECTIONS: readonly { slug: string; label: string }[] = [
  { slug: SLUG.politicaDespesa, label: "Política de despesa" },
  { slug: SLUG.politicaLgpd, label: "Política LGPD" },
  { slug: SLUG.documentosRh, label: "Documentos de RH" },
  { slug: SLUG.institucional, label: "Institucional" },
];

type PortalMainView = "empresa" | "admin" | "manuais" | "templates" | "biblioteca";

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

function assetUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("data:")) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/")) return `${API_BASE_URL}${p}`;
  return `${API_BASE_URL}/${p}`;
}

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
  patch: { focalX?: number; focalY?: number; marker?: string; pdfUrl?: string | null },
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

export function PortalCollaborativeDashboard() {
  const { user, can, logout } = useAuth();
  const router = useRouter();
  const canEdit = useMemo(() => can("portal.corporativo.editar"), [can]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [sections, setSections] = useState<PortalSection[]>([]);
  const [itemsBySlug, setItemsBySlug] = useState<Record<string, PortalItem[]>>({});
  const [events, setEvents] = useState<PortalEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());

  const [newsPageIndex, setNewsPageIndex] = useState(0);

  const [manageSlug, setManageSlug] = useState<string | null>(null);
  const [manageEventsOpen, setManageEventsOpen] = useState(false);
  const [portalView, setPortalView] = useState<PortalMainView>("empresa");
  const [adminTab, setAdminTab] = useState<string>(SLUG.politicaDespesa);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<PortalItem | null>(null);
  const portalImageFileInputRef = useRef<HTMLInputElement>(null);
  const newsAddFileInputRef = useRef<HTMLInputElement>(null);
  const newsAddPdfInputRef = useRef<HTMLInputElement>(null);
  const [newsNewTitle, setNewsNewTitle] = useState("");
  const [newsNewThumb, setNewsNewThumb] = useState<File | null>(null);
  const [newsNewPdf, setNewsNewPdf] = useState<File | null>(null);
  const [newsReplaceThumbId, setNewsReplaceThumbId] = useState<string | null>(null);
  const [newsReplacePdfId, setNewsReplacePdfId] = useState<string | null>(null);
  const [newsTitleDrafts, setNewsTitleDrafts] = useState<Record<string, string>>({});
  const inspirationFileInputRef = useRef<HTMLInputElement>(null);
  const [inspirationUploadRank, setInspirationUploadRank] = useState<InspirationRank | null>(null);
  const [inspirationSlots, setInspirationSlots] = useState<Record<InspirationRank, InspirationSlotDraft>>(emptyInspirationSlots);

  const [newsLightboxItem, setNewsLightboxItem] = useState<PortalItem | null>(null);

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

  const newsCarousel = useMemo(() => newsItems.filter(isImageItem), [newsItems]);

  const loadItemsForSlug = useCallback(async (slug: string, sectionId: string) => {
    const res = await apiFetch(`/api/portal/sections/${sectionId}/items`);
    if (!res.ok) return [] as PortalItem[];
    return (await res.json()) as PortalItem[];
  }, []);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [secRes, metaRes] = await Promise.all([
        apiFetch("/api/portal/sections"),
        apiFetch(`/api/portal/events?month=${calMonth}&year=${calYear}`),
      ]);
      if (!secRes.ok) throw new Error("Não foi possível carregar o portal.");
      const list = (await secRes.json()) as PortalSection[];
      setSections(list);

      if (metaRes.ok) {
        const data = (await metaRes.json()) as { events: PortalEvent[]; birthdays: Birthday[] };
        setEvents(data.events || []);
        setBirthdays(data.birthdays || []);
      } else {
        setEvents([]);
        setBirthdays([]);
      }

      const next: Record<string, PortalItem[]> = {};
      await Promise.all(
        PORTAL_ITEM_SLUGS.map(async (slug) => {
          const sec = list.find((s) => s.slug === slug);
          if (!sec) {
            next[slug] = [];
            return;
          }
          next[slug] = await loadItemsForSlug(slug, sec.id);
        }),
      );
      setItemsBySlug(next);
      setNewsPageIndex(0);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [calMonth, calYear, loadItemsForSlug]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const pageSize = 3;
    const pageCount = Math.max(1, Math.ceil(newsCarousel.length / pageSize));
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
    if (manageSlug !== SLUG.awards) return;
    setInspirationSlots(slotsFromAwardItems(awardItems));
  }, [manageSlug, awardItems]);

  const inspirationByRank = useMemo(() => inspirationItemByRank(awardItems), [awardItems]);

  const pageSize = 3;
  const newsCount = newsCarousel.length;
  const newsPageCount = Math.max(1, Math.ceil(newsCount / pageSize));
  const newsPageItems = useMemo(() => {
    if (newsCount <= 2) return newsCarousel;
    const start = newsPageIndex * pageSize;
    return newsCarousel.slice(start, start + pageSize);
  }, [newsCarousel, newsCount, newsPageIndex]);
  const activeNews = newsCarousel[0];

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

      if (imageItems.length > 0) {
        const first = imageItems[0];
        const res = await apiFetch(`/api/portal/items/${first.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            type: "image",
            metadata: null,
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
            metadata: null,
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
      if (newsAddFileInputRef.current) newsAddFileInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function createNewsFromModal() {
    const sectionId = sectionIdBySlug[SLUG.news];
    if (!sectionId) return;
    const title = newsNewTitle.trim();
    if (!title) {
      setItemError("Informe um título.");
      return;
    }
    if (!newsNewThumb) {
      setItemError("Anexe a thumbnail (imagem) da notícia.");
      return;
    }
    if (!newsNewPdf) {
      setItemError("Anexe o PDF da notícia.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      const [thumbUrl, pdfUrl] = await Promise.all([uploadPortalMedia(newsNewThumb), uploadPortalMedia(newsNewPdf)]);
      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title,
          content: thumbUrl,
          type: "image",
          metadata: { focalX: 50, focalY: 50, marker: "", pdfUrl },
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar notícia.");
      await refreshAll();
      setNewsNewTitle("");
      setNewsNewThumb(null);
      setNewsNewPdf(null);
      if (newsAddFileInputRef.current) newsAddFileInputRef.current.value = "";
      if (newsAddPdfInputRef.current) newsAddPdfInputRef.current.value = "";
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
      if (newsAddFileInputRef.current) newsAddFileInputRef.current.value = "";
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
      if (newsAddPdfInputRef.current) newsAddPdfInputRef.current.value = "";
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setSavingItem(false);
      setNewsReplacePdfId(null);
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

  function openNewsPdfInNewTab(item: PortalItem): boolean {
    const raw = parseNewsPdfUrl(item.metadata);
    if (!raw) return false;
    const href = assetUrl(raw);

    // Alguns browsers bloqueiam abrir data: em nova guia. Converter para Blob URL resolve.
    if (href.startsWith("data:application/pdf") || href.startsWith("data:application/octet-stream")) {
      try {
        const comma = href.indexOf(",");
        if (comma === -1) return false;
        const meta = href.slice(0, comma);
        const base64 = href.slice(comma + 1);
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

    clickOpenInNewTab(href);
    return true;
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
      const res = await apiFetch("/api/portal/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: evTitle.trim(),
          date: new Date(evDate + "T12:00:00").toISOString(),
          description: evDesc.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Erro ao criar evento.");
      setEvTitle("");
      setEvDate("");
      setEvDesc("");
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
                      if (!user) return;
                      if (user.role === "CLIENTE") router.push("/cliente");
                      else if (user.role === "SUPER_ADMIN") router.push("/admin");
                      else if (user.role === "GESTOR_PROJETOS") router.push("/gestor");
                      else router.push("/consultor");
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
                  >
                    Ir para WPS One
                  </button>
                </div>
              </div>
            </div>
          </header>
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
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
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
              <div className="relative w-full bg-slate-900/80 min-h-[200px] max-h-[min(420px,64vh)] sm:min-h-[230px] sm:max-h-[min(460px,56vh)]">
                {newsCount > 0 ? (
                  <>
                    {newsCount === 1 && activeNews ? (
                      <div className="w-full">
                        <div className="relative aspect-[21/9] w-full overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={assetUrl(activeNews.content)}
                            alt={newsDisplayCaption(activeNews)}
                            className="h-full w-full object-contain bg-black/20"
                            style={{ objectPosition: newsObjectPosition(activeNews.metadata) }}
                          />
                          {(() => {
                            const hasPdf = !!parseNewsPdfUrl(activeNews.metadata);
                            const label = hasPdf ? "Abrir PDF da notícia em nova guia" : "Abrir imagem da notícia";
                            return (
                              <button
                                type="button"
                                aria-label={label}
                                className={`absolute inset-0 z-[1] h-full w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400/60 ${
                                  hasPdf ? "cursor-pointer" : "cursor-zoom-in"
                                }`}
                                onClick={() => {
                                  if (hasPdf) openNewsPdfInNewTab(activeNews);
                                  else openNewsLightbox(activeNews);
                                }}
                              />
                            );
                          })()}
                          <p className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/90">
                            Clique para abrir
                          </p>
                        </div>
                        {(() => {
                          const cap = newsDisplayCaption(activeNews);
                          return cap ? (
                            <div className="border-t border-white/10 bg-black/20 px-4 py-3 sm:px-6">
                              <p className="text-sm font-semibold leading-snug text-white drop-shadow-md line-clamp-2 sm:text-base">
                                {cap}
                              </p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : newsCount === 2 ? (
                      <div className="grid gap-2 p-2 sm:gap-3 sm:p-3 md:grid-cols-2">
                        {newsPageItems.map((it) => (
                          <div key={it.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <div className="group relative aspect-[21/9] w-full overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={assetUrl(it.content)}
                                alt={newsDisplayCaption(it)}
                                className="h-full w-full object-contain bg-black/20 transition duration-300 group-hover:opacity-95"
                                style={{ objectPosition: newsObjectPosition(it.metadata) }}
                              />
                              {(() => {
                                const hasPdf = !!parseNewsPdfUrl(it.metadata);
                                const label = hasPdf ? "Abrir PDF da notícia em nova guia" : "Abrir imagem da notícia";
                                return (
                                  <button
                                    type="button"
                                    aria-label={label}
                                    className={`absolute inset-0 z-[1] h-full w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400/60 ${
                                      hasPdf ? "cursor-pointer" : "cursor-zoom-in"
                                    }`}
                                    onClick={() => {
                                      if (hasPdf) openNewsPdfInNewTab(it);
                                      else openNewsLightbox(it);
                                    }}
                                  />
                                );
                              })()}
                            </div>
                            {(() => {
                              const cap = newsDisplayCaption(it);
                              return cap ? (
                                <div className="border-t border-white/10 bg-black/20 px-3 py-2.5">
                                  <p className="text-sm font-semibold leading-snug text-white drop-shadow line-clamp-2">{cap}</p>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="relative p-2 sm:p-3">
                        <div className="grid gap-2 sm:gap-3 md:grid-cols-3 md:grid-rows-2">
                          {newsPageItems[0] && (
                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 md:col-span-2 md:row-span-2">
                              <div className="group relative aspect-[21/9] w-full overflow-hidden md:aspect-auto md:min-h-[240px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={assetUrl(newsPageItems[0].content)}
                                  alt={newsDisplayCaption(newsPageItems[0])}
                                  className="h-full w-full object-contain bg-black/20 transition duration-300 group-hover:opacity-95"
                                  style={{ objectPosition: newsObjectPosition(newsPageItems[0].metadata) }}
                                />
                                {(() => {
                                  const hasPdf = !!parseNewsPdfUrl(newsPageItems[0].metadata);
                                  const label = hasPdf ? "Abrir PDF da notícia em nova guia" : "Abrir imagem da notícia";
                                  return (
                                    <button
                                      type="button"
                                      aria-label={label}
                                      className={`absolute inset-0 z-[1] h-full w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400/60 ${
                                        hasPdf ? "cursor-pointer" : "cursor-zoom-in"
                                      }`}
                                      onClick={() => {
                                        if (hasPdf) openNewsPdfInNewTab(newsPageItems[0]);
                                        else openNewsLightbox(newsPageItems[0]);
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                              {(() => {
                                const cap = newsDisplayCaption(newsPageItems[0]);
                                return cap ? (
                                  <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                                    <p className="text-sm font-semibold leading-snug text-white drop-shadow line-clamp-2 sm:text-base">
                                      {cap}
                                    </p>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          )}
                          {[newsPageItems[1], newsPageItems[2]].filter(Boolean).map((it) => (
                            <div key={(it as PortalItem).id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                              <div className="group relative aspect-[21/9] w-full overflow-hidden md:aspect-auto md:min-h-[116px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={assetUrl((it as PortalItem).content)}
                                  alt={newsDisplayCaption(it as PortalItem)}
                                  className="h-full w-full object-contain bg-black/20 transition duration-300 group-hover:opacity-95"
                                  style={{ objectPosition: newsObjectPosition((it as PortalItem).metadata) }}
                                />
                                {(() => {
                                  const pit = it as PortalItem;
                                  const hasPdf = !!parseNewsPdfUrl(pit.metadata);
                                  const label = hasPdf ? "Abrir PDF da notícia em nova guia" : "Abrir imagem da notícia";
                                  return (
                                    <button
                                      type="button"
                                      aria-label={label}
                                      className={`absolute inset-0 z-[1] h-full w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400/60 ${
                                        hasPdf ? "cursor-pointer" : "cursor-zoom-in"
                                      }`}
                                      onClick={() => {
                                        if (hasPdf) openNewsPdfInNewTab(pit);
                                        else openNewsLightbox(pit);
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                              {(() => {
                                const cap = newsDisplayCaption(it as PortalItem);
                                return cap ? (
                                  <div className="border-t border-white/10 bg-black/20 px-3 py-2.5">
                                    <p className="text-sm font-semibold leading-snug text-white drop-shadow line-clamp-2">{cap}</p>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          ))}
                        </div>

                        {newsCount > pageSize && (
                          <>
                            <button
                              type="button"
                              aria-label="Anterior"
                              onClick={() => setNewsPageIndex((i) => (i - 1 + newsPageCount) % newsPageCount)}
                              className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                            >
                              <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Próximo"
                              onClick={() => setNewsPageIndex((i) => (i + 1) % newsPageCount)}
                              className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                            >
                              <ChevronRight className="h-5 w-5" />
                            </button>
                            <div className="pointer-events-auto mt-3 flex justify-center gap-1.5">
                              {Array.from({ length: newsPageCount }, (_, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  aria-label={`Página ${idx + 1}`}
                                  onClick={() => setNewsPageIndex(idx)}
                                  className={`h-1.5 rounded-full transition-all ${
                                    idx === newsPageIndex ? "w-7 bg-fuchsia-400" : "w-1.5 bg-white/40"
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                    <ImagePlus className="h-10 w-10 opacity-50" />
                    <p className="text-sm">Nenhuma imagem de notícia ainda.</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
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
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={assetUrl(photo)} alt="" className="h-full w-full object-cover" />
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
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={calMonth}
                    onChange={(e) => setCalMonth(Number(e.target.value))}
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
                    onChange={(e) => setCalYear(Number(e.target.value))}
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
              {events.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum evento neste mês.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((ev) => (
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
                    const d = b.birthDate ? new Date(b.birthDate) : null;
                    const day = d ? d.getDate() : "—";
                    const monthShort = d
                      ? d.toLocaleDateString("pt-BR", { month: "short" })
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(employeeItems[0].content)}
                    alt={employeeItems[0].title}
                    className="aspect-[4/3] w-full max-w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full max-w-full flex-col items-center justify-center gap-2 text-center text-slate-500">
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setManageSlug(null);
              setItemError(null);
              setConfirmDeleteItem(null);
              setInspirationUploadRank(null);
              if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
              if (newsAddFileInputRef.current) newsAddFileInputRef.current.value = "";
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
                  setManageSlug(null);
                  setItemError(null);
                  setConfirmDeleteItem(null);
                  setInspirationUploadRank(null);
                  if (portalImageFileInputRef.current) portalImageFileInputRef.current.value = "";
                  if (newsAddFileInputRef.current) newsAddFileInputRef.current.value = "";
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
                  Crie notícias com <strong className="text-slate-200">título</strong>, uma{" "}
                  <strong className="text-slate-200">thumbnail (imagem)</strong> e um{" "}
                  <strong className="text-slate-200">PDF</strong>. No portal, ao clicar na thumbnail a notícia abre em uma
                  nova guia (PDF).
                </p>
                <input
                  ref={newsAddFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (newsReplaceThumbId) void replaceNewsThumb(newsReplaceThumbId, f);
                    else setNewsNewThumb(f);
                  }}
                />
                <input
                  ref={newsAddPdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (newsReplacePdfId) {
                      const it = newsCarousel.find((x) => x.id === newsReplacePdfId);
                      if (it) void replaceNewsPdf(it, f);
                      return;
                    }
                    setNewsNewPdf(f);
                  }}
                />
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nova notícia</p>
                  <input
                    type="text"
                    value={newsNewTitle}
                    onChange={(e) => setNewsNewTitle(e.target.value)}
                    placeholder="Título da notícia"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => {
                        setNewsReplaceThumbId(null);
                        newsAddFileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {newsNewThumb ? "Thumbnail anexada" : "Anexar thumbnail"}
                    </button>
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => {
                        setNewsReplacePdfId(null);
                        newsAddPdfInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {newsNewPdf ? "PDF anexado" : "Anexar PDF"}
                    </button>
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => void createNewsFromModal()}
                      className="ml-auto rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {savingItem ? "Salvando…" : "Publicar notícia"}
                    </button>
                  </div>
                  {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                </div>
                <ul className="space-y-4">
                  {newsCarousel.map((it) => {
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

                        <div className="mb-2 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              setNewsReplaceThumbId(it.id);
                              newsAddFileInputRef.current?.click();
                            }}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                          >
                            Trocar imagem (capa)
                          </button>
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => {
                              setNewsReplacePdfId(it.id);
                              newsAddPdfInputRef.current?.click();
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
                {newsCarousel.length === 0 && (
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
                              <img src={assetUrl(slot.imageUrl)} alt="" className="h-full w-full object-cover" />
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(currentManageImageItem.content)}
                      alt={currentManageImageItem.title}
                      className="aspect-video w-full object-cover"
                    />
                    <div className="flex justify-end border-t border-white/10 p-3">
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
            className="max-h-[92vh] w-full max-w-[min(96vw,1440px)] overflow-auto rounded-xl border border-white/10 bg-slate-950/90 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(newsLightboxItem.content)}
              alt={newsDisplayCaption(newsLightboxItem)}
              className="mx-auto block h-auto w-auto max-w-none"
            />
          </div>
          <p className="mt-3 max-w-2xl px-2 text-center text-sm font-medium text-slate-200">
            {newsDisplayCaption(newsLightboxItem)}
          </p>
          <p className="mt-1 text-center text-[10px] text-slate-500">Role a tela se a imagem for maior que a janela.</p>
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
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
