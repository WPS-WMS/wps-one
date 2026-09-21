import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendMail } from "../lib/mailer.js";
import { renderEmailLayout, escapeHtml as escapeHtmlTemplate } from "../lib/emailTemplate.js";
import { errorSummary } from "../lib/devLog.js";
import { serializePlan } from "../lib/platformPlans.js";
import { listPlatformPlans } from "../lib/subscriptionHelpers.js";
import { prisma } from "../lib/prisma.js";
import { validatePasswordPolicy } from "../lib/passwordPolicy.js";
import {
  createLandingTrialTenant,
  hashPassword,
  TRIAL_DAYS,
} from "../lib/publicSignup.js";

const CONTACT_TO = "contato@wpsconsult.com.br";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas mensagens. Tente novamente em alguns minutos." },
});

const plansLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em instantes." },
});

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const publicContactRouter = Router();

/** Planos ativos para a landing (sem autenticação). */
publicContactRouter.get("/plans", plansLimiter, async (_req, res) => {
  try {
    const plans = await listPlatformPlans({ activeOnly: true });
    res.json({
      plans: plans
        .map(serializePlan)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
    });
  } catch (err) {
    console.error("[public-plans]", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar planos." });
  }
});

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

  try {
    await prisma.landingLeadRequest.create({
      data: {
        kind: "contact",
        name: `${firstName} ${lastName}`.trim(),
        email: email.toLowerCase(),
        message,
      },
    });
  } catch (err) {
    console.error("[public-contact] persist", errorSummary(err));
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
    console.error("[public-contact]", errorSummary(err));
    res.status(500).json({ error: "Não foi possível enviar sua mensagem. Tente novamente mais tarde." });
  }
});

/** Solicitação de demonstração a partir do hero da landing. */
publicContactRouter.post("/demo", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (!name || name.length > 160) {
    res.status(400).json({ error: "Informe seu nome." });
    return;
  }
  if (!company || company.length > 200) {
    res.status(400).json({ error: "Informe o nome da empresa." });
    return;
  }
  if (!email || !isValidEmail(email) || email.length > 254) {
    res.status(400).json({ error: "E-mail inválido." });
    return;
  }
  if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 13) {
    res.status(400).json({ error: "Telefone inválido." });
    return;
  }

  try {
    await prisma.landingLeadRequest.create({
      data: {
        kind: "demo",
        name,
        company,
        email: email.toLowerCase(),
        phone,
      },
    });
  } catch (err) {
    console.error("[public-demo] persist", errorSummary(err));
    res.status(500).json({ error: "Não foi possível registrar sua solicitação. Tente novamente mais tarde." });
    return;
  }

  const subject = `[Site WPS One] Demonstração — ${name} (${company})`;
  const html = renderEmailLayout({
    subject,
    title: "Solicitação de demonstração",
    preheader: `${name} · ${company} pediu uma demonstração`,
    summaryRows: [
      { label: "Nome", value: name },
      { label: "Empresa", value: company },
      { label: "E-mail", value: email },
      { label: "Telefone", value: phone },
    ],
    bodyHtml: `
      <div style="margin:0 0 10px 0;color:#64748b;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">
        Origem
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px 16px;color:#0f172a;font-size:14px;line-height:22px">
        Botão &ldquo;Agendar demonstração&rdquo; na landing do WPS One.
      </div>
      <div style="margin-top:14px;color:#64748b;font-size:12px;line-height:18px">
        Responda para
        <a href="mailto:${escapeHtmlTemplate(email)}" style="color:#5c00e1;text-decoration:underline">${escapeHtmlTemplate(email)}</a>
        ou ligue/WhatsApp para ${escapeHtmlTemplate(phone)}.
      </div>
    `,
  });

  try {
    await sendMail({ to: CONTACT_TO, subject, html });
    res.json({ ok: true });
  } catch (err) {
    console.error("[public-demo] mail", errorSummary(err));
    // Lead já persistido — não falha a UX se o e-mail cair.
    res.json({ ok: true, mailWarning: true });
  }
});

/** Criação real de conta na landing (teste grátis de 7 dias). */
publicContactRouter.post("/signup", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const employees = typeof body.employees === "string" ? body.employees.trim() : "";
  const need = typeof body.need === "string" ? body.need.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm =
    typeof body.passwordConfirm === "string"
      ? body.passwordConfirm
      : typeof body.confirmPassword === "string"
        ? body.confirmPassword
        : "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (!name || name.length > 160) {
    res.status(400).json({ error: "Informe seu nome." });
    return;
  }
  if (!email || !isValidEmail(email) || email.length > 254) {
    res.status(400).json({ error: "E-mail inválido." });
    return;
  }
  if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 13) {
    res.status(400).json({ error: "Telefone inválido." });
    return;
  }
  if (!company || company.length > 200) {
    res.status(400).json({ error: "Informe o nome da empresa." });
    return;
  }
  if (!employees || employees.length > 80) {
    res.status(400).json({ error: "Informe o número de colaboradores." });
    return;
  }
  if (!need || need.length < 3) {
    res.status(400).json({ error: "Descreva sua necessidade atual." });
    return;
  }
  if (need.length > 2000) {
    res.status(400).json({ error: "Descrição da necessidade muito longa." });
    return;
  }
  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  if (password !== passwordConfirm) {
    res.status(400).json({ error: "A confirmação de senha não confere." });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const created = await createLandingTrialTenant({
      name,
      email,
      phone,
      company,
      employees,
      need,
      passwordHash,
    });

    const trialLabel = created.trialEndsAt.toLocaleDateString("pt-BR");
    const subject = `[Site WPS One] Nova conta (teste ${TRIAL_DAYS} dias) — ${company}`;
    const html = renderEmailLayout({
      subject,
      title: "Nova conta criada na landing",
      preheader: `${name} · ${company} — teste até ${trialLabel}`,
      summaryRows: [
        { label: "Nome", value: name },
        { label: "E-mail", value: email },
        { label: "Telefone", value: phone },
        { label: "Empresa", value: company },
        { label: "Colaboradores", value: employees },
        { label: "Teste até", value: trialLabel },
      ],
      bodyHtml: `
        <div style="margin:0 0 10px 0;color:#64748b;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">
          Necessidade
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px 16px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap">
          ${escapeHtmlTemplate(need)}
        </div>
        <div style="margin-top:14px;color:#64748b;font-size:12px;line-height:18px">
          Tenant: ${escapeHtmlTemplate(created.tenant.slug)} · após o teste, o acesso bloqueia sem assinatura em Minha Assinatura.
        </div>
      `,
    });
    void sendMail({ to: CONTACT_TO, subject, html }).catch((err) => {
      console.error("[public-signup] mail", errorSummary(err));
    });

    res.status(201).json({
      ok: true,
      trialDays: TRIAL_DAYS,
      trialEndsAt: created.trialEndsAt.toISOString(),
      message: `Conta criada. Você tem ${TRIAL_DAYS} dias de teste grátis. Faça login e, antes do fim do período, escolha um plano em Configurações → Minha Assinatura.`,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "EMAIL_IN_USE" || code === "P2002") {
      res.status(400).json({ error: "E-mail já cadastrado. Faça login ou use outro e-mail." });
      return;
    }
    console.error("[public-signup]", errorSummary(err));
    res.status(500).json({ error: "Não foi possível criar sua conta. Tente novamente mais tarde." });
  }
});
