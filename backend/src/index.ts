import "dotenv/config";
import express from "express";
import { join } from "path";
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

const app = express();
const PORT = process.env.PORT || 4000;

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
  "https://wps-flowa.web.app",
  "https://wps-flowa.firebaseapp.com",
  "http://localhost:3000",
];
const allowedOrigins = [...new Set([...productionOrigins, ...envOrigins])];
const CORS_FALLBACK_ORIGIN = "https://wps-flowa.web.app";

// CORS: primeiro handler da app — headers em toda resposta e OPTIONS respondido aqui
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowOrigin =
    typeof origin === "string" && allowedOrigins.includes(origin)
      ? origin
      : CORS_FALLBACK_ORIGIN;
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Aumentar limite do corpo JSON para permitir upload de anexos em base64
// 10MB em arquivo viram ~13–14MB em base64, então 20MB é seguro
app.use(express.json({ limit: "20mb" }));

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/activities", activitiesRouter);
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
app.use("/api/access-control", accessControlRouter);

// Servir arquivos estáticos de uploads
app.use("/uploads", express.static(join(process.cwd(), "uploads")));

app.get("/", (_req, res) =>
  res.json({ api: "FLOWA", status: "ok", docs: "/health" })
);
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
