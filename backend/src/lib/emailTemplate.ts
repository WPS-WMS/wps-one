type EmailCta = {
  label: string;
  href: string;
};

export function pickEnv(keys: readonly string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function normalizeUrl(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\/$/, "");
}

/** Base pública do app (links em e-mail de tarefa/chamado). */
export function resolveTicketAppBaseUrl(): string {
  return normalizeUrl(
    pickEnv([
      "APP_URL",
      "APP_URL_QA",
      "APP_URL_PROD",
      "FRONTEND_URL",
      "NEXT_PUBLIC_APP_URL",
      "PUBLIC_APP_URL",
      "WEB_APP_URL",
      "EMAIL_ASSETS_BASE_URL",
    ]),
  );
}

export function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getBrandConfig(): {
  brandName: string;
  brandUrl: string;
  logoUrl: string;
  wordmarkUrl: string;
  iconUrl: string;
  emailBgUrl: string;
  supportUrl: string;
} {
  const brandUrl = normalizeUrl(
    pickEnv(["EMAIL_BRAND_URL", "BRAND_URL", "PUBLIC_SITE_URL"]) || "https://wpsone.com.br",
  );
  const brandName = pickEnv(["EMAIL_BRAND_NAME", "BRAND_NAME"]) || "WPS One";
  // `logoUrl`: imagem única (fallback)
  const logoUrl = pickEnv(["EMAIL_LOGO_URL", "BRAND_LOGO_URL"]);
  // Wordmark + ícone separados (preferido para combinar com a landing page)
  const wordmarkUrlRaw = pickEnv(["EMAIL_WORDMARK_URL", "EMAIL_LOGO_WORDMARK_URL", "BRAND_WORDMARK_URL"]);
  const iconUrlRaw = pickEnv(["EMAIL_ICON_URL", "EMAIL_LOGO_ICON_URL", "BRAND_ICON_URL"]);
  const emailBgUrlRaw = pickEnv(["EMAIL_BG_URL", "EMAIL_BACKGROUND_URL", "EMAIL_EMAIL_BG_URL", "BRAND_BG_URL"]);

  // Base pública para assets de e-mail (preferimos APP_URL quando os PNGs estão no frontend).
  // Ex.: APP_URL=https://app.wpsone.com.br (onde /public é servido).
  const assetsBaseUrl = normalizeUrl(pickEnv(["EMAIL_ASSETS_BASE_URL", "APP_URL"])) || brandUrl;
  const asset = (fileName: string) =>
    `${assetsBaseUrl}/${encodeURIComponent(fileName).replace(/%2F/g, "/")}`;

  // Defaults: usar PNG (maior compatibilidade em clientes de e-mail).
  // Você pode sobrescrever via EMAIL_WORDMARK_URL / EMAIL_ICON_URL.
  const wordmarkUrl = wordmarkUrlRaw || asset("wpsone-email-wordmark.png");
  const iconUrl = iconUrlRaw || asset("wpsone-email-icon.png");
  const deriveBgFrom = (url: string) => {
    const u = String(url ?? "").trim();
    if (!u) return "";
    // Troca apenas o último segmento (arquivo), mantendo host/pasta e preservando query/hash.
    // Ex.: https://host/assets/wpsone-email-wordmark.png?token=... -> .../wpsone-email-bg.png?token=...
    try {
      const parsed = new URL(u);
      parsed.pathname = parsed.pathname.replace(/[^/]+$/, "wpsone-email-bg.png");
      return parsed.toString();
    } catch {
      // Fallback: preserva query/hash quando não for URL absoluta.
      const m = u.match(/^(.+\/)[^/?#]+(\?[^#]*)?(#.*)?$/);
      if (!m) return u.replace(/[^/]+$/, "wpsone-email-bg.png");
      return `${m[1]}wpsone-email-bg.png${m[2] ?? ""}${m[3] ?? ""}`;
    }
  };
  const emailBgUrl =
    emailBgUrlRaw ||
    // Primeiro tenta derivar do wordmark efetivo (mesmo quando o URL vem do fallback asset()).
    deriveBgFrom(wordmarkUrl) ||
    asset("wpsone-email-bg.png");
  const supportUrl = normalizeUrl(pickEnv(["EMAIL_SUPPORT_URL", "SUPPORT_URL"])) || brandUrl;
  return { brandName, brandUrl, logoUrl, wordmarkUrl, iconUrl, emailBgUrl, supportUrl };
}

/** URL absoluta para abrir a tarefa no app (sempre usada no botão dos e-mails de chamado). */
export function resolveTicketOpenHref(ticketId: string): string {
  const path = `/admin/chamados/${encodeURIComponent(ticketId)}`;
  const base = resolveTicketAppBaseUrl();
  if (base) return `${base}${path}`;
  const brand = getBrandConfig();
  const fallback = normalizeUrl(brand.supportUrl) || normalizeUrl(brand.brandUrl) || "https://wpsone.com.br";
  return `${fallback}${path}`;
}

export function renderEmailLayout(args: {
  subject: string;
  title: string;
  preheader?: string;
  summaryRows?: Array<{ label: string; value: string }>;
  bodyHtml: string;
  cta?: EmailCta;
  footerNote?: string;
}): string {
  const brand = getBrandConfig();
  const preheader = args.preheader ? escapeHtml(args.preheader) : "";
  // Fundo externo (atrás do card): degradê preto + roxo, com fallback para clientes com suporte limitado.
  const outerBgColor = "#0b1020";
  const outerBgImage =
    "radial-gradient(900px 420px at 78% 30%, rgba(92,0,225,0.35), transparent 55%)," +
    "radial-gradient(700px 380px at 30% 60%, rgba(87,66,118,0.28), transparent 60%)," +
    "linear-gradient(135deg, rgba(7,5,12,0.98), rgba(18,12,28,0.92))";

  const summary = (args.summaryRows ?? []).length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;border-collapse:collapse">
        <tr>
          <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc">
            ${args.summaryRows
              ?.map(
                (r) => `
              <div style="display:flex;gap:10px;align-items:flex-start;margin:6px 0">
                <div style="min-width:92px;color:#64748b;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">
                  ${escapeHtml(r.label)}
                </div>
                <div style="color:#0f172a;font-size:14px;line-height:20px;font-weight:600">
                  ${escapeHtml(r.value)}
                </div>
              </div>
            `,
              )
              .join("")}
          </td>
        </tr>
      </table>
    `
    : "";

  const cta = args.cta?.href
    ? `
      <div style="margin-top:18px;text-align:left">
        <a href="${escapeHtml(args.cta.href)}"
           style="display:inline-block;background:#5c00e1;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 16px;font-weight:800;font-size:14px">
          ${escapeHtml(args.cta.label)}
        </a>
      </div>
    `
    : "";

  // Topo: manter apenas o wordmark (o ícone vai para o header do card, ao lado do título).
  const logo =
    brand.wordmarkUrl || brand.logoUrl
      ? `
        <div>
          ${
            brand.wordmarkUrl
              ? `<img src="${escapeHtml(brand.wordmarkUrl)}" alt="${escapeHtml(brand.brandName)}" height="28" style="display:block;height:28px;width:auto" />`
              : brand.logoUrl
                ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.brandName)}" height="28" style="display:block;height:28px;width:auto" />`
                : `<div style="font-weight:900;font-size:16px;letter-spacing:-.02em;color:#0f172a">${escapeHtml(brand.brandName)}</div>`
          }
        </div>
      `
      : `<div style="font-weight:900;font-size:16px;letter-spacing:-.02em;color:#0f172a">${escapeHtml(brand.brandName)}</div>`;

  // Importante: CSS inline para compatibilidade (Outlook, etc.).
  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <!-- Outlook (desktop) é inconsistente com gradients/background-image. Forçamos fundo sólido nele. -->
    <!--[if mso]>
    <style type="text/css">
      body, table, td { background-color: ${outerBgColor} !important; background-image: none !important; }
    </style>
    <![endif]-->
    <title>${escapeHtml(args.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${outerBgColor};background-image:${outerBgImage}">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>` : ""}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;padding:0;background:${outerBgColor};background-image:${outerBgImage}">
      <tr>
        <td align="center" valign="top" style="padding:28px 16px;background:${outerBgColor};background-image:${outerBgImage}">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:0 0 14px 0">
                <a href="${escapeHtml(brand.brandUrl)}" style="text-decoration:none;display:inline-block">
                  ${logo}
                </a>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">
                <div style="padding:22px 22px 18px 22px;background:radial-gradient(900px 420px at 20% 0%, rgba(92,0,225,0.18), transparent 55%), radial-gradient(720px 360px at 85% 30%, rgba(87,66,118,0.16), transparent 55%)">
                  <div style="color:#0f172a;font-size:18px;line-height:24px;font-weight:900;letter-spacing:-.02em">
                    ${escapeHtml(args.title)}
                  </div>
                </div>
                <div style="padding:18px 22px 22px 22px">
                  ${summary}
                  <div style="margin-top:${summary ? "18px" : "0"};color:#0f172a;font-size:14px;line-height:22px">
                    ${args.bodyHtml}
                  </div>
                  ${cta}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 2px 0 2px;color:rgba(255,255,255,.72);font-size:12px;line-height:18px">
                ${args.footerNote ? escapeHtml(args.footerNote) : ""}
                <div style="margin-top:10px">
                  <a href="${escapeHtml(brand.supportUrl)}" style="color:rgba(255,255,255,.86);text-decoration:underline">
                    ${escapeHtml(brand.brandUrl.replace(/^https?:\/\//, ""))}
                  </a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

