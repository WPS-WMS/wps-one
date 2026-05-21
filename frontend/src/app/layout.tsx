import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Carregadas em runtime via <link> — evita falha de build sem acesso a fonts.googleapis.com */
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap";

export const metadata: Metadata = {
  title: "WPS One - Gestão de Projetos",
  description: "Sistema de gestão de projetos com apontamento de horas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <ThemeToggle />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
