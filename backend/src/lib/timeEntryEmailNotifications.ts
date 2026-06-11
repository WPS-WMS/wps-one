import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketOpenHref } from "./emailTemplate.js";
import {
  getTenantEmailRecipientRoles,
  normalizeProjectTypeForEmail,
} from "./emailNotificationRules.js";
import { computeDailyLimitViolation } from "./apontamentoViolacao.js";
import { getDailyLimitFromUser, sumTimeEntryMinutesForUserOnStoredUtcDay } from "./timeEntryLimits.js";
import { errorSummary } from "./devLog.js";
import {
  loadProjectEmailsForRecipientRoles,
} from "./projectEmailRecipients.js";

const TRIGGER_LIMITE_DIARIO = "LIMITE_DIARIO_EXCEDIDO" as const;

function formatEntryDatePtBr(entryDate: Date): string {
  const isoYmd =
    entryDate instanceof Date ? entryDate.toISOString().slice(0, 10) : String(entryDate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(isoYmd)
    ? new Date(`${isoYmd}T12:00:00`).toLocaleDateString("pt-BR")
    : entryDate.toLocaleDateString("pt-BR");
}

/**
 * Notifica destinatários configurados em Configurações → E-mails (Limite diário de apontamento).
 * Usa a matriz (Resp./Memb./Cliente); envia um único e-mail por destinatário.
 * - Limite acabou de ser ultrapassado → template de limite diário excedido
 * - Demais solicitações de permissão → template de aprovação pendente
 */
export async function notifyPermissionRequestEmail(args: {
  tenantId: string;
  projectId: string;
  requestId: string;
  apontadorUserId: string;
  entryDate: Date;
  totalHorasRequest: number;
  replacesTimeEntryId: string | null;
  description?: string | null;
}): Promise<void> {
  try {
    const apontador = await prisma.user.findFirst({
      where: { id: args.apontadorUserId, tenantId: args.tenantId },
      select: { id: true, name: true, limiteHorasDiarias: true, limiteHorasPorDia: true },
    });
    if (!apontador) return;

    const dayTotalMinutes = await sumTimeEntryMinutesForUserOnStoredUtcDay(
      args.apontadorUserId,
      args.entryDate,
      args.replacesTimeEntryId ? { excludeEntryId: args.replacesTimeEntryId } : undefined,
    );
    const dailyLimit = getDailyLimitFromUser(apontador, args.entryDate);
    const entryTotalMinutes = Math.round(args.totalHorasRequest * 60);
    const limitMinutes = Math.round(dailyLimit * 60);
    const { willExceedByDay } = computeDailyLimitViolation({
      dailyLimitHours: dailyLimit,
      dayTotalMinutes,
      entryTotalMinutes,
    });
    const limitJustExceeded = willExceedByDay && dayTotalMinutes <= limitMinutes;
    const totalHorasNoDiaAgora = (dayTotalMinutes + entryTotalMinutes) / 60;

    const project = await prisma.project.findFirst({
      where: { id: args.projectId, client: { tenantId: args.tenantId } },
      select: {
        name: true,
        tipoProjeto: true,
        client: { select: { name: true } },
      },
    });
    if (!project) return;

    const tipoRaw = project.tipoProjeto as string | null | undefined;
    const recipientRoles = await getTenantEmailRecipientRoles(args.tenantId, tipoRaw, TRIGGER_LIMITE_DIARIO);
    if (recipientRoles.length === 0) {
      console.warn("[MAIL] Solicitação de permissão: gatilho desativado ou regra ausente no tenant.", {
        tenantId: args.tenantId,
        projectId: args.projectId,
        tipoProjeto: tipoRaw ?? null,
        tipoNormalizado: normalizeProjectTypeForEmail(tipoRaw),
        trigger: TRIGGER_LIMITE_DIARIO,
      });
      return;
    }

    const { emails: to } = await loadProjectEmailsForRecipientRoles(prisma, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      recipientRoles,
    });
    if (to.length === 0) {
      console.warn("[MAIL] Solicitação de permissão: sem destinatários para os papéis configurados.", {
        tenantId: args.tenantId,
        projectId: args.projectId,
        tipoProjeto: tipoRaw ?? null,
        recipientRoles,
      });
      return;
    }

    const dataFmt = formatEntryDatePtBr(args.entryDate);

    if (limitJustExceeded) {
      const horasAgora = String(totalHorasNoDiaAgora).replace(".", ",");
      const limiteStr = String(dailyLimit).replace(".", ",");
      const subject = "Limite diário de apontamento excedido";
      const title = "Horas do dia acima do limite configurado";
      const html = renderEmailLayout({
        subject,
        title,
        preheader: `${apontador.name} • ${dataFmt}`,
        summaryRows: [
          { label: "Colaborador", value: apontador.name },
          { label: "Data", value: dataFmt },
          { label: "Total apontado no dia", value: `${horasAgora} h` },
          { label: "Limite diário (cadastro)", value: `${limiteStr} h` },
          { label: "Cliente", value: project.client?.name ?? "—" },
          { label: "Projeto", value: project.name ?? "—" },
        ],
        bodyHtml: `<p>Foi enviada uma <strong>solicitação de aprovação</strong> de apontamento cujo total de horas no dia ultrapassa o limite diário configurado no cadastro do colaborador (incluindo o mapa por dia da semana, quando existir).</p><p>Acesse a tela de <strong>Permissões</strong> para analisar o pedido.</p>`,
        footerNote:
          "Este e-mail foi enviado automaticamente conforme Configurações → E-mails (Limite diário de apontamento).",
      });
      const results = await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
      const rejected = results.filter((r) => r.status === "rejected").length;
      if (rejected > 0) {
        console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails (limite diário).`);
      }
      return;
    }

    const horas = String(args.totalHorasRequest ?? 0).replace(".", ",");
    const subject = "Aprovação pendente de apontamento";
    const title = "Há uma aprovação pendente na tela de permissões";
    const html = renderEmailLayout({
      subject,
      title,
      preheader: `${project.name} • ${dataFmt}`,
      summaryRows: [
        { label: "Colaborador", value: apontador.name },
        { label: "Data", value: dataFmt },
        { label: "Horas", value: `${horas} h` },
        { label: "Cliente", value: project.client?.name ?? "—" },
        { label: "Projeto", value: project.name ?? "—" },
        { label: "Solicitação", value: args.requestId },
      ],
      bodyHtml: `<p>Existe uma solicitação de permissão <strong>pendente</strong> para apontamento de horas. Acesse a tela de <strong>Permissões</strong> para aprovar ou reprovar.</p>${
        args.description ? `<p><strong>Descrição:</strong> ${String(args.description).replace(/</g, "&lt;")}</p>` : ""
      }`,
      footerNote:
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails (Limite diário de apontamento).",
    });
    const results = await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails (aprovação pendente).`);
    }
  } catch (err) {
    console.error("[MAIL] notifyPermissionRequestEmail falhou:", errorSummary(err));
  }
}

const TRIGGER_APONTAMENTO = "APONTAMENTO" as const;

/**
 * Quando habilitado em Configurações → E-mails (gatilho Apontamentos + tipo de projeto),
 * notifica o responsável principal do projeto (primeiro vínculo ativo em `ProjectResponsible`)
 * sobre novo apontamento em tarefa. Não envia se o apontador for o único destinatário.
 */
export async function notifyProjectResponsibleOfApontamento(args: {
  tenantId: string;
  projectId: string;
  ticketId: string | null | undefined;
  apontadorUserId: string;
  entryDate: Date;
  totalHoras: number;
  description?: string | null;
}): Promise<void> {
  if (!args.ticketId) return;
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: args.ticketId, projectId: args.projectId, project: { client: { tenantId: args.tenantId } } },
      select: {
        id: true,
        type: true,
        code: true,
        title: true,
        project: {
          select: {
            name: true,
            tipoProjeto: true,
            client: { select: { name: true } },
            responsibles: { select: { id: true, user: { select: { id: true, email: true, ativo: true } } } },
          },
        },
      },
    });
    if (!ticket) return;
    if (String(ticket.type ?? "").trim() === "SUBPROJETO") return;

    const recipientRoles = await getTenantEmailRecipientRoles(
      args.tenantId,
      ticket.project.tipoProjeto as string | null | undefined,
      TRIGGER_APONTAMENTO,
    );
    if (recipientRoles.length === 0) return;

    const apontador = await prisma.user.findFirst({
      where: { id: args.apontadorUserId, tenantId: args.tenantId },
      select: { id: true, name: true },
    });
    if (!apontador) return;

    const { emails: to } = await loadProjectEmailsForRecipientRoles(prisma, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      ticketId: args.ticketId,
      recipientRoles,
      excludeUserId: args.apontadorUserId,
    });
    if (to.length === 0) {
      console.warn("[MAIL] Apontamento: sem destinatários (ativos, com e-mail) para os papéis configurados.");
      return;
    }

    const isoYmd =
      args.entryDate instanceof Date ? args.entryDate.toISOString().slice(0, 10) : String(args.entryDate).slice(0, 10);
    const dataFmt =
      /^\d{4}-\d{2}-\d{2}$/.test(isoYmd)
        ? new Date(`${isoYmd}T12:00:00`).toLocaleDateString("pt-BR")
        : args.entryDate.toLocaleDateString("pt-BR");

    const horas = String(args.totalHoras ?? 0).replace(".", ",");
    const subject = "Novo apontamento de horas em tarefa";
    const title = "Horas registradas em uma tarefa do seu projeto";

    const html = renderEmailLayout({
      subject,
      title,
      preheader: `${ticket.code} • ${dataFmt}`,
      summaryRows: [
        { label: "Colaborador", value: apontador.name },
        { label: "Data", value: dataFmt },
        { label: "Horas", value: `${horas} h` },
        { label: "Cliente", value: ticket.project.client?.name ?? "—" },
        { label: "Projeto", value: ticket.project.name ?? "—" },
        { label: "Tarefa", value: `${ticket.code} — ${ticket.title}` },
      ],
      bodyHtml: `<p>Foi registrado um apontamento de horas nesta tarefa. Abra a tarefa no portal para ver detalhes.</p>${
        args.description
          ? `<p><strong>Descrição:</strong> ${String(args.description).replace(/</g, "&lt;")}</p>`
          : ""
      }`,
      cta: { label: "Abrir tarefa", href: resolveTicketOpenHref(ticket.id) },
      footerNote:
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails (gatilho Apontamentos). Se você não deve receber esta mensagem, peça ao Super Admin para ajustar as regras do tenant.",
    });

    try {
      await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
    } catch {
      console.warn("[MAIL] Falha ao enviar e-mail de apontamento para destinatários do projeto.");
    }
  } catch (err) {
    console.error("[MAIL] notifyProjectResponsibleOfApontamento falhou:", errorSummary(err));
  }
}
