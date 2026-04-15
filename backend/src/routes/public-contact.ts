import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendMail } from "../lib/mailer.js";
import { renderEmailLayout, escapeHtml as escapeHtmlTemplate } from "../lib/emailTemplate.js";

const CONTACT_TO = "contato@wpsconsult.com.br";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas mensagens. Tente novamente em alguns minutos." },
});

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const publicContactRouter = Router();
publicContactRouter.use(limiter);

publicContactRouter.post("/contact", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!firstName || firstName.length > 120) {
    res.status(400).json({ error: "Nome inválido." });
    return;
  }
  if (!lastName || lastName.length > 120) {
    res.status(400).json({ error: "Sobrenome inválido." });
    return;
  }
  if (!email || !isValidEmail(email) || email.length > 254) {
    res.status(400).json({ error: "E-mail inválido." });
    return;
  }
  if (!message || message.length < 10) {
    res.status(400).json({ error: "A mensagem deve ter pelo menos 10 caracteres." });
    return;
  }
  if (message.length > 8000) {
    res.status(400).json({ error: "Mensagem muito longa." });
    return;
  }

  const subject = `[Site WPS One] Contato de ${firstName} ${lastName}`;
  const html = renderEmailLayout({
    subject,
    title: "Nova mensagem do site",
    preheader: `${firstName} ${lastName} enviou uma mensagem`,
    summaryRows: [
      { label: "Nome", value: `${firstName} ${lastName}` },
      { label: "E-mail", value: email },
    ],
    bodyHtml: `
      <div style="margin:0 0 10px 0;color:#64748b;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">
        Mensagem
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px 16px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap">
        ${escapeHtmlTemplate(message)}
      </div>
      <div style="margin-top:14px;color:#64748b;font-size:12px;line-height:18px">
        Responda diretamente para <a href="mailto:${escapeHtmlTemplate(email)}" style="color:#5c00e1;text-decoration:underline">${escapeHtmlTemplate(email)}</a>.
      </div>
    `,
  });

  try {
    const result = await sendMail({ to: CONTACT_TO, subject, html });
    if ("skipped" in result && result.skipped) {
      res.status(503).json({
        error:
          "Envio de e-mail não configurado no servidor. Entre em contato por telefone ou e-mail direto.",
      });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[public-contact]", err);
    res.status(500).json({ error: "Não foi possível enviar sua mensagem. Tente novamente mais tarde." });
  }
});
