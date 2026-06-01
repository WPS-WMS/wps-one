"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar } from "@/components/Avatar";

export type UserPickerOption = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

type UserPickerDropdownProps = {
  users: UserPickerOption[];
  onSelect: (userId: string) => void;
  emptyMessage?: string;
  searchPlaceholder?: string;
  className?: string;
  avatarSize?: number;
  /** Quando false, limpa o campo de busca (ex.: ao fechar o menu). */
  open?: boolean;
};

export function UserPickerDropdown({
  users,
  onSelect,
  emptyMessage = "Nenhum usuário encontrado",
  searchPlaceholder = "Buscar por nome…",
  className = "w-72",
  avatarSize = 32,
  open = true,
}: UserPickerDropdownProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false),
    );
  }, [users, query]);

  return (
    <div
      className={`flex flex-col max-h-64 rounded-xl border shadow-xl bg-[color:var(--surface)] animate-in fade-in slide-in-from-top-2 duration-200 ${className}`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="shrink-0 border-b border-[color:var(--border)] p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted-foreground)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] py-2 pl-8 pr-3 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-3 text-center text-xs text-[color:var(--muted-foreground)]">{emptyMessage}</p>
        ) : (
          filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect(u.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[color:var(--background)]/60"
              style={{ color: "var(--foreground)" }}
            >
              <Avatar
                name={u.name}
                email={u.email}
                avatarUrl={u.avatarUrl ?? null}
                avatarVersion={u.updatedAt}
                size={avatarSize}
                className="shadow-sm"
                imgClassName="shadow-sm"
                fallbackClassName={avatarSize <= 24 ? "text-[10px]" : "text-xs"}
              />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
