import { prisma } from "./prisma.js";
import { errorSummary } from "./devLog.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketOpenHref } from "./emailTemplate.js";
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

type ResponsibleRow = {
  id: string;
  user: { email: string | null | undefined; ativo?: boolean | null };
};

/** Responsável principal do projeto (primeiro vínculo ativo em `ProjectResponsible`, por id). */
function primaryProjectResponsibleEmail(rows: ResponsibleRow[] | null | undefined): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sorted) {
    if (r.user.ativo === false) continue;
    const raw = String(r.user?.email ?? "").trim();
    if (raw.includes("@")) return raw;
  }
  return null;
}

/** Usuários do portal com perfil CLIENTE vinculados à empresa do projeto. */
function clientPortalUserEmails(
  client:
    | {
        users?: Array<{
          user: { email: string | null | undefined; ativo?: boolean | null; role?: string | null };
        }>;
      }
    | null
    | undefined,
): string[] {
  const out: string[] = [];
  for (const row of client?.users ?? []) {
    const u = row.user;
    if (u.ativo === false) continue;
    if (String(u.role ?? "").toUpperCase() !== "CLIENTE") continue;
    const raw = String(u.email ?? "").trim();
    if (raw.includes("@")) out.push(raw);
  }
  return out;
}

/** Membros da tarefa: criador, executante e responsáveis explícitos da tarefa. */
function taskMemberEmails(ticket: {
  createdBy?: { email: string | null | undefined } | null;
  assignedTo?: { email: string | null | undefined } | null;
  responsibles: Array<{ user: { email: string | null | undefined } }>;
}): string[] {
  return [
    ticket.createdBy?.email,
    ticket.assignedTo?.email,
    ...ticket.responsibles.map((r) => r.user.email),
  ];
}

function recipientsForTrigger(
  trigger: EmailTrigger,
  ticket: {
    createdBy?: { email: string | null | undefined } | null;
    assignedTo?: { email: string | null | undefined } | null;
    responsibles: Array<{ user: { email: string | null | undefined } }>;
    project?: {
      responsibles?: ResponsibleRow[];
      client?: {
        users?: Array<{
          user: { email: string | null | undefined; ativo?: boolean | null; role?: string | null };
        }>;
      };
    } | null;
  },
): string[] {
  const projectResponsibleEmail = primaryProjectResponsibleEmail(ticket.project?.responsibles);
  const clientEmails = clientPortalUserEmails(ticket.project?.client);

  if (trigger === "CRIACAO") {
    return uniqEmails([...clientEmails, projectResponsibleEmail]);
  }

  return uniqEmails([
    ...clientEmails,
    projectResponsibleEmail,
    ...taskMemberEmails(ticket),
  ]);
}

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
        project: {
          select: {
            name: true,
            tipoProjeto: true,
            client: {
              select: {
                name: true,
                users: {
                  select: {
                    user: { select: { email: true, ativo: true, role: true } },
                  },
                },
              },
            },
            responsibles: { select: { id: true, user: { select: { email: true, ativo: true } } } },
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

    // Tópicos (SUBPROJETO) não disparam e-mail de chamado; só tarefas/chamados reais.
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

    const to = recipientsForTrigger(args.trigger, ticket);

    if (to.length === 0) {
      console.warn(`[MAIL] Nenhum destinatário com e-mail válido na tarefa ${ticket.code}.`);
      console.warn("[MAIL] notifyTicketMembers: sem destinatários (resumo)", {
        tenantId: args.tenantId,
        ticketId: ticket.id,
        ticketCode: ticket.code,
        trigger: args.trigger,
        clientUsersWithEmailCount: clientPortalUserEmails(ticket.project?.client).length,
        createdByHasEmail: Boolean(ticket.createdBy?.email),
        assignedToHasEmail: Boolean(ticket.assignedTo?.email),
        responsiblesWithEmailCount: ticket.responsibles.filter((r) => String(r.user.email ?? "").includes("@")).length,
        projectResponsibleHasEmail: Boolean(primaryProjectResponsibleEmail(ticket.project?.responsibles)),
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
        args.trigger === "CRIACAO"
          ? "Este e-mail foi enviado automaticamente ao cliente e ao responsável do projeto. Se você não reconhece esta solicitação, ignore esta mensagem."
          : "Este e-mail foi enviado automaticamente ao cliente, ao responsável do projeto e aos membros da tarefa. Se você não reconhece esta solicitação, ignore esta mensagem.",
    });

    const results = await Promise.allSettled(
      to.map((email) => sendMail({ to: email, subject: args.subject, html })),
    );
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails da tarefa ${ticket.code}.`);
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (first?.reason) {
        console.warn("[MAIL] Primeiro erro de envio (amostra):", errorSummary(first.reason));
      }
    }
  } catch (err) {
    console.error("[MAIL] notifyTicketMembers falhou:", errorSummary(err));
  }
}
