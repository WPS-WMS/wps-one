import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketAppBaseUrl } from "./emailTemplate.js";
import { errorSummary } from "./devLog.js";
import { formatCentsToBrl } from "./financialEntryHelpers.js";
import { computeAgingSummary } from "./receivableService.js";

/**
 * Envia alerta de inadimplência para o contato financeiro do cliente (quando configurado).
 * Também notifica usuários FINANCEIRO ativos do tenant.
 */
export async function sendReceivableOverdueAlerts(tenantId: string): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const aging = await computeAgingSummary(tenantId);
    const overdueItems = aging.items.filter((i) => i.bucket === "VENCIDOS");
    if (overdueItems.length === 0) return { sent: 0 };

    const financeUsers = await prisma.user.findMany({
      where: { tenantId, role: "FINANCEIRO", ativo: true, email: { not: "" } },
      select: { email: true },
    });
    const internalEmails = financeUsers.map((u) => u.email).filter(Boolean) as string[];

    const byClient = new Map<string, typeof overdueItems>();
    for (const item of overdueItems) {
      const receivable = await prisma.receivable.findFirst({
        where: { id: item.receivableId, tenantId },
        select: {
          client: {
            select: {
              name: true,
              financial: { select: { contatoFinEmail: true } },
            },
          },
        },
      });
      const clientEmail = receivable?.client.financial?.contatoFinEmail?.trim();
      const key = clientEmail ?? `internal-${item.clientName}`;
      const list = byClient.get(key) ?? [];
      list.push(item);
      byClient.set(key, list);
    }

    const base = resolveTicketAppBaseUrl().replace(/\/$/, "");
    const href = `${base}/admin/financeiro/contas-receber`;

    for (const [key, items] of byClient) {
      const isClient = !key.startsWith("internal-");
      const to = isClient ? [key] : internalEmails;
      if (to.length === 0) continue;

      const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
      const clientName = items[0]?.clientName ?? "Cliente";
      const subject = isClient
        ? `Lembrete: títulos em aberto — ${clientName}`
        : `Alerta de inadimplência — ${items.length} parcela(s) atrasada(s)`;

      const lines = items
        .slice(0, 15)
        .map(
          (i) =>
            `<li>${i.description} — venc. ${i.dueDate} — ${formatCentsToBrl(i.amountCents)} (${i.daysOverdue} dia(s) de atraso)</li>`,
        )
        .join("");

      const html = renderEmailLayout({
        subject,
        title: isClient ? "Títulos em aberto" : "Dashboard de atraso",
        preheader: `${clientName} — ${formatCentsToBrl(totalCents)}`,
        bodyHtml: `<p>${
          isClient
            ? `Identificamos ${items.length} parcela(s) em aberto no valor total de ${formatCentsToBrl(totalCents)}.`
            : `Resumo de inadimplência: ${items.length} parcela(s), total ${formatCentsToBrl(totalCents)}.`
        }</p><ul style="padding-left:1.2em">${lines}</ul>`,
        cta: { label: "Ver contas a receber", href },
        footerNote: "Alerta automático de inadimplência — WPS One Financeiro.",
      });

      await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
      sent++;
    }
  } catch (error) {
    console.error("[MAIL] receivable overdue alerts", errorSummary(error));
  }
  return { sent };
}
