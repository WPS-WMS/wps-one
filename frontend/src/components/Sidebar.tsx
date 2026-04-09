"use client";

import { useState, useEffect } from "react";
import { Link } from "@/components/Link";
import { Avatar } from "@/components/Avatar";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, LogOut, ChevronDown, ChevronRight, Settings } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  GESTOR_PROJETOS: "Gestor de Projetos",
  CONSULTOR: "Consultor",
  CLIENTE: "Cliente",
};

export type NavItem = {
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  children?: Array<{ href: string; label: string }>;
};

export function Sidebar({
  items,
  user,
  onLogout,
}: {
  items: NavItem[];
  user: { name: string; role: string; email?: string; avatarUrl?: string };
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  
  // Abre automaticamente submenus cujo filho está ativo
  const initialOpenSubmenus: Record<string, boolean> = {};
  items.forEach((item) => {
    if (item.children) {
      const hasActiveChild = item.children.some(
        (child) => pathname === child.href || pathname.startsWith(child.href + "/")
      );
      if (hasActiveChild) {
        initialOpenSubmenus[item.label] = true;
      }
    }
  });
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>(initialOpenSubmenus);

  // Atualiza submenus abertos quando pathname muda
  useEffect(() => {
    const newOpenSubmenus: Record<string, boolean> = {};
    items.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(
          (child) => pathname === child.href || pathname.startsWith(child.href + "/")
        );
        if (hasActiveChild) {
          newOpenSubmenus[item.label] = true;
        }
      }
    });
    setOpenSubmenus((prev) => ({ ...prev, ...newOpenSubmenus }));
  }, [pathname, items]);

  return (
    <>
      {/* Overlay em mobile quando sidebar aberta */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      {/* Botão flutuante para abrir sidebar (apenas em mobile, quando colapsada) */}
      <button
        onClick={() => setCollapsed(false)}
        className={`fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-lg transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] focus:ring-offset-2 lg:hidden ${
          collapsed ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer: só em mobile quando sidebar aberta (sidebar é fixed e overlaya). Em desktop a sidebar é sticky e ocupa espaço no flex. */}
      <div
        className={`shrink-0 transition-all duration-300 ease-out ${
          collapsed ? "w-0" : "w-56 lg:w-0"
        }`}
        aria-hidden
      />

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 flex h-screen flex-col bg-[color:var(--sidebar-bg)] border-r border-[color:var(--sidebar-border)] transition-all duration-300 ease-out ${
          collapsed ? "-translate-x-full lg:translate-x-0 lg:w-[72px]" : "w-56"
        }`}
      >
        {/* Header com toggle */}
        <div className={`flex h-14 shrink-0 items-center border-b border-[color:var(--sidebar-border)] ${collapsed ? "justify-center" : "justify-between gap-2 px-4"}`}>
          {!collapsed && (
            <h1 className="font-bold text-white tracking-tight truncate">WPS One</h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--primary-foreground)]/80 transition hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] focus:ring-inset ${!collapsed ? "ml-auto" : ""}`}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map((item) => {
            const { href, label, icon: Icon, children } = item;
            const hasChildren = children && children.length > 0;
            const isSubmenuOpen = openSubmenus[label] ?? false;
            const isActive = href
              ? pathname === href || pathname.startsWith(href + "/")
              : children?.some((child) => pathname === child.href || pathname.startsWith(child.href + "/"));

            if (hasChildren) {
              return (
                <div key={label}>
                  <button
                    onClick={() => {
                      if (!collapsed) {
                        setOpenSubmenus((prev) => ({ ...prev, [label]: !prev[label] }));
                      }
                    }}
                    title={collapsed ? label : undefined}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-[color:var(--sidebar-item-active)] text-[color:var(--primary-foreground)] shadow-sm"
                        : "text-[color:var(--primary-foreground)]/85 hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)]"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{label}</span>
                        {isSubmenuOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                      </>
                    )}
                  </button>
                  {!collapsed && isSubmenuOpen && children && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-700/30 pl-2">
                      {children.map((child) => {
                        const isChildActive =
                          pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block rounded-lg px-3 py-2 text-sm transition ${
                              isChildActive
                                ? "bg-[color:var(--sidebar-item-active)] text-[color:var(--primary-foreground)] shadow-sm"
                                : "text-[color:var(--primary-foreground)]/70 hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)]"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={href}
                href={href!}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-[color:var(--sidebar-item-active)] text-[color:var(--primary-foreground)] shadow-sm"
                    : "text-[color:var(--primary-foreground)]/85 hover:bg-[color:var(--sidebar-item-hover)] hover:text-[color:var(--primary-foreground)]"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User card + Logout */}
        <div className="shrink-0 border-t border-[color:var(--sidebar-border)] p-3">
          {!collapsed ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-[color:var(--sidebar-item-hover)] px-3 py-3 text-[color:var(--primary-foreground)] shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={user.name}
                    email={user.email}
                    avatarUrl={user.avatarUrl}
                    size={36}
                    fallbackClassName="text-sm"
                    className="border border-[color:var(--sidebar-border)]"
                    imgClassName="border border-[color:var(--sidebar-border)]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={user.name}>
                      {user.name}
                    </p>
                    {user.email && (
                      <p className="truncate text-[11px] text-[color:var(--primary-foreground)]/75" title={user.email}>
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-[color:var(--sidebar-border)] pt-2 text-sm">
                  <Link
                    href="/perfil"
                    className="flex items-center gap-2 text-[color:var(--primary-foreground)]/90 hover:text-[color:var(--primary-foreground)]"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Configurações</span>
                  </Link>
                  <button
                    type="button"
                    onClick={onLogout ?? logout}
                    className="flex items-center gap-2 text-red-200 hover:text-red-100"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={onLogout ?? logout}
              className="mt-2 flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-inset"
            >
              <LogOut className="h-5 w-5 shrink-0" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
