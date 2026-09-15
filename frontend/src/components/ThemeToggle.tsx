"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("wps_theme");
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

type ThemeToggleButtonProps = {
  className?: string;
};

function ThemeToggleButton({ className = "" }: ThemeToggleButtonProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = getPreferredTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const nextTheme = useMemo(() => (theme === "dark" ? "light" : "dark"), [theme]);

  return (
    <button
      type="button"
      onClick={() => {
        const t = nextTheme;
        setTheme(t);
        applyTheme(t);
        if (typeof window !== "undefined") window.localStorage.setItem("wps_theme", t);
      }}
      className={className}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno"}
      title={theme === "dark" ? "Modo claro" : "Modo noturno"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

/** Botão fixo no canto (demais páginas). Oculto em /portal — use ThemeToggleInline no cabeçalho. */
export function ThemeToggle() {
  const pathname = usePathname();
  if (pathname === "/portal") return null;

  return (
    <ThemeToggleButton className="fixed right-2 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm backdrop-blur bg-[color:var(--surface)]/80 text-[color:var(--foreground)] border-[color:var(--border)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]" />
  );
}

/** Mesmo controle de tema, para embutir ao lado de outros botões (ex.: portal). */
export function ThemeToggleInline({ className = "" }: { className?: string }) {
  return (
    <ThemeToggleButton
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm transition hover:bg-[color:var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/40 ${className}`}
    />
  );
}
