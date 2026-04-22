import "dotenv/config";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { join } from "path";
import cookieParser from "cookie-parser";
import { getUploadsRoot } from "./lib/uploadsRoot.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { ticketsRouter } from "./routes/tickets.js";
import { timeEntriesRouter } from "./routes/time-entries.js";
import { clientsRouter } from "./routes/clients.js";
import { activitiesRouter } from "./routes/activities.js";
import { usersRouter } from "./routes/users.js";
import { hourBankRouter } from "./routes/hour-bank.js";
import { tenantsRouter } from "./routes/tenants.js";
import { commentsRouter } from "./routes/comments.js";
import { permissionRequestsRouter } from "./routes/permission-requests.js";
import { uploadsRouter } from "./routes/uploads.js";
import { clientContactsRouter } from "./routes/client-contacts.js";
import { ticketHistoryRouter } from "./routes/ticket-history.js";
import { ticketAttachmentsRouter } from "./routes/ticket-attachments.js";
import { reportsRouter } from "./routes/reports.js";
import { accessControlRouter } from "./routes/access-control.js";
import { portalRouter } from "./routes/portal.js";
import { clientReportsRouter } from "./routes/client-reports.js";
import { publicContactRouter } from "./routes/public-contact.js";
import { emailNotificationRulesRouter } from "./routes/emailNotificationRules.js";

const app = express();
app.disable("x-powered-by");
app.use(compression());
// Necessário para cookies `secure` atrás de proxy (Render).
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;

// Headers de segurança (API JSON)
app.use(
  helmet({
    // API não precisa de CSP aqui; CSP fica melhor no frontend (hosting).
    contentSecurityPolicy: false,
    // Mantemos CORP desabilitado para não conflitar com download de arquivos/embeds.
    crossOriginResourcePolicy: false,
  }),
);

// Normalizar origens: remover aspas que o Railway (ou .env) pode incluir no valor
function parseOrigins(envValue: string | undefined): string[] {
  if (!envValue || typeof envValue !== "string") return [];
  return envValue
    .split(",")
    .map((o) => o.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const envOrigins = parseOrigins(process.env.CORS_ORIGIN);
const productionOrigins = [
  // Domínio customizado (Firebase Hosting)
  "https://wpsone.com.br",
  "https://www.wpsone.com.br",
  // Firebase Hosting — projeto atual: wps-one-frontend
  "https://wps-one-frontend.web.app",
  "https://wps-one-frontend.firebaseapp.com",
  // Firebase Hosting — site QA do mesmo projeto
  "https://wps-one-frontend-qa.web.app",
  "https://wps-one-frontend-qa.firebaseapp.com",
  // Outras origens (ambientes/preview) podem ser adicionadas via CORS_ORIGIN no .env/Render
  "http://localhost:3000",
];
const allowedOrigins = [...new Set([...productionOrigins, ...envOrigins])];
const CORS_FALLBACK_ORIGIN =
  process.env.CORS_FALLBACK_ORIGIN || "https://wps-one-frontend.web.app";

/**
 * URLs de preview do Firebase Hosting usam o padrão PROJECT--channel-....web.app
 * (não estão na lista fixa). Sem isto, o browser bloqueia o fetch (parece "Failed to fetch").
 */
function isFirebaseHostingWpsOneFrontends(originStr: string): boolean {
  if (!originStr.startsWith("https://")) return false;
  let host: string;
  try {
    host = new URL(originStr).hostname;
  } catch {
    return false;
  }
  if (!host.endsWith(".web.app") && !host.endsWith(".firebaseapp.com")) return false;
  const exactHosts = new Set([
    "wps-one-frontend.web.app",
    "wps-one-frontend.firebaseapp.com",
    "wps-one-frontend-qa.web.app",
    "wps-one-frontend-qa.firebaseapp.com",
  ]);
  if (exactHosts.has(host)) return true;
  if (host.startsWith("wps-one-frontend--") && host.endsWith(".web.app")) return true;
  if (host.startsWith("wps-one-frontend-qa--") && host.endsWith(".web.app")) return true;
  return false;
}

// CORS: primeiro handler da app — headers em toda resposta e OPTIONS respondido aqui
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originStr = typeof origin === "string" ? origin : "";
  const isAllowedExact = originStr && allowedOrigins.includes(originStr);
  // Permite também qualquer subdomínio de wpsone.com.br (ex.: preview/ambientes).
  const isAllowedWpsoneDomain =
    originStr.startsWith("https://") &&
    (originStr === "https://wpsone.com.br" ||
      originStr === "https://www.wpsone.com.br" ||
      originStr.endsWith(".wpsone.com.br"));
  const isAllowedFirebaseHosting = isFirebaseHostingWpsOneFrontends(originStr);

  const allowOrigin =
    isAllowedExact || isAllowedWpsoneDomain || isAllowedFirebaseHosting
      ? originStr
      : CORS_FALLBACK_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Aumentar limite do corpo JSON para permitir upload de anexos em base64.
// Base64 aumenta ~33%. Em produção, anexos podem chegar a 30MB (≈40MB em base64),
// então usamos 80MB para margem. Em QA/dev mantemos menor.
const jsonLimit = process.env.NODE_ENV === "production" ? "80mb" : "40mb";
app.use(express.json({ limit: jsonLimit }));
app.use(cookieParser());

// Rate limit básico para evitar abuso e proteger disponibilidade
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 600, // 600 req/min por IP (ajuste conforme tráfego)
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

app.use("/api/public", publicContactRouter);
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/email-notification-rules", emailNotificationRulesRouter);
app.use("/api/users", usersRouter);
app.use("/api/hour-bank", hourBankRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/permission-requests", permissionRequestsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/client-contacts", clientContactsRouter);
app.use("/api/ticket-history", ticketHistoryRouter);
app.use("/api/ticket-attachments", ticketAttachmentsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/client-reports", clientReportsRouter);
app.use("/api/access-control", accessControlRouter);
app.use("/api/portal", portalRouter);

// Uploads: em produção, restringir exposição pública.
// - Mantém avatares públicos por compatibilidade (/uploads/users/**)
// - Portal: permite apenas imagens em /uploads/portal/** (PDFs devem passar por rotas autenticadas)
// - Tickets/Projects: bloqueados (devem passar por rotas autenticadas)
if (process.env.NODE_ENV === "production") {
  const imgExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

  app.use("/uploads/users", express.static(join(getUploadsRoot(), "users")));

  app.use("/uploads/portal", (req, res, next) => {
    const p = String(req.path || "").toLowerCase();
    const dot = p.lastIndexOf(".");
    const ext = dot >= 0 ? p.slice(dot) : "";
    if (!ext || !imgExt.has(ext)) return res.status(404).end();
    return next();
  });
  app.use("/uploads/portal", express.static(join(getUploadsRoot(), "portal")));

  // Bloqueia anexos sensíveis por URL pública
  app.use("/uploads/tickets", (_req, res) => res.status(404).end());
  app.use("/uploads/projects", (_req, res) => res.status(404).end());

  // Qualquer outro prefixo de uploads não deve ser público
  app.use("/uploads", (_req, res) => res.status(404).end());
} else {
  // Em dev/QA, manter compatibilidade para facilitar debug.
  app.use("/uploads", express.static(getUploadsRoot()));
}

app.get("/", (_req, res) =>
  res.json({ api: "WPS One", status: "ok", docs: "/health" })
);
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
