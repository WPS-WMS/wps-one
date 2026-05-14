import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketAppBaseUrl } from "./emailTemplate.js";
import { isTenantEmailTriggerEnabled } from "./emailNotificationRules.js";
import { errorSummary } from "./devLog.js";

export const TRIGGER_REEMBOLSOS = "REEMBOLSOS" as const;

function reembolsosAppHrefForRole(role: string | null | undefined): string {
  const base = resolveTicketAppBaseUrl().replace(/\/$/, "");
  const r = String(role ?? "").trim();
  if (r === "SUPER_ADMIN" || r === "GESTOR_PROJETOS") return `${base}/gestor/reembolsos`;
  if (r === "CONSULTOR" || r === "ADMIN_PORTAL") return `${base}/consultor/reembolsos`;
  return `${base}/consultor/reembolsos`;
}

/**
 * Quando habilitado em Configurações → E-mails (gatilho Reembolsos + tipo de projeto),
 * notifica o responsável principal do projeto (primeiro vínculo ativo em `ProjectResponsible`)
 * sobre nova solicitação de reembolso. Não envia se o solicitante for o único destinatário.
 */
export async function notifyProjectResponsibleOfReembolso(args: {
  tenantId: string;
  projectId: string;
  solicitanteUserId: string;
  amountCents: number;
  tipoNome: string;
  descricaoPreview: string;
}): Promise<void> {
  try {
    const project = await prisma.project.findFirst({
      where: { id: args.projectId, client: { tenantId: args.tenantId } },
      select: {
        name: true,
        tipoProjeto: true,
        client: { select: { name: true } },
        responsibles: { select: { id: true, user: { select: { id: true, email: true, ativo: true, role: true } } } },
      },
    });
    if (!project) return;

    const allowed = await isTenantEmailTriggerEnabled(
      args.tenantId,
      project.tipoProjeto as string | null | undefined,
      TRIGGER_REEMBOLSOS,
    );
    if (!allowed) return;

    const solicitante = await prisma.user.findFirst({
      where: { id: args.solicitanteUserId, tenantId: args.tenantId },
      select: { id: true, name: true },
    });
    if (!solicitante) return;

    const rows = project.responsibles ?? [];
    const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    let toEmail: string | null = null;
    let toRole: string | null = null;
    for (const r of sorted) {
      if (r.user.ativo === false) continue;
      if (r.user.id === args.solicitanteUserId) continue;
      const raw = String(r.user?.email ?? "").trim();
      if (raw.includes("@")) {
        toEmail = raw;
        toRole = r.user.role ?? null;
        break;
      }
    }
    if (!toEmail) {
      console.warn("[MAIL] Reembolso: sem responsável do projeto (ativo, com e-mail) distinto do solicitante.");
      return;
    }

    const valor = (args.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const subject = "Nova solicitação de reembolso";
    const title = "Reembolso solicitado no seu projeto";
    const desc = String(args.descricaoPreview ?? "").trim();
    const descShort = desc.length > 400 ? `${desc.slice(0, 400)}…` : desc;

    const html = renderEmailLayout({
      subject,
      title,
      preheader: `${project.client?.name ?? ""} • ${project.name ?? ""}`,
      summaryRows: [
        { label: "Colaborador", value: solicitante.name },
        { label: "Cliente", value: project.client?.name ?? "—" },
        { label: "Projeto", value: project.name ?? "—" },
        { label: "Tipo de despesa", value: args.tipoNome },
        { label: "Valor", value: valor },
      ],
      bodyHtml: `<p><strong>O colaborador registrou uma nova solicitação de reembolso.</strong></p>${
        descShort ? `<p><strong>Descrição (resumo):</strong> ${descShort.replace(/</g, "&lt;")}</p>` : ""
      }`,
      cta: { label: "Abrir reembolsos", href: reembolsosAppHrefForRole(toRole) },
      footerNote:
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails (gatilho Reembolsos). Se você não deve receber esta mensagem, peça ao Super Admin para ajustar as regras do tenant.",
    });

    try {
      await sendMail({ to: toEmail, subject, html });
    } catch {
      console.warn("[MAIL] Falha ao enviar e-mail de reembolso para responsável do projeto.");
    }
  } catch (err) {
    console.error("[MAIL] notifyProjectResponsibleOfReembolso falhou:", errorSummary(err));
  }
}
