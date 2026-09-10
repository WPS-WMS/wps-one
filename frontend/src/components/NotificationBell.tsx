"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string };
  ticket: { id: string; code: string; projectId: string } | null;
};

function basePathForRole(role: string): string {
  if (role === "CLIENTE") return "/cliente";
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "GESTOR_PROJETOS") return "/gestor";
  if (role === "CONSULTOR" || role === "CONSULTOR_ONDEMAND" || role === "ADMIN_PORTAL") return "/consultor";
  return "/admin";
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("pt-BR");
}

export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const count = Number(data?.count ?? 0);
      setUnreadCount(Number.isFinite(count) ? count : 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/notifications?limit=30");
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) setItems(data as AppNotification[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshUnread();
    const id = window.setInterval(() => {
      void refreshUnread();
    }, 45000);
    return () => window.clearInterval(id);
  }, [user, refreshUnread]);

  useEffect(() => {
    if (!open) return;
    void loadList();
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadList]);

  async function markRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/api/notifications/mark-all-read", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }

  async function openNotification(n: AppNotification) {
    if (!n.readAt) void markRead(n.id);
    setOpen(false);
    const ticketId = n.ticketId ?? n.ticket?.id;
    if (!ticketId || !user) return;
    const base = basePathForRole(user.role);
    router.push(
      `${base}/projetos/lista-tarefas?ticketId=${encodeURIComponent(ticketId)}&focusComments=1`,
    );
  }

  if (!user) return null;

  return (
    <div ref={rootRef} className={`relative ${collapsed ? "" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--primary-foreground)]/85 transition hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] focus:ring-inset"
        aria-label="Notificações"
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={`absolute z-[10001] mt-2 w-80 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl ${
            collapsed ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-2">
            <span className="text-sm font-semibold text-[color:var(--foreground)]">Notificações</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-[color:var(--primary)] hover:underline"
              >
                Marcar todas
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[color:var(--muted-foreground)]">
                Carregando…
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[color:var(--muted-foreground)]">
                Nenhuma notificação
              </p>
            ) : (
              items.map((n) => {
                const unread = !n.readAt;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void openNotification(n)}
                    className={`flex w-full flex-col gap-0.5 border-b border-[color:var(--border)]/70 px-3 py-2.5 text-left transition hover:bg-black/5 ${
                      unread ? "bg-[color:var(--primary)]/5" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-[color:var(--foreground)]">{n.title}</span>
                    {n.body ? (
                      <span className="text-xs text-[color:var(--muted-foreground)]">{n.body}</span>
                    ) : null}
                    <span className="text-[10px] text-[color:var(--muted-foreground)]">
                      {formatRelative(n.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
