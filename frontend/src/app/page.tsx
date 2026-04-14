"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";
import { Mail, MapPin, UserRound } from "lucide-react";

const PURPLE = "#5c00e1";

/** Logo vetorial "One" (arquivo em `public/`) */
const ONE_LOGO_SVG_SRC = "/WPS%20One.svg";

const CONTACT_ADDRESS = "Av. Senador Tarso Dutra, 565 - Sala 1612. Porto Alegre/RS";
const CONTACT_PHONE_DISPLAY = "55 51 99210 8997";
const CONTACT_WHATSAPP_E164 = "5551992108997";
const CONTACT_EMAIL = "contato@wpsconsult.com.br";

const SOCIAL_LINKEDIN = "https://www.linkedin.com/company/wps-consult";
const SOCIAL_INSTAGRAM = "https://www.instagram.com/wpsconsult/";
const SOCIAL_FACEBOOK = "https://www.facebook.com/wpsconsult/";

function IconLinkedIn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  );
}

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
      />
    </svg>
  );
}

function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

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
      className="rounded-lg px-1 py-0.5 text-base transition-opacity hover:opacity-90 md:text-[1.0625rem]"
      style={{
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
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
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  const submitContactForm = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setContactFeedback(null);
      setContactSubmitting(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: contactFirstName.trim(),
            lastName: contactLastName.trim(),
            email: contactEmail.trim(),
            message: contactMessage.trim(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setContactFeedback({ type: "err", text: data.error ?? "Não foi possível enviar. Tente novamente." });
          return;
        }
        setContactFeedback({ type: "ok", text: "Mensagem enviada. Em breve retornamos o contato." });
        setContactFirstName("");
        setContactLastName("");
        setContactEmail("");
        setContactMessage("");
      } catch {
        setContactFeedback({
          type: "err",
          text: "Erro de rede. Verifique sua conexão ou tente mais tarde.",
        });
      } finally {
        setContactSubmitting(false);
      }
    },
    [contactFirstName, contactLastName, contactEmail, contactMessage],
  );

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
              className="absolute left-1/2 top-1/2 hidden w-[90%] max-w-xl -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-16 font-medium md:flex"
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
              <nav className="flex items-center gap-5 font-medium md:hidden" style={{ color: navText }}>
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

              <div className="order-1 flex flex-col gap-8 text-center sm:text-left lg:order-2">
                <div className="space-y-2 md:space-y-2">
                  <p
                    className="font-medium leading-[1.08] tracking-tight"
                    style={{
                      fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                      fontSize: "clamp(2rem, 5.5vw + 0.5rem, 6.0125rem)",
                      color: isDark ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.85)",
                    }}
                  >
                    Bem-vindo
                  </p>

                  <div className="flex justify-center sm:justify-start">
                    <div className="inline-flex items-baseline whitespace-nowrap">
                      <span
                        className="font-quantify leading-none tracking-tight text-5xl md:text-7xl"
                        style={{ color: isDark ? "#ffffff" : "#0b0b12" }}
                      >
                        WPS
                      </span>
                      <span className="ml-[0.18em] inline-flex items-baseline leading-none">
                        <img
                          src={ONE_LOGO_SVG_SRC}
                          alt="One"
                          className="block h-[0.92em] w-auto max-w-[min(100%,280px)] shrink-0 select-none translate-y-[0.06em] md:translate-y-[0.05em]"
                          style={{
                            filter: isDark
                              ? "drop-shadow(0 10px 28px rgba(92,0,225,0.28))"
                              : "drop-shadow(0 8px 22px rgba(17,24,39,0.12))",
                          }}
                          draggable={false}
                        />
                      </span>
                    </div>
                  </div>
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: PURPLE }}>
              Contato
            </p>
            <h2
              className="mt-3 text-2xl font-bold leading-tight md:text-3xl"
              style={{ color: isDark ? "#fff" : "#0b0b12", fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}
            >
              Fale com a gente
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: mutedBody }}>
              Dúvidas sobre o WPS One, implantação ou acesso? Envie uma mensagem ou use os canais abaixo.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:items-start">
              <div className="space-y-5">
                <div
                  className="flex gap-4 rounded-2xl p-4 md:p-5"
                  style={{
                    background: surface,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${PURPLE}22`, color: PURPLE }}
                    aria-hidden
                  >
                    <MapPin className="h-5 w-5" />
                  </div>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed md:text-[15px]" style={{ color: mutedBody }}>
                    {CONTACT_ADDRESS}
                  </p>
                </div>

                <a
                  href={`https://wa.me/${CONTACT_WHATSAPP_E164}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-4 rounded-2xl p-4 transition-opacity hover:opacity-95 md:p-5"
                  style={{
                    background: surface,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${PURPLE}22`, color: PURPLE }}
                    aria-hidden
                  >
                    <WhatsAppIcon className="h-6 w-6" />
                  </div>
                  <p
                    className="min-w-0 flex-1 text-sm font-medium leading-relaxed underline-offset-2 md:text-[15px]"
                    style={{ color: isDark ? "#fff" : "#0b0b12" }}
                  >
                    {CONTACT_PHONE_DISPLAY}
                  </p>
                </a>

                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex gap-4 rounded-2xl p-4 transition-opacity hover:opacity-95 md:p-5"
                  style={{
                    background: surface,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${PURPLE}22`, color: PURPLE }}
                    aria-hidden
                  >
                    <Mail className="h-5 w-5" />
                  </div>
                  <p
                    className="min-w-0 flex-1 break-all text-sm font-medium leading-relaxed underline-offset-2 md:text-[15px]"
                    style={{ color: isDark ? "#fff" : "#0b0b12" }}
                  >
                    {CONTACT_EMAIL}
                  </p>
                </a>

                <div
                  className="rounded-2xl p-4 md:p-5"
                  style={{
                    background: surface,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                  }}
                >
                  <ul className="m-0 flex list-none flex-wrap items-center gap-3 p-0" aria-label="Redes sociais">
                    <li>
                      <a
                        href={SOCIAL_LINKEDIN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 w-11 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
                        style={{ background: `${PURPLE}22`, color: PURPLE }}
                        aria-label="LinkedIn WPS Consult"
                      >
                        <IconLinkedIn className="h-5 w-5" />
                      </a>
                    </li>
                    <li>
                      <a
                        href={SOCIAL_INSTAGRAM}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 w-11 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
                        style={{ background: `${PURPLE}22`, color: PURPLE }}
                        aria-label="Instagram WPS Consult"
                      >
                        <IconInstagram className="h-5 w-5" />
                      </a>
                    </li>
                    <li>
                      <a
                        href={SOCIAL_FACEBOOK}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 w-11 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
                        style={{ background: `${PURPLE}22`, color: PURPLE }}
                        aria-label="Facebook WPS Consult"
                      >
                        <IconFacebook className="h-5 w-5" />
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
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
                      fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                    }}
                  >
                    Voltar ao início
                  </button>
                </div>
              </div>

              <form
                onSubmit={submitContactForm}
                className="rounded-3xl p-6 md:p-8"
                style={{
                  background: surface,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.10)"}`,
                }}
              >
                <p className="text-sm font-semibold" style={{ color: isDark ? "#fff" : "#0b0b12" }}>
                  Envie uma mensagem
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: mutedBody }}>
                  Responderemos no e-mail{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-left">
                    <span className="mb-1.5 block text-xs font-medium" style={{ color: mutedBody }}>
                      Nome
                    </span>
                    <input
                      required
                      name="firstName"
                      autoComplete="given-name"
                      value={contactFirstName}
                      onChange={(e) => setContactFirstName(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2"
                      style={{
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.16)",
                        background: isDark ? "rgba(0,0,0,0.25)" : "#fff",
                        color: isDark ? "#fff" : "#0b0b12",
                        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                      }}
                    />
                  </label>
                  <label className="block text-left">
                    <span className="mb-1.5 block text-xs font-medium" style={{ color: mutedBody }}>
                      Sobrenome
                    </span>
                    <input
                      required
                      name="lastName"
                      autoComplete="family-name"
                      value={contactLastName}
                      onChange={(e) => setContactLastName(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2"
                      style={{
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.16)",
                        background: isDark ? "rgba(0,0,0,0.25)" : "#fff",
                        color: isDark ? "#fff" : "#0b0b12",
                        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                      }}
                    />
                  </label>
                </div>

                <label className="mt-4 block text-left">
                  <span className="mb-1.5 block text-xs font-medium" style={{ color: mutedBody }}>
                    E-mail
                  </span>
                  <input
                    required
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.16)",
                      background: isDark ? "rgba(0,0,0,0.25)" : "#fff",
                      color: isDark ? "#fff" : "#0b0b12",
                      fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                    }}
                  />
                </label>

                <label className="mt-4 block text-left">
                  <span className="mb-1.5 block text-xs font-medium" style={{ color: mutedBody }}>
                    Mensagem
                  </span>
                  <textarea
                    required
                    name="message"
                    rows={5}
                    minLength={10}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(17,24,39,0.16)",
                      background: isDark ? "rgba(0,0,0,0.25)" : "#fff",
                      color: isDark ? "#fff" : "#0b0b12",
                      fontFamily: "var(--font-montserrat), system-ui, sans-serif",
                    }}
                    placeholder="Como podemos ajudar?"
                  />
                </label>

                {contactFeedback && (
                  <p
                    className="mt-4 text-sm"
                    style={{
                      color: contactFeedback.type === "ok" ? (isDark ? "#86efac" : "#166534") : "#dc2626",
                    }}
                    role="status"
                  >
                    {contactFeedback.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60 sm:w-auto"
                  style={{ background: PURPLE }}
                >
                  {contactSubmitting ? "Enviando…" : "Enviar"}
                </button>
              </form>
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
