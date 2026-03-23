"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = { href: string; label: string };

export function Sidebar({
  items,
  user,
}: {
  items: NavItem[];
  user: { name: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-56 bg-slate-800 border-r border-slate-700 min-h-screen flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="font-bold text-amber-400">WPS One</h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {items.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-4 py-2 rounded-lg text-sm transition ${
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-amber-500/20 text-amber-400"
                : "text-slate-400 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-sm text-slate-400 truncate">{user.name}</p>
        <p className="text-xs text-slate-500">{user.role}</p>
        <button
          onClick={handleLogout}
          className="mt-2 text-sm text-red-400 hover:text-red-300"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
