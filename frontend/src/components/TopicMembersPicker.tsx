"use client";

import { useState } from "react";
import { X, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";

export type TopicMemberUser = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

type TopicMembersPickerProps = {
  users: TopicMemberUser[];
  value: string[];
  onChange: (nextIds: string[]) => void;
  /** Quando um id não está em `users` (ex.: edição com responsável vindo só do ticket) */
  resolveMember?: (id: string) => TopicMemberUser | null;
  hasError?: boolean;
  hint?: string;
};

export function TopicMembersPicker({
  users,
  value,
  onChange,
  resolveMember,
  hasError,
  hint,
}: TopicMembersPickerProps) {
  const selected = value.map((id) => {
    const fromList = users.find((u) => u.id === id);
    if (fromList) return fromList;
    const resolved = resolveMember?.(id);
    if (resolved) return resolved;
    return { id, name: "Usuário" };
  });

  const availableToAdd = users.filter((u) => !value.includes(u.id));

  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  function add(userId: string) {
    if (!value.includes(userId)) onChange([...value, userId]);
  }

  return (
    <div
      className="space-y-3 rounded-xl border px-4 py-4 transition-colors"
      style={{
        borderColor: hasError ? "rgba(239,68,68,0.45)" : "var(--border)",
        background: hasError ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.03)",
      }}
    >
      <label className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--muted-foreground)]">
        <Users className="h-4 w-4 shrink-0" style={{ color: "var(--muted-foreground)" }} />
        Membros
      </label>
      <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
        {selected.map((u) => (
          <div key={u.id} className="relative -ml-1 first:ml-0 group">
            <div className="flex items-center">
              <Avatar
                name={u.name}
                email={u.email}
                avatarUrl={u.avatarUrl ?? null}
                avatarVersion={u.updatedAt}
                size={32}
                className="ring-2 ring-[color:var(--surface)] shadow-sm"
                imgClassName="ring-2 ring-[color:var(--surface)] shadow-sm"
                fallbackClassName="text-xs"
              />
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  borderColor: "var(--border)",
                  background: "rgba(0,0,0,0.35)",
                  color: "#ffffff",
                }}
                aria-label={`Remover ${u.name}`}
                title="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
              <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-slate-800">
                {u.name}
              </div>
            </div>
          </div>
        ))}
        <TopicMembersPickerDropdown users={availableToAdd} onPick={add} />
      </div>
      {hint ? (
        <p className="text-[11px] leading-relaxed text-[color:var(--muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  );
}

function TopicMembersPickerDropdown({
  users,
  onPick,
}: {
  users: TopicMemberUser[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition hover:opacity-95"
        style={{
          borderColor: "rgba(92,0,225,0.35)",
          color: "var(--foreground)",
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <Users className="h-3.5 w-3.5" />
        Adicionar
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-30 w-72 rounded-xl border shadow-xl py-2 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 bg-[color:var(--surface)]"
          style={{ borderColor: "var(--border)" }}
        >
          {users.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[color:var(--muted-foreground)] text-center">
              Todos os usuários já foram adicionados
            </p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onPick(u.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                style={{ color: "var(--foreground)" }}
              >
                <Avatar
                  name={u.name}
                  email={u.email}
                  avatarUrl={u.avatarUrl ?? null}
                  avatarVersion={u.updatedAt}
                  size={32}
                  className="shadow-sm"
                  imgClassName="shadow-sm"
                  fallbackClassName="text-xs"
                />
                <span className="flex-1">{u.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
