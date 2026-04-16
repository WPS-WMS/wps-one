import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout } from "./emailTemplate.js";
import { isTenantEmailTriggerEnabled, type EmailTrigger } from "./emailNotificationRules.js";

function uniqEmails(list: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      list
        .map((e) => String(e ?? "").trim().toLowerCase())
        .filter((e) => e && e.includes("@")),
    ),
  );
}

export async function notifyTicketMembers(args: {
  tenantId: string;
  ticketId: string;
  subject: string;
  title: string;
  messageHtml: string;
  /** Gatilho para respeitar Configurações → E-mails */
  trigger: EmailTrigger;
  includeProjectResponsibles?: boolean;
  /**
   * Abertura de chamado pelo cliente: ainda não há consultor na tarefa.
   * Notifica só o criador (confirmação) e os membros do projeto (ProjectResponsible).
   */
  openingByClient?: boolean;
}) {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: args.ticketId, project: { client: { tenantId: args.tenantId } } },
      select: {
        id: true,
        code: true,
        title: true,
        project: {
          select: {
            name: true,
            tipoProjeto: true,
            client: { select: { name: true } },
            responsibles: { select: { user: { select: { email: true } } } },
          },
        },
        createdBy: { select: { email: true } },
        assignedTo: { select: { email: true } },
        responsibles: { select: { user: { select: { email: true } } } },
      },
    });
    if (!ticket) {
      console.warn("[MAIL] notifyTicketMembers: ticket não encontrado", {
        tenantId: args.tenantId,
        ticketId: args.ticketId,
        trigger: args.trigger,
      });
      return;
    }

    const allowed = await isTenantEmailTriggerEnabled(
      args.tenantId,
      ticket.project?.tipoProjeto as string | null | undefined,
      args.trigger,
    );
    if (!allowed) {
      console.warn("[MAIL] notifyTicketMembers: gatilho desativado nas regras do tenant", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        projectTipo: ticket.project?.tipoProjeto ?? null,
        trigger: args.trigger,
      });
      return;
    }

    const projectResponsiblesEmails =
      ticket.project?.responsibles?.map((r) => r.user.email) ?? [];

    const to = args.openingByClient
      ? uniqEmails([ticket.createdBy?.email, ...projectResponsiblesEmails])
      : uniqEmails([
          ticket.createdBy?.email,
          ticket.assignedTo?.email,
          ...ticket.responsibles.map((r) => r.user.email),
          ...(args.includeProjectResponsibles ? projectResponsiblesEmails : []),
        ]);
    if (to.length === 0) {
      console.warn(`[MAIL] Nenhum destinatário com e-mail válido no chamado ${ticket.code}.`);
      console.warn("[MAIL] notifyTicketMembers: detalhes destinatários", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        trigger: args.trigger,
        openingByClient: Boolean(args.openingByClient),
        includeProjectResponsibles: Boolean(args.includeProjectResponsibles),
        createdBy: ticket.createdBy?.email ?? null,
        assignedTo: ticket.assignedTo?.email ?? null,
        responsibles: ticket.responsibles.map((r) => r.user.email),
        projectResponsibles: projectResponsiblesEmails,
      });
      return;
    }

    // Link opcional para o chamado (se o frontend estiver configurado).
    // Ex.: APP_URL=https://app.wpsone.com.br
    const appUrl = String(process.env.APP_URL || "").trim().replace(/\/$/, "");
    const ticketUrl = appUrl ? `${appUrl}/admin/chamados/${encodeURIComponent(ticket.id)}` : "";

    const html = renderEmailLayout({
      subject: args.subject,
      title: args.title,
      preheader: `Chamado ${ticket.code} • ${ticket.project?.name ?? "-"}`,
      summaryRows: [
        { label: "Cliente", value: ticket.project?.client?.name ?? "-" },
        { label: "Projeto", value: ticket.project?.name ?? "-" },
        { label: "Chamado", value: `${ticket.code} - ${ticket.title}` },
      ],
      bodyHtml: args.messageHtml,
      cta: ticketUrl ? { label: "Abrir chamado", href: ticketUrl } : undefined,
      footerNote:
        "Este e-mail foi enviado automaticamente para os membros do chamado. Se você não reconhece esta solicitação, ignore esta mensagem.",
    });

    const results = await Promise.allSettled(
      to.map((email) => sendMail({ to: email, subject: args.subject, html })),
    );
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails do chamado ${ticket.code}.`);
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (first?.reason) {
        const e = first.reason as any;
        console.warn("[MAIL] Primeiro erro de envio (amostra):", {
          code: e?.code,
          responseCode: e?.responseCode,
          command: e?.command,
          message: e?.message,
          response: e?.response,
        });
      }
    }
  } catch (err) {
    console.error("[MAIL] notifyTicketMembers falhou:", err);
  }
}

