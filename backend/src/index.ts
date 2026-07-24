import "dotenv/config";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { join } from "path";
import cookieParser from "cookie-parser";
import { getUploadsRoot } from "./lib/uploadsRoot.js";
import { ensurePrismaConnected } from "./lib/prisma.js";
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
import { reimbursementsRouter } from "./routes/reimbursements.js";
import { reportsRouter } from "./routes/reports.js";
import { accessControlRouter } from "./routes/access-control.js";
import { portalRouter } from "./routes/portal.js";
import { clientReportsRouter } from "./routes/client-reports.js";
import { publicContactRouter } from "./routes/public-contact.js";
import { emailNotificationRulesRouter } from "./routes/emailNotificationRules.js";
import { holidaysRouter } from "./routes/holidays.js";
import { projectGroupsRouter } from "./routes/project-groups.js";
import { tmGestaoRouter } from "./routes/tm-gestao.js";
import { sharepointRouter } from "./routes/sharepoint.js";
import { runSharePointPollingCycle } from "./lib/sharepointSyncService.js";
import { errorSummary } from "./lib/devLog.js";

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
  // Preflight: o browser envia `Access-Control-Request-Headers` com a lista real (ex.: authorization + baggage).
  // Se omitirmos algum, o preflight falha com "No 'Access-Control-Allow-Origin'" (mensagem enganadora no Chrome).
  const requestedHeaders = req.headers["access-control-request-headers"];
  if (typeof requestedHeaders === "string" && requestedHeaders.trim()) {
    res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
  } else {
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, X-Requested-With, Cookie, X-Request-Id, baggage, sentry-trace",
    );
  }
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Limite global baixo: um único `express.json({ limit: "80mb" })` em toda a API faz o Node
// reservar/parsear corpos enormes (JSON.parse no stack) e estourar heap (~1GB) em instâncias pequenas.
// Rotas que aceitam base64 grande (anexos, reembolsos, portal) recebem parser dedicado abaixo.
const jsonBodyDefaultLimit = process.env.JSON_BODY_LIMIT || "2mb";
// Base64 ~4/3 do tamanho binário; anexos de tarefa até 50MB precisam de folga no corpo JSON (~67MB+).
const jsonBodyLargeLimit =
  process.env.JSON_BODY_LARGE_LIMIT || (process.env.NODE_ENV === "production" ? "80mb" : "75mb");
const jsonParserDefault = express.json({ limit: jsonBodyDefaultLimit });
const jsonParserLarge = express.json({ limit: jsonBodyLargeLimit });

app.use(cookieParser());

// Rate limit antes dos parsers de corpo grande (anexos também entram na conta).
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 600, // 600 req/min por IP (ajuste conforme tráfego)
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // OPTIONS (CORS preflight) não deve consumir quota nem devolver 429 sem cabeçalhos CORS.
    skip: (req) => req.method === "OPTIONS",
  }),
);

let dbReady = false;

// Health/liveness antes de qualquer gate de DB — Render/Varnish exige primeiro byte rápido no cold start.
app.get("/", (_req, res) =>
  res.json({ api: "WPS One", status: "ok", docs: "/health" }),
);
app.get("/health", (_req, res) =>
  res.json({ ok: true, db: dbReady ? "connected" : "connecting" }),
);

const dbInitPromise = ensurePrismaConnected()
  .then(() => {
    dbReady = true;
    console.log("[DB] Conectado.");
  })
  .catch((err) => {
    console.error("[DB] Falha ao conectar na inicialização.", errorSummary(err));
    throw err;
  });

/** Rotas da API aguardam o banco; /health responde imediatamente para evitar 503 Varnish no boot. */
app.use(async (req, res, next) => {
  const path = req.path;
  if (path === "/health" || path === "/" || req.method === "OPTIONS") {
    return next();
  }
  if (dbReady) return next();
  try {
    await dbInitPromise;
    return next();
  } catch {
    return res.status(503).json({
      error: "Banco de dados indisponível no momento. Tente novamente.",
    });
  }
});

app.use("/api/ticket-attachments", jsonParserLarge, ticketAttachmentsRouter);
app.use("/api/uploads", jsonParserLarge, uploadsRouter);
app.use("/api/reimbursements", jsonParserLarge, reimbursementsRouter);
app.use("/api/portal", jsonParserLarge, portalRouter);

app.use(jsonParserDefault);

app.use("/api/public", publicContactRouter);
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/email-notification-rules", emailNotificationRulesRouter);
app.use("/api/holidays", holidaysRouter);
app.use("/api/users", usersRouter);
app.use("/api/hour-bank", hourBankRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/project-groups", projectGroupsRouter);
app.use("/api/tm-gestao", tmGestaoRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/permission-requests", permissionRequestsRouter);
app.use("/api/client-contacts", clientContactsRouter);
app.use("/api/ticket-history", ticketHistoryRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/client-reports", clientReportsRouter);
app.use("/api/access-control", accessControlRouter);
app.use("/api/sharepoint", sharepointRouter);

// Uploads: em produção, restringir exposição pública.
// - Mantém avatares públicos por compatibilidade (/uploads/users/**)
// - Portal: permite apenas imagens em /uploads/portal/** (PDFs devem passar por rotas autenticadas)
// - Tickets: apenas imagens em /uploads/tickets/** (comentários HTML usam `<img src=...>` sem JWT)
// - Projects: bloqueado (usar rotas autenticadas)
if (process.env.NODE_ENV === "production") {
  const imgExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

  app.use("/uploads/users", express.static(join(getUploadsRoot(), "users")));

  const uploadsImageOnlyGuard: express.RequestHandler = (req, res, next) => {
    const p = String(req.path || "").toLowerCase();
    const dot = p.lastIndexOf(".");
    const ext = dot >= 0 ? p.slice(dot) : "";
    if (!ext || !imgExt.has(ext)) return res.status(404).end();
    return next();
  };

  app.use("/uploads/portal", uploadsImageOnlyGuard);
  app.use("/uploads/portal", express.static(join(getUploadsRoot(), "portal")));

  // Imagens embutidas em comentários usam `fileUrl` em `/uploads/tickets/...` (não enviam JWT).
  // PDFs e outros anexos continuam acessíveis só via `/api/ticket-attachments/:id/file`.
  app.use("/uploads/tickets", uploadsImageOnlyGuard);
  app.use("/uploads/tickets", express.static(join(getUploadsRoot(), "tickets")));

  app.use("/uploads/projects", (_req, res) => res.status(404).end());

  // Qualquer outro prefixo de uploads não deve ser público
  app.use("/uploads", (_req, res) => res.status(404).end());
} else {
  // Em dev/QA, manter compatibilidade para facilitar debug.
  app.use("/uploads", express.static(getUploadsRoot()));
}

async function start() {
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`API rodando em http://localhost:${PORT}`);
  });

  void dbInitPromise.catch(() => {
    // Erro já logado; requests /api recebem 503 JSON até reconectar manualmente/restart.
  });

  const pollMs = Number(process.env.SHAREPOINT_SYNC_INTERVAL_MS ?? "300000");
  if (Number.isFinite(pollMs) && pollMs >= 60000) {
    setInterval(() => {
      void runSharePointPollingCycle().catch((err) =>
        console.error("[SHAREPOINT] polling:", errorSummary(err)),
      );
    }, pollMs);
    console.log(`[SHAREPOINT] Polling a cada ${pollMs}ms`);
  }
}

start();
