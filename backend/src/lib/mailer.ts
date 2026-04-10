import nodemailer from "nodemailer";

type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
};

function isSmtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

function isMicrosoftGraphConfigured() {
  return !!(
    process.env.M365_TENANT_ID &&
    process.env.M365_CLIENT_ID &&
    process.env.M365_CLIENT_SECRET &&
    (process.env.M365_FROM || process.env.SMTP_FROM)
  );
}

function extractEmailAddress(from: string) {
  const raw = String(from ?? "").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

async function sendMailViaSmtp({ to, subject, html }: SendMailArgs) {
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
  });
  return { ok: true as const };
}

async function getMicrosoftGraphAccessToken() {
  const tenantId = process.env.M365_TENANT_ID!;
  const clientId = process.env.M365_CLIENT_ID!;
  const clientSecret = process.env.M365_CLIENT_SECRET!;

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
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

async function sendMailViaMicrosoftGraph({ to, subject, html }: SendMailArgs) {
  const fromRaw = process.env.M365_FROM || process.env.SMTP_FROM!;
  const fromEmail = extractEmailAddress(fromRaw);
  const token = await getMicrosoftGraphAccessToken();

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`;
  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: false,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Falha ao enviar via Graph (${resp.status}): ${text || resp.statusText}`);
  }

  return { ok: true as const };
}

export async function sendMail({ to, subject, html }: SendMailArgs) {
  if (!isSmtpConfigured() && !isMicrosoftGraphConfigured()) {
    // Em produção, isso virava "silencioso" e dificultava suporte.
    // Não logamos conteúdo do e-mail por segurança.
    console.warn("[MAIL] Envio de e-mail não configurado (SMTP/Graph). Envio ignorado.", {
      to,
      subject,
    });
    return { ok: false as const, skipped: true as const };
  }

  try {
    if (isMicrosoftGraphConfigured()) {
      return await sendMailViaMicrosoftGraph({ to, subject, html });
    }
    return await sendMailViaSmtp({ to, subject, html });
  } catch (err) {
    // Loga somente metadados; sem corpo do e-mail/credenciais.
    const e = err as any;
    console.error("[MAIL] sendMail falhou", {
      to,
      subject,
      code: e?.code,
      responseCode: e?.responseCode,
      message: e?.message,
    });
    throw err;
  }
}

