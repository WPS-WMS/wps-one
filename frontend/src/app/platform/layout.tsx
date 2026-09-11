"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut } from "lucide-react";
import { Link } from "@/components/Link";
import { useAuth } from "@/contexts/AuthContext";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isPlatformAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdmin) {
      router.replace("/admin");
    }
  }, [loading, user, isPlatformAdmin, router]);

  if (loading || !user || !isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] text-sm text-[color:var(--muted-foreground)]">
        Carregando painel da plataforma…
      </div>
    );
  }

  const nav = [
    { href: "/platform", label: "Visão geral", icon: LayoutDashboard, exact: true },
    { href: "/platform/tenants", label: "Clientes", icon: Building2, exact: false },
  ];

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in srgb, var(--wps-purple-600) 22%, transparent), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 0%, color-mix(in srgb, var(--wps-purple-900) 18%, transparent), transparent 50%)",
        }}
        aria-hidden
      />

      <header className="relative z-10 border-b border-[color:var(--border)] bg-[color:var(--surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
              style={{
                background:
                  "linear-gradient(135deg, var(--wps-purple-600) 0%, var(--wps-purple-900) 100%)",
              }}
            >
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--primary)]">
                WPS One
              </p>
              <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">
                Painel da plataforma
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user.role !== "PLATFORM_ADMIN" ? (
              <Link
                href="/admin"
                className="hidden rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--muted-foreground)] transition hover:bg-black/5 sm:inline-flex"
              >
                Voltar ao tenant
              </Link>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--muted-foreground)] transition hover:bg-black/5"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-3 md:px-6">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[color:var(--primary)]/12 text-[color:var(--primary)]"
                    : "text-[color:var(--muted-foreground)] hover:bg-black/5 hover:text-[color:var(--foreground)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
