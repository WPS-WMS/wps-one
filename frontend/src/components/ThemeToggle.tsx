"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("wps_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
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
      className="fixed right-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm backdrop-blur bg-[color:var(--surface)] text-[color:var(--foreground)] border-[color:var(--border)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno"}
      title={theme === "dark" ? "Modo claro" : "Modo noturno"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

