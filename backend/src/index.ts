import "dotenv/config";
import express from "express";
import cors from "cors";
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

const app = express();
const PORT = process.env.PORT || 4000;

const envOrigins =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) || [];
const defaultProductionOrigins = [
  "https://wps-flowa.web.app",
  "https://wps-flowa.firebaseapp.com",
];
const allowedOrigins =
  envOrigins.length > 0
    ? envOrigins
    : process.env.NODE_ENV === "production"
      ? defaultProductionOrigins
      : ["http://localhost:3000"];

if (process.env.NODE_ENV === "production" && envOrigins.length === 0) {
  console.warn(
    "[CORS] Usando origens padrão de produção (wps-flowa). Para restringir, defina CORS_ORIGIN no Railway (ex.: https://wps-flowa.web.app,https://wps-flowa.firebaseapp.com)."
  );
}

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    credentials: true,
  })
);
app.use(express.json());

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

// Servir arquivos estáticos de uploads
app.use("/uploads", express.static(join(process.cwd(), "uploads")));

app.get("/", (_req, res) =>
  res.json({ api: "FLOWA", status: "ok", docs: "/health" })
);
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
