import nodemailer from "nodemailer";
import { logLineSubject, redactEmailForLog } from "./devLog.js";

export type MailAttachment = {
  filename: string;
  contentType?: string;
  /** Conteúdo em base64 (sem prefixo data:) */
  contentBase64: string;
};

type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
};

/** Primeiro caractere não vazio de qualquer uma das chaves (trim). */
function pickEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const v = process.env[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

function envKeyPresent(keys: readonly string[]): boolean {
  return keys.some((key) => {
    const v = process.env[key];
    return v != null && String(v).trim() !== "";
  });
}

/** Modo explícito: só Graph (não tenta SMTP). Valores: graph | m365 | microsoft */
function isEmailProviderGraphOnly() {
  const p = String(process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  return p === "graph" || p === "m365" || p === "microsoft";
}

function isSmtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

const GRAPH_TENANT_KEYS = [
  "M365_TENANT_ID",
  "TENANT_ID",
  "AZURE_TENANT_ID",
  "GRAPH_TENANT_ID",
  "MICROSOFT_TENANT_ID",
] as const;

const GRAPH_CLIENT_KEYS = [
  "M365_CLIENT_ID",
  "CLIENT_ID",
  "AZURE_CLIENT_ID",
  "GRAPH_CLIENT_ID",
  "MS_CLIENT_ID",
  "MICROSOFT_CLIENT_ID",
] as const;

const GRAPH_SECRET_KEYS = [
  "M365_CLIENT_SECRET",
  "CLIENT_SECRET",
  "AZURE_CLIENT_SECRET",
  "GRAPH_CLIENT_SECRET",
  "MS_CLIENT_SECRET",
  "MICROSOFT_CLIENT_SECRET",
] as const;

const GRAPH_FROM_KEYS = [
  "M365_FROM",
  "EMAIL_FROM",
  "MAIL_FROM",
  "SMTP_FROM",
  "GRAPH_FROM",
  "FROM_EMAIL",
  "MS_GRAPH_FROM",
] as const;

/**
 * Credenciais Microsoft Graph (client credentials).
 * Lê vários nomes de variável (Render/Azure costumam usar TENANT_ID, CLIENT_ID, etc.).
 */
function getGraphConfig(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fromRaw: string;
} | null {
  const tenantId = pickEnv(GRAPH_TENANT_KEYS);
  const clientId = pickEnv(GRAPH_CLIENT_KEYS);
  const clientSecret = pickEnv(GRAPH_SECRET_KEYS);
  const fromRaw = pickEnv(GRAPH_FROM_KEYS);

  if (!tenantId || !clientId || !clientSecret || !fromRaw) return null;
  return { tenantId, clientId, clientSecret, fromRaw };
}

/** Para logs: quais “grupos” têm alguma variável definida (não expõe valores). */
function graphEnvPresence() {
  return {
    tenant: envKeyPresent(GRAPH_TENANT_KEYS),
    clientId: envKeyPresent(GRAPH_CLIENT_KEYS),
    secret: envKeyPresent(GRAPH_SECRET_KEYS),
    from: envKeyPresent(GRAPH_FROM_KEYS),
  };
}

function isMicrosoftGraphConfigured(): boolean {
  return getGraphConfig() !== null;
}

function extractEmailAddress(from: string) {
  const raw = String(from ?? "").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

async function sendMailViaSmtp({ to, subject, html, attachments }: SendMailArgs) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    attachments: (attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
    })),
  });
  return { ok: true as const };
}

async function getMicrosoftGraphAccessToken(cfg: NonNullable<ReturnType<typeof getGraphConfig>>) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", cfg.clientId);
  body.set("client_secret", cfg.clientSecret);
  body.set("grant_type", "client_credentials");
  body.set("scope", "https://graph.microsoft.com/.default");

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Falha ao obter token do Graph (${resp.status}): ${text || resp.statusText}`);
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Token do Graph não retornou access_token.");
  return data.access_token;
}

async function sendMailViaMicrosoftGraph({ to, subject, html, attachments }: SendMailArgs) {
  const cfg = getGraphConfig();
  if (!cfg) throw new Error("Microsoft Graph: configuração incompleta.");

  const fromEmail = extractEmailAddress(cfg.fromRaw);
  const token = await getMicrosoftGraphAccessToken(cfg);

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`;
  const graphAttachments = (attachments ?? []).map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.filename,
    contentType: a.contentType || "application/octet-stream",
    contentBytes: a.contentBase64,
  }));
  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      ...(graphAttachments.length ? { attachments: graphAttachments } : {}),
    },
    saveToSentItems: false,
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) return { ok: true as const };

    const text = await resp.text().catch(() => "");
    const retryAfter = Number(resp.headers.get("retry-after") ?? "");
    const is429 = resp.status === 429;
    const is5xx = resp.status >= 500;
    const canRetry = (is429 || is5xx) && attempt < maxAttempts;

    if (!canRetry) {
      throw new Error(`Falha ao enviar via Graph (${resp.status}): ${text || resp.statusText}`);
    }

    const base = 800 * Math.pow(2, attempt - 1); // 0.8s, 1.6s, 3.2s, 6.4s...
    const jitter = Math.round(Math.random() * 250);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : base + jitter;
    console.warn("[MAIL] Graph throttled/erro temporário; retry", {
      to: redactEmailForLog(to),
      subject: logLineSubject(subject),
      status: resp.status,
      attempt,
      waitMs,
      hasRetryAfterHeader: Boolean(resp.headers.get("retry-after")),
    });
    await sleep(waitMs);
  }

  return { ok: true as const };
}

function logMailSkippedGraphIncomplete(to: string, subject: string, graphOnly: boolean) {
  const presence = graphEnvPresence();
  const missing: string[] = [];
  if (!presence.tenant) missing.push("tenant (ex.: TENANT_ID ou M365_TENANT_ID)");
  if (!presence.clientId) missing.push("client id (ex.: CLIENT_ID ou M365_CLIENT_ID)");
  if (!presence.secret) missing.push("client secret (ex.: CLIENT_SECRET ou M365_CLIENT_SECRET)");
  if (!presence.from) missing.push("remetente (ex.: EMAIL_FROM ou M365_FROM)");

  console.warn("[MAIL] Envio ignorado: Microsoft Graph incompleto ou variáveis não visíveis no processo.", {
    to: redactEmailForLog(to),
    subject: logLineSubject(subject),
    graphEnvPresence: presence,
    missingHint: missing.length ? missing.join("; ") : "valores vazios — confira se as keys estão no serviço correto do Render e redeploy",
    graphOnlyMode: graphOnly,
    tip: "As variáveis devem estar no mesmo Web Service que executa node dist/index.js (não só no Postgres). Após alterar, faça redeploy.",
  });
}

export async function sendMail({ to, subject, html, attachments }: SendMailArgs) {
  const graphOnly = isEmailProviderGraphOnly();
  const graphOk = isMicrosoftGraphConfigured();
  const smtpOk = isSmtpConfigured();

  if (graphOk) {
    // Graph aplica limites de concorrência por mailbox.
    // Serializamos os envios para evitar 429 (MailboxConcurrency) quando há múltiplos destinatários.
    // (Sem isso, notifyTicketMembers dispara vários sendMail em paralelo com Promise.allSettled.)
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (globalThis as any).__wpsGraphMailQueue ??= Promise.resolve();
    const key = "__wpsGraphMailQueue";
    const prev: Promise<unknown> = (globalThis as any)[key];
    const next = prev.then(() => sendMailViaMicrosoftGraph({ to, subject, html, attachments }));
    // Mantém a fila viva mesmo se este envio falhar (não “quebra” os próximos).
    (globalThis as any)[key] = next.catch(() => undefined);
    try {
      return await next;
    } catch (err) {
      const e = err as any;
      console.error("[MAIL] sendMail falhou", {
        to: redactEmailForLog(to),
        subject: logLineSubject(subject),
        code: e?.code,
        responseCode: e?.responseCode,
        message: typeof e?.message === "string" ? logLineSubject(e.message, 400) : e?.message,
      });
      throw err;
    }
  }

  if (graphOnly) {
    logMailSkippedGraphIncomplete(to, subject, true);
    return { ok: false as const, skipped: true as const };
  }

  if (!smtpOk) {
    logMailSkippedGraphIncomplete(to, subject, false);
    return { ok: false as const, skipped: true as const };
  }

  try {
    return await sendMailViaSmtp({ to, subject, html, attachments });
  } catch (err) {
    const e = err as any;
    console.error("[MAIL] sendMail falhou", {
      to: redactEmailForLog(to),
      subject: logLineSubject(subject),
      code: e?.code,
      responseCode: e?.responseCode,
      message: typeof e?.message === "string" ? logLineSubject(e.message, 400) : e?.message,
    });
    throw err;
  }
}
