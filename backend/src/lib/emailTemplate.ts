type EmailCta = {
  label: string;
  href: string;
};

function pickEnv(keys: readonly string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

export function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeUrl(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\/$/, "");
}

export function getBrandConfig(): {
  brandName: string;
  brandUrl: string;
  logoUrl: string;
  wordmarkUrl: string;
  iconUrl: string;
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
  // Defaults: tentar pegar os mesmos assets da landing (URLs públicas).
  // Obs.: Alguns provedores/clientes podem bloquear SVG; nesse caso, use PNG via envs acima.
  const wordmarkUrl = wordmarkUrlRaw || `${brandUrl}/WPS%20One.svg`;
  const iconUrl = iconUrlRaw || `${brandUrl}/WPS%20One%20%C3%ADcone.svg`;
  const supportUrl = normalizeUrl(pickEnv(["EMAIL_SUPPORT_URL", "SUPPORT_URL"])) || brandUrl;
  return { brandName, brandUrl, logoUrl, wordmarkUrl, iconUrl, supportUrl };
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

  const logo = brand.wordmarkUrl || brand.iconUrl || brand.logoUrl
    ? `
      <div style="display:flex;align-items:center;gap:10px">
        ${
          brand.iconUrl
            ? `<img src="${escapeHtml(brand.iconUrl)}" alt="${escapeHtml(brand.brandName)}" height="30" style="display:block;height:30px;width:30px" />`
            : ""
        }
        ${
          brand.wordmarkUrl
            ? `<img src="${escapeHtml(brand.wordmarkUrl)}" alt="${escapeHtml(brand.brandName)}" height="26" style="display:block;height:26px;width:auto" />`
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
    <title>${escapeHtml(args.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1020">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>` : ""}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;padding:0">
      <tr>
        <td align="center" style="padding:28px 16px">
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

