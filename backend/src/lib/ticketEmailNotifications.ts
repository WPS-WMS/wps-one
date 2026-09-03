import { prisma } from "./prisma.js";
import { errorSummary } from "./devLog.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketOpenHref } from "./emailTemplate.js";
import {
  getTenantEmailRecipientRoles,
  normalizeProjectTypeForEmail,
  type EmailTrigger,
} from "./emailNotificationRules.js";
import {
  loadProjectEmailsForRecipientRoles,
  uniqEmails,
} from "./projectEmailRecipients.js";
import { clientUserSeesProjectWhere } from "./projectVisibility.js";

export async function notifyTicketMembers(args: {
  tenantId: string;
  ticketId: string;
  subject: string;
  title: string;
  messageHtml: string;
  /** Gatilho para respeitar Configurações → E-mails */
  trigger: EmailTrigger;
  /** Não enviar para este usuário (opcional). */
  excludeUserId?: string;
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
        assignedToId: true,
        assignedTo: { select: { id: true, email: true, ativo: true } },
        project: {
          select: {
            id: true,
            name: true,
            tipoProjeto: true,
            clientId: true,
            client: { select: { name: true } },
            responsibles: {
              select: { user: { select: { id: true, email: true, ativo: true } } },
            },
            members: {
              select: { user: { select: { id: true, email: true, ativo: true, role: true } } },
            },
          },
        },
        budget: {
          select: {
            sentById: true,
            sentBy: { select: { id: true, email: true, ativo: true } },
          },
        },
        responsibles: {
          select: { user: { select: { id: true, email: true, ativo: true } } },
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

    const rawTipo = ticket.project?.tipoProjeto ?? null;
    const normalizedTipo = normalizeProjectTypeForEmail(rawTipo);
    const recipientRoles = await getTenantEmailRecipientRoles(
      args.tenantId,
      rawTipo,
      args.trigger,
    );
    if (recipientRoles.length === 0) {
      console.warn("[MAIL] notifyTicketMembers: gatilho desativado nas regras do tenant", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        projectTipoRaw: rawTipo,
        projectTipoNormalized: normalizedTipo,
        trigger: args.trigger,
        hint:
          "Confira se o projeto está com o mesmo tipo da coluna marcada em Configurações → E-mails (ex.: TIME_MATERIAL) e se a matriz foi salva.",
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

    const { emails: roleEmails, stats: rosterStats } = await loadProjectEmailsForRecipientRoles(prisma, {
      tenantId: args.tenantId,
      projectId,
      ticketId: ticket.id,
      recipientRoles,
      // Em resposta de orçamento o cliente costuma estar marcado na regra — não excluir.
      excludeUserId: args.trigger === "RESPOSTA_ORCAMENTO" ? undefined : args.excludeUserId,
    });

    const extras: string[] = [];
    const pushUserEmail = (user: { id?: string | null; email?: string | null; ativo?: boolean | null } | null | undefined) => {
      if (!user) return;
      if (args.excludeUserId && user.id === args.excludeUserId && args.trigger !== "RESPOSTA_ORCAMENTO") return;
      if (user.ativo === false) return;
      const email = String(user.email ?? "").trim().toLowerCase();
      if (email.includes("@")) extras.push(email);
    };

    // Reforço: vínculos diretos do projeto/tarefa (evita falha se o quadro filtrado vier vazio).
    if (recipientRoles.includes("RESPONSAVEL")) {
      for (const row of ticket.project?.responsibles ?? []) pushUserEmail(row.user);
      for (const row of ticket.responsibles ?? []) pushUserEmail(row.user);
      pushUserEmail(ticket.assignedTo);
    }
    if (recipientRoles.includes("MEMBRO")) {
      for (const row of ticket.project?.members ?? []) {
        if (String(row.user?.role ?? "").toUpperCase() === "CLIENTE") continue;
        pushUserEmail(row.user);
      }
      for (const row of ticket.responsibles ?? []) pushUserEmail(row.user);
      pushUserEmail(ticket.assignedTo);
    }
    if (recipientRoles.includes("CLIENTE") && ticket.project?.clientId) {
      const clientUsers = await prisma.clientUser.findMany({
        where: { clientId: ticket.project.clientId, ...clientUserSeesProjectWhere(projectId) },
        select: { user: { select: { id: true, email: true, ativo: true, role: true } } },
      });
      for (const row of clientUsers) {
        if (String(row.user?.role ?? "").toUpperCase() !== "CLIENTE") continue;
        pushUserEmail(row.user);
      }
    }
    if (args.trigger === "RESPOSTA_ORCAMENTO") {
      pushUserEmail(ticket.budget?.sentBy);
      pushUserEmail(ticket.assignedTo);
    }

    const to = uniqEmails([...roleEmails, ...extras]);

    if (rosterStats.clienteMissingEmail > 0) {
      console.warn("[MAIL] notifyTicketMembers: cliente(s) no quadro sem e-mail válido", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        trigger: args.trigger,
        projectId,
        rosterUserCount: rosterStats.userCount,
        clienteInRoster: rosterStats.clienteCount,
        clienteViaClientAccess: rosterStats.clienteViaClientAccessCount,
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
        projectTipoRaw: rawTipo,
        projectTipoNormalized: normalizedTipo,
        recipientRoles,
        rosterUserCount: rosterStats.userCount,
        clienteInRoster: rosterStats.clienteCount,
        clienteViaClientAccess: rosterStats.clienteViaClientAccessCount,
        assignedToId: ticket.assignedToId,
        budgetSentById: ticket.budget?.sentById ?? null,
        projectResponsibleCount: ticket.project?.responsibles?.length ?? 0,
        projectMemberCount: ticket.project?.members?.length ?? 0,
      });
      return;
    }

    console.info("[MAIL] notifyTicketMembers: enviando", {
      ticketCode: ticket.code,
      trigger: args.trigger,
      projectTipoNormalized: normalizedTipo,
      recipientRoles,
      recipientCount: to.length,
    });

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
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails. Se você não reconhece esta solicitação, ignore esta mensagem.",
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
    if (rejected > 0 || skipped > 0 || sent === 0) {
      console.warn(`[MAIL] Envio tarefa ${ticket.code}: ok=${sent} falha=${rejected} ignorado=${skipped}/${results.length}.`);
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (first?.reason) {
        console.warn("[MAIL] Primeiro erro de envio (amostra):", errorSummary(first.reason));
      }
      if (skipped > 0 && sent === 0) {
        console.warn(
          "[MAIL] Nenhum e-mail foi enviado de fato: provedor Graph/SMTP parece incompleto ou indisponível neste ambiente.",
        );
      }
    } else {
      console.info(`[MAIL] Envio tarefa ${ticket.code}: ok=${sent}/${results.length}.`);
    }
  } catch (err) {
    console.error("[MAIL] notifyTicketMembers falhou:", errorSummary(err));
  }
}
