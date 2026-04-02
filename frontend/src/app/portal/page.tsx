"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
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

export default function PortalPage() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const [sections, setSections] = useState<PortalSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [items, setItems] = useState<PortalItem[]>([]);
  const [editingItem, setEditingItem] = useState<PortalItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
      if (user.role === "SUPER_ADMIN") router.replace("/admin");
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

  const canEdit = useMemo(() => can("portal.corporativo.editar"), [can]);

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

  function openCreate() {
    if (!selectedSectionId) return;
    setEditingItem(null);
    setIsCreating(true);
    setEditTitle("");
    setEditContent("");
    setSaveError(null);
  }

  function openEdit(item: PortalItem) {
    setEditingItem(item);
    setIsCreating(false);
    setEditTitle(item.title);
    setEditContent(item.content);
    setSaveError(null);
  }

  function closeEditor() {
    setEditingItem(null);
    setIsCreating(false);
    setEditTitle("");
    setEditContent("");
    setSaveError(null);
  }

  async function reloadItems(sectionId: string) {
    setLoadingItems(true);
    try {
      const res = await apiFetch(`/api/portal/sections/${sectionId}/items`);
      if (res.ok) {
        const list: PortalItem[] = await res.json();
        setItems(list);
      }
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  async function handleSave() {
    if (!selectedSectionId) return;
    if (!editTitle.trim()) {
      setSaveError("Informe um título para o conteúdo.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (isCreating || !editingItem) {
        const res = await apiFetch("/api/portal/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId: selectedSectionId,
            title: editTitle,
            content: editContent,
            type: "text",
            isActive: true,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Erro ao criar conteúdo.");
        }
      } else {
        const res = await apiFetch(`/api/portal/items/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle,
            content: editContent,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Erro ao atualizar conteúdo.");
        }
      }
      await reloadItems(selectedSectionId);
      closeEditor();
    } catch (e: unknown) {
      const err = e as Error;
      setSaveError(err.message || "Erro ao salvar conteúdo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: PortalItem) {
    if (!selectedSectionId) return;
    if (!window.confirm("Tem certeza que deseja remover este conteúdo do portal?")) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/portal/items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erro ao remover conteúdo.");
      }
      await reloadItems(selectedSectionId);
      if (editingItem?.id === item.id) {
        closeEditor();
      }
    } catch (e: unknown) {
      const err = e as Error;
      setSaveError(err.message || "Erro ao remover conteúdo.");
    } finally {
      setSaving(false);
    }
  }

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
                else if (user.role === "SUPER_ADMIN") router.push("/admin");
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
                {canEdit && selectedSectionId && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    Novo conteúdo
                  </button>
                )}
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
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm hover:border-blue-400/70 hover:bg-blue-50/40 transition-colors flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700 mb-1">{item.title}</p>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-100"
                            >
                              Remover
                            </button>
                          </div>
                        )}
                      </div>
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
                        <div className="min-w-0 flex items-center gap-2">
                          <Avatar
                            name={b.name}
                            avatarUrl={b.avatarUrl}
                            size={32}
                            className="border border-slate-200 bg-slate-100 text-slate-700"
                            imgClassName="border border-slate-200"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{b.name}</p>
                            {b.cargo && (
                              <p className="text-[11px] text-slate-500 truncate">{b.cargo}</p>
                            )}
                          </div>
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
      {canEdit && selectedSectionId && (isCreating || editingItem) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-4xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {isCreating ? "Novo conteúdo do portal" : "Editar conteúdo do portal"}
                </p>
                <p className="text-[11px] text-slate-500">
                  As alterações ficam visíveis imediatamente para todos os usuários com acesso ao portal.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="text-[11px] text-slate-500 hover:text-slate-800"
              >
                Fechar
              </button>
            </div>
            {saveError && (
              <p className="text-[11px] text-red-600">
                {saveError}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] items-start">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Título
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Ex.: Política de férias, Manual do colaborador..."
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Conteúdo
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Texto livre para descrever políticas, comunicados ou orientações."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar conteúdo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

