import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";

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
}) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: args.ticketId, project: { client: { tenantId: args.tenantId } } },
    select: {
      id: true,
      code: true,
      title: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      createdBy: { select: { email: true } },
      assignedTo: { select: { email: true } },
      responsibles: { select: { user: { select: { email: true } } } },
    },
  });
  if (!ticket) return;

  const to = uniqEmails([
    ticket.createdBy?.email,
    ticket.assignedTo?.email,
    ...ticket.responsibles.map((r) => r.user.email),
  ]);
  if (to.length === 0) return;

  const header = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p><b>Cliente:</b> ${ticket.project?.client?.name ?? "-"}</p>
      <p><b>Projeto:</b> ${ticket.project?.name ?? "-"}</p>
      <p><b>Chamado:</b> ${ticket.code} - ${ticket.title}</p>
      <hr />
  `;
  const footer = `</div>`;

  const html = `${header}<h3>${args.title}</h3>${args.messageHtml}${footer}`;

  await Promise.all(to.map((email) => sendMail({ to: email, subject: args.subject, html })));
}

