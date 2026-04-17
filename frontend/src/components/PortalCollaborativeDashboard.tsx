"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gift,
  ImagePlus,
  LayoutGrid,
  Menu,
  PartyPopper,
  Plus,
  Sparkles,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

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
  employee: "colaborador-do-mes",
  awards: "premios",
  manuals: "manuais",
} as const;

const WPS_ONE_ICON_SVG_SRC = "/WPS%20One%20%C3%ADcone.svg";

function assetUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/")) return `${API_BASE_URL}${p}`;
  return `${API_BASE_URL}/${p}`;
}

function parseMetaHref(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const href = (metadata as Record<string, unknown>).href;
  return typeof href === "string" && href.trim() ? href.trim() : undefined;
}

function isImageItem(item: PortalItem): boolean {
  const t = String(item.type || "").toLowerCase();
  if (t === "image") return true;
  const c = item.content.trim();
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?|$)/i.test(c) || c.startsWith("/uploads/");
}

export function PortalCollaborativeDashboard() {
  const { user, can } = useAuth();
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

  const [newsIndex, setNewsIndex] = useState(0);

  const [manageSlug, setManageSlug] = useState<string | null>(null);
  const [manageEventsOpen, setManageEventsOpen] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemHref, setNewItemHref] = useState("");
  const [newItemFile, setNewItemFile] = useState<File | null>(null);
  const [newItemType, setNewItemType] = useState<"image" | "link">("image");
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

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
  const manualItems = itemsBySlug[SLUG.manuals] ?? [];
  const sidebarItems = useMemo(
    () =>
      [
        { label: "Empresa", active: true },
        { label: "Administrativo", active: false },
        { label: "Manuais", active: false },
      ] as const,
    [],
  );

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

      const slugs = [SLUG.news, SLUG.employee, SLUG.awards, SLUG.manuals];
      const next: Record<string, PortalItem[]> = {};
      await Promise.all(
        slugs.map(async (slug) => {
          const sec = list.find((s) => s.slug === slug);
          if (!sec) {
            next[slug] = [];
            return;
          }
          next[slug] = await loadItemsForSlug(slug, sec.id);
        }),
      );
      setItemsBySlug(next);
      setNewsIndex(0);
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
    if (newsItems.length === 0) setNewsIndex(0);
    else setNewsIndex((i) => Math.min(i, newsItems.length - 1));
  }, [newsItems.length]);

  const newsCarousel = newsItems.filter(isImageItem);
  const activeNews = newsCarousel[newsIndex];

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
    const need = Object.values(SLUG);
    return need.filter((slug) => !sections.some((s) => s.slug === slug));
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

  async function handleCreateItem() {
    const sectionId = manageSlug ? sectionIdBySlug[manageSlug] : null;
    if (!sectionId || !manageSlug) return;
    const title = newItemTitle.trim();
    if (!title) {
      setItemError("Informe um título.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      let content = "";
      let type = newItemType;
      let metadata: { href?: string } | null = null;

      if (manageSlug === SLUG.manuals && newItemType === "link") {
        content = newItemHref.trim();
        if (!content) throw new Error("Informe o link (URL) do manual.");
        type = "link";
      } else {
        if (!newItemFile) throw new Error("Selecione uma imagem.");
        content = await uploadPortalImage(newItemFile);
        type = "image";
        const href = newItemHref.trim();
        metadata = href ? { href } : null;
      }

      const res = await apiFetch("/api/portal/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          title,
          content,
          type,
          metadata,
          isActive: true,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errBody?.error || "Erro ao salvar item.");

      setNewItemTitle("");
      setNewItemHref("");
      setNewItemFile(null);
      await refreshAll();
    } catch (e: unknown) {
      setItemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleDeleteItem(item: PortalItem) {
    if (!window.confirm(`Remover "${item.title}" do portal?`)) return;
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
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex w-full flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-right text-xs text-slate-400 sm:w-auto sm:text-left">
              {now.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!user) return;
                if (user.role === "CLIENTE") router.push("/cliente");
                else if (user.role === "SUPER_ADMIN") router.push("/admin");
                else if (user.role === "GESTOR_PROJETOS") router.push("/gestor");
                else router.push("/consultor");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 transition"
            >
              Ir para WPS One
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-8 sm:px-6">
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

        <div className="relative">
          {/* Menu lateral (estilo WPS One) */}
          <aside
            className={`hidden lg:fixed lg:left-0 lg:top-[84px] lg:z-40 lg:flex lg:h-[calc(100vh-84px)] lg:flex-col lg:rounded-r-3xl lg:border lg:border-[color:var(--sidebar-border)] lg:bg-[color:var(--sidebar-bg)] lg:shadow-xl lg:backdrop-blur transition-all duration-300 ease-out ${
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
              {sidebarItems.map((it) => (
                <div
                  key={it.label}
                  title={sidebarCollapsed ? it.label : undefined}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium select-none ${
                    it.active
                      ? "text-[color:var(--primary-foreground)] shadow-sm"
                      : "text-[color:var(--primary-foreground)]/85"
                  } ${sidebarCollapsed ? "justify-center" : ""}`}
                  style={
                    it.active ? ({ background: "var(--sidebar-item-active)" } as React.CSSProperties) : undefined
                  }
                  aria-current={it.active ? "page" : undefined}
                >
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: it.active ? "rgba(92,0,225,0.55)" : "rgba(255,255,255,0.06)",
                      color: it.active ? "#fff" : "rgba(244,242,255,0.58)",
                    }}
                    aria-hidden
                  >
                    ●
                  </span>
                  {!sidebarCollapsed && <span className="truncate">{it.label}</span>}
                </div>
              ))}
            </nav>
          </aside>

          {/* Conteúdo (mantém a tela atual) */}
          <div className="min-w-0 lg:pl-[88px]">
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
                      setNewItemType("image");
                      setItemError(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Gerenciar
                  </button>
                )}
              </div>
              <div className="relative aspect-[21/9] min-h-[200px] w-full bg-slate-900/80 sm:aspect-[21/8]">
                {activeNews ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(activeNews.content)}
                      alt={activeNews.title}
                      className="h-full w-full object-cover object-center"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-4 sm:px-6">
                      <p className="text-sm font-semibold text-white drop-shadow-md sm:text-base">{activeNews.title}</p>
                      {parseMetaHref(activeNews.metadata) && (
                        <a
                          href={parseMetaHref(activeNews.metadata)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-medium text-fuchsia-200 underline-offset-2 hover:underline"
                        >
                          Abrir link
                        </a>
                      )}
                    </div>
                    {newsCarousel.length > 1 && (
                      <>
                        <button
                          type="button"
                          aria-label="Anterior"
                          onClick={() => setNewsIndex((i) => (i - 1 + newsCarousel.length) % newsCarousel.length)}
                          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Próximo"
                          onClick={() => setNewsIndex((i) => (i + 1) % newsCarousel.length)}
                          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                          {newsCarousel.map((_, idx) => (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`Slide ${idx + 1}`}
                              onClick={() => setNewsIndex(idx)}
                              className={`h-1.5 rounded-full transition-all ${idx === newsIndex ? "w-6 bg-fuchsia-400" : "w-1.5 bg-white/40"}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                    <ImagePlus className="h-10 w-10 opacity-50" />
                    <p className="text-sm">Nenhuma imagem de notícia ainda.</p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setManageSlug(SLUG.news);
                          setNewItemType("image");
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

            <div className="grid gap-6 md:grid-cols-2">
              {/* WPSer do mês */}
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur sm:p-5">
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
                        setNewItemType("image");
                        setItemError(null);
                      }}
                      className="text-[11px] font-semibold text-violet-300 hover:underline"
                    >
                      Gerenciar
                    </button>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                  {employeeItems[0] && isImageItem(employeeItems[0]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrl(employeeItems[0].content)}
                      alt={employeeItems[0].title}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-center text-slate-500">
                      <p className="text-xs px-4">Arte do WPSer do mês (imagem).</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Pontos de Inspiração */}
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-300" />
                    <h2 className="text-sm font-semibold text-slate-200">Pontos de Inspiração</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setManageSlug(SLUG.awards);
                        setNewItemType("image");
                        setItemError(null);
                      }}
                      className="text-[11px] font-semibold text-amber-300 hover:underline"
                    >
                      Gerenciar
                    </button>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                  {awardItems[0] && isImageItem(awardItems[0]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrl(awardItems[0].content)}
                      alt={awardItems[0].title}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-center text-slate-500">
                      <p className="text-xs px-4">Arte dos Pontos de Inspiração (imagem única ou banner).</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

          </div>

          {/* Coluna direita: agenda + aniversários */}
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur sm:p-5">
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

            <section className="rounded-3xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-950/40 to-slate-950/60 p-4 shadow-xl backdrop-blur sm:p-5">
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
          </div>
        </div>
          </div>
        </div>
      </main>

      {/* Modal: gerenciar itens de uma seção */}
      {manageSlug && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setManageSlug(null);
              setItemError(null);
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">
                {manageSlug === SLUG.news && "Notícias"}
                {manageSlug === SLUG.employee && "WPSer do mês"}
                {manageSlug === SLUG.awards && "Pontos de Inspiração"}
                {manageSlug === SLUG.manuals && "Manuais"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setManageSlug(null);
                  setItemError(null);
                }}
                className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Fechar
              </button>
            </div>

            {manageSlug !== SLUG.manuals && (
              <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-[11px] text-slate-400">Envie uma imagem (PNG, JPG, WebP). Opcional: link ao clicar na notícia.</p>
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Título / legenda"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <input
                  type="url"
                  value={newItemHref}
                  onChange={(e) => setNewItemHref(e.target.value)}
                  placeholder="Link opcional (https://...)"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setNewItemFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => void handleCreateItem()}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingItem ? "Enviando…" : "Publicar imagem"}
                </button>
              </div>
            )}

            {manageSlug === SLUG.manuals && (
              <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-[11px] text-slate-400">Adicione um link para PDF, SharePoint ou página interna.</p>
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Nome do documento"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <input
                  type="url"
                  value={newItemHref}
                  onChange={(e) => setNewItemHref(e.target.value)}
                  placeholder="URL (https://...)"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                {itemError && <p className="text-xs text-red-400">{itemError}</p>}
                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => void handleCreateItem()}
                  className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingItem ? "Salvando…" : "Adicionar documento"}
                </button>
              </div>
            )}

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Publicados</p>
            <ul className="space-y-2">
              {(itemsBySlug[manageSlug] ?? []).map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                >
                  {isImageItem(it) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(it.content)} alt="" className="h-12 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-slate-800 text-[10px] text-slate-500">
                      link
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{it.title}</p>
                    <p className="truncate text-[10px] text-slate-500">{it.type}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteItem(it)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
