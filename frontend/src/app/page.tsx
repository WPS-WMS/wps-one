"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, UserRound } from "lucide-react";

const PURPLE = "#5c00e1";

type LandingSection = "home" | "sobre" | "contato";

function readSectionFromLocation(): LandingSection {
  if (typeof window === "undefined") return "home";
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  if (raw === "sobre") return "sobre";
  if (raw === "contato") return "contato";
  return "home";
}

function LandingAppPreview({ isDark }: { isDark: boolean }) {
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.12)";
  const cardBg = isDark ? "rgba(18,12,28,0.85)" : "#ffffff";
  const muted = isDark ? "rgba(244,242,255,0.65)" : "rgba(17,24,39,0.55)";
  const fg = isDark ? "#f4f2ff" : "#111827";

  return (
    <div
      className="overflow-hidden rounded-2xl shadow-2xl"
      style={{
        border: `1px solid ${border}`,
        background: isDark ? "rgba(12,8,18,0.9)" : "#f8fafc",
        boxShadow: isDark ? "0 40px 100px rgba(0,0,0,0.45)" : "0 32px 80px rgba(17,24,39,0.12)",
      }}
    >
      <div className="flex min-h-[280px] md:min-h-[320px]">
        <aside
          className="hidden w-[108px] shrink-0 flex-col gap-2 p-3 sm:flex"
          style={{
            background: "#291349",
            borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          <div className="rounded-lg px-2 py-2 text-[10px]" style={{ background: PURPLE, color: "#fff" }}>
            <p className="opacity-80">Início</p>
            <p className="text-[11px] font-semibold">Resumo</p>
          </div>
          <div className="rounded-lg px-2 py-2 text-[10px]" style={{ color: "rgba(249,249,249,0.75)" }}>
            <p className="opacity-70">Projetos</p>
            <p className="text-[11px] font-medium text-white/90">Kanban</p>
          </div>
          <div className="rounded-lg px-2 py-2 text-[10px]" style={{ color: "rgba(249,249,249,0.75)" }}>
            <p className="opacity-70">Chamados</p>
            <p className="text-[11px] font-medium text-white/90">Backlog</p>
          </div>
          <div className="rounded-lg px-2 py-2 text-[10px]" style={{ color: "rgba(249,249,249,0.75)" }}>
            <p className="opacity-70">Relatórios</p>
            <p className="text-[11px] font-medium text-white/90">Horas</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: fg }}>
                Seu resumo
              </p>
              <p className="text-[11px] md:text-xs" style={{ color: muted }}>
                Visão geral de projetos, tarefas e horas.
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
              style={{ background: PURPLE }}
            >
              Semana atual • 03
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Horas apontadas", value: "32,5 h", hint: "Últimos 7 dias" },
              { label: "Tarefas", value: "18", hint: "Backlog e execução" },
              { label: "SLA clientes", value: "90%", hint: "No prazo", accent: true },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl p-2.5"
                style={{
                  background: cardBg,
                  border: `1px solid ${border}`,
                }}
              >
                <p className="text-[10px]" style={{ color: muted }}>
                  {c.label}
                </p>
                <p
                  className="mt-1 text-lg font-semibold tabular-nums"
                  style={{ color: c.accent ? "#059669" : fg }}
                >
                  {c.value}
                </p>
                <p className="mt-0.5 text-[9px] leading-tight" style={{ color: muted }}>
                  {c.hint}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3" style={{ background: cardBg, border: `1px solid ${border}` }}>
            <p className="text-xs font-medium" style={{ color: fg }}>
              Chamados do dia
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
              <div className="rounded-lg px-2 py-1.5" style={{ border: `1px solid ${border}` }}>
                <p style={{ color: muted }}>Backlog</p>
                <p className="font-semibold tabular-nums" style={{ color: fg }}>
                  6
                </p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border border-amber-500/30 bg-amber-500/12">
                <p style={{ color: isDark ? "#fcd34d" : "#b45309" }}>Em execução</p>
                <p className="font-semibold tabular-nums" style={{ color: isDark ? "#fde68a" : "#92400e" }}>
                  4
                </p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border border-emerald-500/30 bg-emerald-500/12">
                <p style={{ color: isDark ? "#6ee7b7" : "#047857" }}>Finalizados</p>
                <p className="font-semibold tabular-nums" style={{ color: isDark ? "#a7f3d0" : "#065f46" }}>
                  12
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavLink({
  label,
  active,
  activeColor,
  inactiveColor,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-1 py-0.5 transition-opacity hover:opacity-90"
      style={{
        fontWeight: active ? 700 : 500,
        color: active ? activeColor : inactiveColor,
        opacity: active ? 1 : 0.88,
      }}
    >
      {label}
    </button>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [section, setSection] = useState<LandingSection>("home");

  useEffect(() => {
    const el = document.documentElement;
    const getTheme = () =>
      (el.getAttribute("data-theme") === "dark" ? "dark" : "light") as "dark" | "light";
    setTheme(getTheme());
    const obs = new MutationObserver(() => setTheme(getTheme()));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const isDark = theme === "dark";
  const surface = useMemo(
    () => (isDark ? "rgba(12, 8, 18, 0.55)" : "rgba(255, 255, 255, 0.72)"),
    [isDark],
  );
  const navText = useMemo(() => (isDark ? "rgba(244,242,255,0.78)" : "rgba(17,24,39,0.70)"), [isDark]);
  const navActive = useMemo(() => (isDark ? "#ffffff" : "#0b0b12"), [isDark]);
  const bg = useMemo(() => (isDark ? "#000000" : "#f7f7fb"), [isDark]);

  const navigateSection = useCallback((next: LandingSection) => {
    setSection(next);
    const base = `${window.location.pathname}${window.location.search}`;
    const url = next === "home" ? base : `${base}#${next}`;
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const sync = () => setSection(readSectionFromLocation());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const allowed = user.allowedFeatures;
    const hasPortal = Array.isArray(allowed) && allowed.includes("portal.corporativo");
    if (user.role === "CLIENTE") router.replace("/cliente");
    else if (hasPortal) router.replace("/portal");
    else if (user.role === "SUPER_ADMIN") router.replace("/admin");
    else if (user.role === "GESTOR_PROJETOS") router.replace("/gestor");
    else router.replace("/consultor");
  }, [user, loading, router]);

  const mutedBody = isDark ? "rgba(244,242,255,0.78)" : "rgba(17,24,39,0.72)";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bg, color: isDark ? "#ffffff" : "#0b0b12" }}>
      <header className="w-full shrink-0">
        <div className="mx-auto max-w-6xl px-6 pt-7">
          <div className="relative flex min-h-[40px] items-center justify-end">
            <nav
              className="absolute left-1/2 top-1/2 hidden w-[90%] max-w-xl -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-16 text-sm font-medium md:flex"
              style={{ color: navText }}
            >
              <NavLink
                label="Home"
                active={section === "home"}
                activeColor={navActive}
                inactiveColor={navText}
                onClick={() => navigateSection("home")}
              />
              <NavLink
                label="Sobre"
                active={section === "sobre"}
                activeColor={navActive}
                inactiveColor={navText}
                onClick={() => navigateSection("sobre")}
              />
              <NavLink
                label="Contato"
                active={section === "contato"}
                activeColor={navActive}
                inactiveColor={navText}
                onClick={() => navigateSection("contato")}
              />
            </nav>

            <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
              <nav className="flex items-center gap-5 text-sm font-medium md:hidden" style={{ color: navText }}>
                <NavLink
                  label="Home"
                  active={section === "home"}
                  activeColor={navActive}
                  inactiveColor={navText}
                  onClick={() => navigateSection("home")}
                />
                <NavLink
                  label="Sobre"
                  active={section === "sobre"}
                  activeColor={navActive}
                  inactiveColor={navText}
                  onClick={() => navigateSection("sobre")}
                />
                <NavLink
                  label="Contato"
                  active={section === "contato"}
                  activeColor={navActive}
                  inactiveColor={navText}
                  onClick={() => navigateSection("contato")}
                />
              </nav>
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
                  style={{ background: PURPLE }}
                >
                  Entrar
                </Link>
                <Link
                  href="/login"
                  aria-label="Entrar"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    background: surface,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.14)"}`,
                  }}
                >
                  <UserRound
                    className="h-5 w-5"
                    style={{ color: isDark ? "rgba(244,242,255,0.70)" : PURPLE }}
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {section === "home" && (
          <div className="mx-auto w-full max-w-6xl flex-1 px-6 pt-10 pb-14 md:pt-14">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-10">
              <div className="relative order-2 flex justify-center lg:order-1 lg:justify-start">
                <div
                  className="pointer-events-none absolute inset-0 -z-10"
                  style={{
                    background: isDark
                      ? "radial-gradient(720px 400px at 40% 45%, rgba(92,0,225,0.22), transparent 65%)"
                      : "radial-gradient(720px 400px at 40% 45%, rgba(92,0,225,0.12), transparent 68%)",
                  }}
                  aria-hidden
                />
                <img
                  src="/WPS One seta.png"
                  alt=""
                  className="w-full max-w-[min(100%,520px)] select-none lg:max-w-none"
                  style={{
                    filter: isDark
                      ? "drop-shadow(0 24px 70px rgba(92,0,225,0.35))"
                      : "drop-shadow(0 24px 60px rgba(17,24,39,0.15))",
                  }}
                  draggable={false}
                />
              </div>

              <div className="order-1 space-y-8 text-center sm:text-left lg:order-2">
                <p
                  className="text-lg font-medium md:text-xl"
                  style={{ color: isDark ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.85)" }}
                >
                  Bem-vindo
                </p>

                <div className="flex flex-wrap items-end justify-center gap-3 sm:justify-start md:gap-4">
                  <span
                    className="font-quantify text-5xl leading-none tracking-tight md:text-7xl"
                    style={{ color: isDark ? "#ffffff" : "#0b0b12" }}
                  >
                    WPS
                  </span>
                  <img
                    src="/WPS One.png"
                    alt="One"
                    className="h-12 w-auto select-none md:h-[4.25rem]"
                    draggable={false}
                  />
                </div>

                <p
                  className="mx-auto max-w-lg text-base leading-relaxed sm:mx-0 md:text-lg"
                  style={{ color: isDark ? "rgba(255,255,255,0.88)" : "rgba(17,24,39,0.78)" }}
                >
                  O sistema que transforma operação de serviços em margem e previsibilidade.
                </p>

                <div className="flex justify-center sm:justify-start">
                  <button
                    type="button"
                    onClick={() => navigateSection("sobre")}
                    className="inline-flex items-center justify-center rounded-full px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
                    style={{ background: PURPLE }}
                  >
                    Próximo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {section === "sobre" && (
          <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14" aria-labelledby="sobre-heading">
            <div
              className="rounded-3xl px-6 py-10 md:px-10 md:py-12"
              style={{
                background: surface,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
              }}
            >
              <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: PURPLE }}>
                    Sobre o WPS One
                  </p>
                  <h2
                    id="sobre-heading"
                    className="mt-3 text-2xl font-bold leading-tight md:text-3xl"
                    style={{ color: isDark ? "#fff" : "#0b0b12" }}
                  >
                    Menos planilha, mais clareza. Um lugar para o time inteiro respirar no ritmo do cliente.
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed md:text-base" style={{ color: mutedBody }}>
                    Imagine abrir um único painel e ver projetos, chamados, horas e SLA conversando entre si — sem
                    versões duplicadas, sem “cadê o status?”. O WPS One foi pensado para consultorias e operações de
                    serviço: você fecha o dia sabendo o que foi entregue, o que está travado e onde está o risco de
                    estourar contrato ou prazo.
                  </p>
                  <ul className="mt-6 space-y-3 text-sm md:text-[15px]" style={{ color: mutedBody }}>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PURPLE }} />
                      <span>
                        <strong className="font-semibold text-[color:inherit]">Projetos com dono:</strong> escopo, horas
                        contratadas e banco de horas no mesmo lugar.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PURPLE }} />
                      <span>
                        <strong className="font-semibold text-[color:inherit]">Chamados com histórico:</strong> do backlog
                        ao encerramento, com comentários e anexos.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PURPLE }} />
                      <span>
                        <strong className="font-semibold text-[color:inherit]">Relatórios que geram ação:</strong> horas,
                        utilização e visão para gestão e faturamento.
                      </span>
                    </li>
                  </ul>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity"
                      style={{ background: PURPLE }}
                    >
                      Quero entrar no sistema
                    </Link>
                    <button
                      type="button"
                      onClick={() => navigateSection("contato")}
                      className="inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                      style={{
                        borderColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(17,24,39,0.18)",
                        color: isDark ? "#fff" : "#0b0b12",
                        background: "transparent",
                      }}
                    >
                      Falar com a equipe
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <p
                    className="mb-3 text-center text-[11px] font-medium uppercase tracking-wide lg:text-left"
                    style={{ color: isDark ? "rgba(244,242,255,0.45)" : "rgba(17,24,39,0.45)" }}
                  >
                    Prévia da interface — o mesmo fluxo que seu time usa no dia a dia
                  </p>
                  <LandingAppPreview isDark={isDark} />
                </div>
              </div>
            </div>
          </div>
        )}

        {section === "contato" && (
          <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:items-stretch lg:gap-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: PURPLE }}>
                  Contato
                </p>
                <h2 className="mt-3 text-2xl font-bold leading-tight md:text-3xl" style={{ color: isDark ? "#fff" : "#0b0b12" }}>
                  Vamos colocar seu time no mesmo ritmo.
                </h2>
                <p className="mt-4 text-sm leading-relaxed md:text-base" style={{ color: mutedBody }}>
                  Se você já tem acesso, entre direto. Se ainda não, fale com quem administra o WPS One na sua empresa —
                  nós deixamos o onboarding enxuto para você ver valor rápido, sem maratona de treinamento.
                </p>
                <div className="mt-8 space-y-4">
                  <div
                    className="flex gap-4 rounded-2xl p-5"
                    style={{
                      background: surface,
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                    }}
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${PURPLE}22`, color: PURPLE }}
                    >
                      <Mail className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: isDark ? "#fff" : "#0b0b12" }}>
                        Acesso ao sistema
                      </p>
                      <p className="mt-1 text-sm" style={{ color: mutedBody }}>
                        Use o botão abaixo com seu e-mail e senha corporativos. Problemas de login? Peça um reset ao
                        administrador do portal.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity"
                    style={{ background: PURPLE }}
                  >
                    Entrar no WPS One
                  </Link>
                  <button
                    type="button"
                    onClick={() => navigateSection("home")}
                    className="inline-flex items-center justify-center rounded-full border px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      borderColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(17,24,39,0.18)",
                      color: isDark ? "#fff" : "#0b0b12",
                    }}
                  >
                    Voltar ao início
                  </button>
                </div>
              </div>
              <div
                className="flex flex-col justify-between rounded-3xl p-8 md:p-10"
                style={{
                  background: surface,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: isDark ? "#fff" : "#0b0b12" }}>
                    Por que falar com a equipe?
                  </p>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: mutedBody }}>
                    Cada cliente tem perfis, contratos e regras de acesso próprias. Um contato humano garante que você
                    entre no ambiente certo, com permissões alinhadas ao que sua operação realmente precisa.
                  </p>
                </div>
                <p className="mt-8 text-xs leading-relaxed" style={{ color: isDark ? "rgba(244,242,255,0.45)" : "rgba(17,24,39,0.45)" }}>
                  Dica: se você é gestor, combine com o time WPS One os primeiros projetos e métricas que quer ver no
                  painel — assim o sistema já nasce útil no dia 1.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.12)" }}>
        <div
          className="mx-auto max-w-6xl px-6 py-6 text-xs"
          style={{ color: isDark ? "rgba(244,242,255,0.55)" : "rgba(17,24,39,0.55)" }}
        >
          © {new Date().getFullYear()} WPS One. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
