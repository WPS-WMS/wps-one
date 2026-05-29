import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout, resolveTicketOpenHref } from "./emailTemplate.js";
import {
  getTenantEmailRecipientRoles,
  normalizeProjectTypeForEmail,
} from "./emailNotificationRules.js";
import { getDailyLimitFromUser } from "./timeEntryLimits.js";
import { errorSummary } from "./devLog.js";
import {
  loadProjectEmailsForRecipientRoles,
  uniqEmails,
} from "./projectEmailRecipients.js";

const TRIGGER = "LIMITE_DIARIO_EXCEDIDO" as const;

/**
 * Quando habilitado em Configurações → E-mails (Limite diário + tipo de projeto),
 * notifica o responsável do projeto ao enviar solicitação de aprovação cujo total
 * projetado no dia ultrapassa o limite diário do colaborador.
 */
export async function notifyGestoresIfApontamentoExcedeuLimiteDiario(args: {
  tenantId: string;
  projectId: string;
  /** Usuário que lançou as horas (o limite aplicável é o dele). */
  apontadorUserId: string;
  entryDate: Date;
  totalHorasNoDiaAgora: number;
  totalHorasNoDiaAntes: number;
}): Promise<void> {
  try {
    const { totalHorasNoDiaAgora, totalHorasNoDiaAntes } = args;
    if (totalHorasNoDiaAgora <= totalHorasNoDiaAntes) return;

    const apontador = await prisma.user.findFirst({
      where: { id: args.apontadorUserId, tenantId: args.tenantId },
      select: { id: true, name: true, limiteHorasDiarias: true, limiteHorasPorDia: true },
    });
    if (!apontador) return;

    const dailyLimit = getDailyLimitFromUser(apontador, args.entryDate);
    if (totalHorasNoDiaAgora <= dailyLimit) return;
    if (totalHorasNoDiaAntes > dailyLimit) return;

    const project = await prisma.project.findFirst({
      where: { id: args.projectId, client: { tenantId: args.tenantId } },
      select: {
        name: true,
        tipoProjeto: true,
        client: { select: { name: true } },
        responsibles: { select: { id: true, user: { select: { id: true, email: true, ativo: true } } } },
      },
    });
    if (!project) return;

    const tipoRaw = project.tipoProjeto as string | null | undefined;
    const recipientRoles = await getTenantEmailRecipientRoles(args.tenantId, tipoRaw, TRIGGER);
    if (recipientRoles.length === 0) {
      console.warn("[MAIL] Limite diário: gatilho desativado ou regra ausente no tenant.", {
        tenantId: args.tenantId,
        projectId: args.projectId,
        tipoProjeto: tipoRaw ?? null,
        tipoNormalizado: normalizeProjectTypeForEmail(tipoRaw),
        trigger: TRIGGER,
      });
      return;
    }

    const { emails: to } = await loadProjectEmailsForRecipientRoles(prisma, {
      tenantId: args.tenantId,
      projectId: args.projectId,
      recipientRoles,
    });
    if (to.length === 0) {
      console.warn("[MAIL] Limite diário: sem destinatários com e-mail para os papéis configurados.", {
        tenantId: args.tenantId,
        projectId: args.projectId,
        tipoProjeto: tipoRaw ?? null,
        recipientRoles,
      });
      return;
    }

    const isoYmd =
      args.entryDate instanceof Date
        ? args.entryDate.toISOString().slice(0, 10)
        : String(args.entryDate).slice(0, 10);
    const dataFmt =
      /^\d{4}-\d{2}-\d{2}$/.test(isoYmd)
        ? new Date(`${isoYmd}T12:00:00`).toLocaleDateString("pt-BR")
        : args.entryDate.toLocaleDateString("pt-BR");

    const subject = "Limite diário de apontamento excedido";
    const title = "Horas do dia acima do limite configurado";
    const horasAgora = String(totalHorasNoDiaAgora).replace(".", ",");
    const limiteStr = String(dailyLimit).replace(".", ",");

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
        "Este e-mail foi enviado automaticamente ao responsável do projeto, conforme Configurações → E-mails (Limite diário de apontamento).",
    });

    const results = await Promise.allSettled(
      to.map((email) => sendMail({ to: email, subject, html })),
    );
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(
        `[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails (limite diário → responsável do projeto).`,
      );
    }
  } catch (err) {
    console.error("[MAIL] notifyGestoresIfApontamentoExcedeuLimiteDiario falhou:", errorSummary(err));
  }
}

/**
 * Notifica responsáveis do projeto + SUPER_ADMIN quando há uma solicitação PENDING
 * na tela de permissões (apontamento exige aprovação).
 *
 * Regra: envia apenas para o Responsável do projeto (único) e somente se ele tiver perfil de Gestor de Projetos.
 */
export async function notifyResponsaveisEAdminsDeAprovacaoPendente(args: {
  tenantId: string;
  projectId: string;
  requestId: string;
  apontadorUserId: string;
  entryDate: Date;
  totalHoras: number;
  description?: string | null;
}): Promise<void> {
  try {
    const project = await prisma.project.findFirst({
      where: { id: args.projectId, client: { tenantId: args.tenantId } },
      select: {
        id: true,
        name: true,
        tipoProjeto: true,
        client: { select: { name: true } },
        responsibles: { select: { user: { select: { id: true, email: true, ativo: true, role: true } } } },
      },
    });
    if (!project) return;

    const apontador = await prisma.user.findFirst({
      where: { id: args.apontadorUserId, tenantId: args.tenantId },
      select: { id: true, name: true },
    });
    if (!apontador) return;

    const responsible = Array.isArray(project.responsibles) ? project.responsibles[0]?.user : null;
    const to = uniqEmails([
      responsible && responsible.ativo && String(responsible.role ?? "") === "GESTOR_PROJETOS" ? responsible.email : null,
    ]);
    if (to.length === 0) {
      console.warn("[MAIL] Nenhum destinatário para aprovação pendente (responsável do projeto não é GESTOR_PROJETOS ou sem e-mail).");
      return;
    }

    const isoYmd =
      args.entryDate instanceof Date ? args.entryDate.toISOString().slice(0, 10) : String(args.entryDate).slice(0, 10);
    const dataFmt =
      /^\d{4}-\d{2}-\d{2}$/.test(isoYmd)
        ? new Date(`${isoYmd}T12:00:00`).toLocaleDateString("pt-BR")
        : args.entryDate.toLocaleDateString("pt-BR");

    const subject = "Aprovação pendente de apontamento";
    const title = "Há uma aprovação pendente na tela de permissões";
    const horas = String(args.totalHoras ?? 0).replace(".", ",");

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
        "Este e-mail foi enviado automaticamente. Se você não deve receber esta mensagem, peça ao Super Admin para ajustar as regras do tenant.",
    });

    const results = await Promise.allSettled(to.map((email) => sendMail({ to: email, subject, html })));
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails (aprovação pendente).`);
    }
  } catch (err) {
    console.error("[MAIL] notifyResponsaveisEAdminsDeAprovacaoPendente falhou:", errorSummary(err));
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
