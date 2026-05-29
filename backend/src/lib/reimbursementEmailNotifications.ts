import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketAppBaseUrl } from "./emailTemplate.js";
import { getTenantEmailRecipientRoles } from "./emailNotificationRules.js";
import { errorSummary } from "./devLog.js";
import { loadProjectEmailsForRecipientRoles } from "./projectEmailRecipients.js";

export const TRIGGER_REEMBOLSOS = "REEMBOLSOS" as const;

/** Relatórios → Reembolsos (o destinatário vê mensagem de permissão se a feature estiver desligada no perfil). */
function relatoriosReembolsosHrefForRole(role: string | null | undefined): string {
  const base = resolveTicketAppBaseUrl().replace(/\/$/, "");
  const r = String(role ?? "").trim();
  if (r === "SUPER_ADMIN") return `${base}/admin/relatorios/reembolsos`;
  if (r === "GESTOR_PROJETOS") return `${base}/gestor/relatorios/reembolsos`;
  if (r === "CONSULTOR" || r === "ADMIN_PORTAL") return `${base}/consultor/relatorios/reembolsos`;
  return `${base}/consultor/relatorios/reembolsos`;
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
        responsibles: {
          select: { id: true, user: { select: { id: true, email: true, ativo: true, role: true } } },
        },
      },
    });
    if (!project) return;

    const recipientRoles = await getTenantEmailRecipientRoles(
      args.tenantId,
      project.tipoProjeto as string | null | undefined,
      TRIGGER_REEMBOLSOS,
    );
    if (recipientRoles.length === 0) return;

    const solicitante = await prisma.user.findFirst({
      where: { id: args.solicitanteUserId, tenantId: args.tenantId },
      select: { id: true, name: true },
    });
    if (!solicitante) return;

    const { emails: to } = await loadProjectEmailsForRecipientRoles(prisma, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      recipientRoles,
      excludeUserId: args.solicitanteUserId,
    });
    if (to.length === 0) {
      console.warn("[MAIL] Reembolso: sem destinatários (ativos, com e-mail) para os papéis configurados.");
      return;
    }

    const firstRecipient = await prisma.user.findFirst({
      where: { tenantId: args.tenantId, email: { equals: to[0], mode: "insensitive" } },
      select: { role: true },
    });
    const toRole = firstRecipient?.role ?? null;

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
      cta: { label: "Abrir relatório de reembolsos", href: relatoriosReembolsosHrefForRole(toRole) },
      footerNote:
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails (gatilho Reembolsos). Se você não deve receber esta mensagem, peça ao Super Admin para ajustar as regras do tenant.",
    });

    try {
      await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
    } catch {
      console.warn("[MAIL] Falha ao enviar e-mail de reembolso para destinatários do projeto.");
    }
  } catch (err) {
    console.error("[MAIL] notifyProjectResponsibleOfReembolso falhou:", errorSummary(err));
  }
}
