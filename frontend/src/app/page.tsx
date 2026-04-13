"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, UserRound } from "lucide-react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Usuário já autenticado continua indo direto para o seu dashboard / portal.
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

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] flex flex-col">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 420px at 75% 20%, rgba(92,0,225,0.14), transparent 60%), radial-gradient(720px 420px at 20% 75%, rgba(87,66,118,0.10), transparent 62%)",
        }}
        aria-hidden
      />
      <header className="w-full">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-[color:var(--muted-foreground)]">
            <a href="#home" className="hover:text-[color:var(--foreground)] transition-colors">
              Home
            </a>
            <a href="#sobre" className="hover:text-[color:var(--foreground)] transition-colors">
              Sobre
            </a>
            <a href="#contato" className="hover:text-[color:var(--foreground)] transition-colors">
              Contato
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-[color:var(--primary)] px-6 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95 transition-opacity"
            >
              Entrar
            </Link>
            <Link
              href="/login"
              aria-label="Entrar"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)]/80 bg-[color:var(--surface)]/40 backdrop-blur hover:opacity-90 transition-opacity"
            >
              <UserRound className="h-5 w-5 text-[color:var(--muted-foreground)]" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section id="home" className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-16">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-10">
              <div className="flex items-end gap-4">
                <div className="relative">
                  <div className="rounded-none border-2 border-[color:var(--primary)]/85 px-3 py-1.5">
                    <span className="text-5xl sm:text-6xl font-black tracking-tight text-[color:var(--foreground)]">
                      WPS
                    </span>
                  </div>
                </div>
                <img
                  src="/WPS One 2.png"
                  alt="One"
                  className="h-[44px] sm:h-[56px] w-auto select-none"
                  draggable={false}
                />
              </div>

              <div className="max-w-xl rounded-3xl bg-[color:var(--primary)] px-8 py-7 text-[color:var(--primary-foreground)] shadow-[0_18px_55px_-20px_rgba(92,0,225,0.65)]">
                <h2 className="text-lg sm:text-xl font-bold">Gestão de projetos</h2>
                <p className="mt-3 text-base/relaxed opacity-95">
                  Modele projetos internos, Fixed Price, AMS e T&amp;M, com horas contratadas,
                  banco de horas e escopo.
                </p>
              </div>

              <div className="flex justify-center sm:justify-start">
                <a
                  href="#sobre"
                  className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-6 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95 transition-opacity"
                >
                  Próximo
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_55%_at_65%_30%,rgba(92,0,225,0.20),transparent_60%)]" />
              <img
                src="/WPS One seta.png"
                alt=""
                className="w-full max-w-[560px] mx-auto select-none opacity-90 drop-shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
                draggable={false}
              />
            </div>
          </div>
        </section>

        <section id="sobre" className="mx-auto max-w-6xl px-6 pb-16">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/50 backdrop-blur p-6 md:p-8">
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Sobre</h3>
            <p className="mt-2 text-sm md:text-base leading-relaxed text-[color:var(--muted-foreground)] max-w-3xl">
              O WPS One centraliza projetos, chamados e apontamentos em um fluxo simples e consistente, com acesso
              segmentado por perfil e foco em produtividade no dia a dia.
            </p>
          </div>
        </section>

        <section id="contato" className="mx-auto max-w-6xl px-6 pb-20">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/50 backdrop-blur p-6 md:p-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Contato</h3>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                Para acessar, utilize suas credenciais ou fale com a equipe responsável.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-[color:var(--primary-foreground)] shadow-sm hover:opacity-95 transition-opacity"
            >
              Entrar no sistema
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--border)] bg-[color:var(--surface)]/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-[color:var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} WPS One. Todos os direitos reservados.</p>
          <p className="text-[11px]">Projetos, chamados e horas em uma experiência moderna.</p>
        </div>
      </footer>
    </div>
  );
}
