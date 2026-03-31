"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

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
};

export default function PortalPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const [sections, setSections] = useState<PortalSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [items, setItems] = useState<PortalItem[]>([]);
  const [events, setEvents] = useState<PortalEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "CLIENTE") {
      router.replace("/cliente");
      return;
    }
    if (!can("portal.corporativo")) {
      if (user.role === "ADMIN") router.replace("/admin");
      else if (user.role === "GESTOR_PROJETOS") router.replace("/gestor");
      else router.replace("/consultor");
      return;
    }
  }, [user, loading, router, can]);

  useEffect(() => {
    async function load() {
      try {
        const [secRes, metaRes] = await Promise.all([
          apiFetch("/api/portal/sections"),
          apiFetch("/api/portal/events"),
        ]);
        if (secRes.ok) {
          const list: PortalSection[] = await secRes.json();
          setSections(list);
          if (list.length > 0) setSelectedSectionId(list[0].id);
        }
        if (metaRes.ok) {
          const data: { events: PortalEvent[]; birthdays: Birthday[] } = await metaRes.json();
          setEvents(data.events || []);
          setBirthdays(data.birthdays || []);
        }
      } catch {
        // silêncio: tela só não mostra dados
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedSectionId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    async function loadItems() {
      setLoadingItems(true);
      try {
        const res = await apiFetch(`/api/portal/sections/${selectedSectionId}/items`);
        if (!cancelled && res.ok) {
          const list: PortalItem[] = await res.json();
          setItems(list);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [selectedSectionId]);

  const today = new Date();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white/80 backdrop-blur-sm md:flex md:flex-col">
        <div className="px-5 py-4 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Portal corporativo</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {user?.name?.split(" ")[0] || "Bem-vindo(a)"}
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 text-sm">
          {sections.map((s) => {
            const active = s.id === selectedSectionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSectionId(s.id)}
                className={
                  "w-full text-left px-3 py-2 rounded-lg transition-colors " +
                  (active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100")
                }
              >
                {s.title}
              </button>
            );
          })}
          {sections.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              Nenhuma seção configurada ainda para este portal.
            </p>
          )}
        </nav>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Portal corporativo</h1>
            <p className="text-xs text-slate-500">
              Comunicação interna, documentos e avisos organizados por seções.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right text-xs text-slate-500">
              <p>
                {today.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!user) return;
                if (user.role === "CLIENTE") router.push("/cliente");
                else if (user.role === "ADMIN") router.push("/admin");
                else if (user.role === "GESTOR_PROJETOS") router.push("/gestor");
                else router.push("/consultor");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              Ir para o timesheet
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
            {/* Coluna principal: itens da seção */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {sections.find((s) => s.id === selectedSectionId)?.title || "Conteúdos"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Materiais, links e comunicados disponibilizados pela empresa.
                  </p>
                </div>
              </div>
              {loadingItems ? (
                <p className="text-xs text-slate-400">Carregando conteúdos…</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nenhum conteúdo cadastrado nesta seção ainda.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm hover:border-blue-400/70 hover:bg-blue-50/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-700 mb-1">{item.title}</p>
                      <p className="text-xs text-slate-600 line-clamp-4 whitespace-pre-line">
                        {item.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Coluna lateral: eventos & aniversários */}
            <aside className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Agenda corporativa
                </p>
                {events.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Nenhum evento cadastrado para este período.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs text-slate-600">
                    {events.map((ev) => (
                      <li key={ev.id} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-[10px] font-semibold text-blue-700 border border-blue-100">
                          {new Date(ev.date).getDate().toString().padStart(2, "0")}
                        </span>
                        <div>
                          <p className="font-medium text-slate-800">{ev.title}</p>
                          {ev.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              {ev.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Aniversariantes do mês
                </p>
                {birthdays.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Nenhum aniversário registrado para este mês.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    {birthdays.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{b.name}</p>
                          {b.cargo && (
                            <p className="text-[11px] text-slate-500 truncate">{b.cargo}</p>
                          )}
                        </div>
                        {b.birthDate && (
                          <span className="text-[11px] text-slate-500">
                            {new Date(b.birthDate).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

