import { prisma } from "./prisma.js";
import { errorSummary } from "./devLog.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketOpenHref } from "./emailTemplate.js";
import { isTenantEmailTriggerEnabled, type EmailTrigger } from "./emailNotificationRules.js";
import { loadProjectNotificationEmails } from "./projectEmailRecipients.js";

export async function notifyTicketMembers(args: {
  tenantId: string;
  ticketId: string;
  subject: string;
  title: string;
  messageHtml: string;
  /** Gatilho para respeitar Configurações → E-mails */
  trigger: EmailTrigger;
}) {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: args.ticketId, project: { client: { tenantId: args.tenantId } } },
      select: {
        id: true,
        type: true,
        code: true,
        title: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            tipoProjeto: true,
            client: { select: { name: true } },
          },
        },
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

    if (String(ticket.type ?? "").trim() === "SUBPROJETO") {
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

    const projectId = ticket.project?.id ?? ticket.projectId;
    if (!projectId) {
      console.warn("[MAIL] notifyTicketMembers: projeto sem id", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
      });
      return;
    }

    const { emails: to, stats: rosterStats } = await loadProjectNotificationEmails(prisma, {
      tenantId: args.tenantId,
      projectId,
    });

    if (rosterStats.clienteCount > 0 || rosterStats.clienteMissingEmail > 0) {
      console.warn("[MAIL] notifyTicketMembers: quadro do projeto (CLIENTE)", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        trigger: args.trigger,
        projectId,
        rosterUserCount: rosterStats.userCount,
        clienteInRoster: rosterStats.clienteCount,
        clienteSemEmail: rosterStats.clienteMissingEmail,
        recipientCount: to.length,
      });
    }

    if (to.length === 0) {
      console.warn(`[MAIL] Nenhum destinatário com e-mail válido na tarefa ${ticket.code}.`);
      console.warn("[MAIL] notifyTicketMembers: sem destinatários (resumo)", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        trigger: args.trigger,
        projectId,
        rosterUserCount: rosterStats.userCount,
        clienteInRoster: rosterStats.clienteCount,
      });
      return;
    }

    const ticketHref = resolveTicketOpenHref(ticket.id);

    const html = renderEmailLayout({
      subject: args.subject,
      title: args.title,
      preheader: `Tarefa ${ticket.code} • ${ticket.project?.name ?? "-"}`,
      summaryRows: [
        { label: "Cliente", value: ticket.project?.client?.name ?? "-" },
        { label: "Projeto", value: ticket.project?.name ?? "-" },
        { label: "Tarefa", value: `${ticket.code} - ${ticket.title}` },
      ],
      bodyHtml: args.messageHtml,
      cta: { label: "Abrir Tarefa", href: ticketHref },
      footerNote:
        "Este e-mail foi enviado automaticamente aos responsáveis e membros do projeto. Se você não reconhece esta solicitação, ignore esta mensagem.",
    });

    const results = await Promise.allSettled(
      to.map((email) => sendMail({ to: email, subject: args.subject, html })),
    );
    let sent = 0;
    let skipped = 0;
    let rejected = 0;
    for (const r of results) {
      if (r.status === "rejected") {
        rejected++;
        continue;
      }
      const v = r.value as { ok?: boolean; skipped?: boolean } | undefined;
      if (v?.skipped) skipped++;
      else sent++;
    }
    if (rejected > 0 || skipped > 0) {
      console.warn(`[MAIL] Envio tarefa ${ticket.code}: ok=${sent} falha=${rejected} ignorado=${skipped}/${results.length}.`);
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (first?.reason) {
        console.warn("[MAIL] Primeiro erro de envio (amostra):", errorSummary(first.reason));
      }
    }
  } catch (err) {
    console.error("[MAIL] notifyTicketMembers falhou:", errorSummary(err));
  }
}
