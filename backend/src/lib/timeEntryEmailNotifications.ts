import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import { renderEmailLayout } from "./emailTemplate.js";
import { isTenantEmailTriggerEnabled } from "./emailNotificationRules.js";
import { getDailyLimitFromUser } from "./timeEntryLimits.js";

function uniqEmails(list: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      list
        .map((e) => String(e ?? "").trim().toLowerCase())
        .filter((e) => e && e.includes("@")),
    ),
  );
}

const TRIGGER = "LIMITE_DIARIO_EXCEDIDO" as const;
// Notificação de aprovação pendente não depende de regra configurável.
// A solicitação do produto é notificar sempre responsáveis do projeto + SUPER_ADMIN.

/**
 * Notifica gestores de projetos quando o total de horas apontadas no dia pelo usuário
 * ultrapassa o limite diário (cadastro), na transição de “dentro do limite” para “acima”.
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
      },
    });
    if (!project) return;

    const allowed = await isTenantEmailTriggerEnabled(
      args.tenantId,
      project.tipoProjeto as string | null | undefined,
      TRIGGER,
    );
    if (!allowed) return;

    const gestores = await prisma.user.findMany({
      where: { tenantId: args.tenantId, role: "GESTOR_PROJETOS", ativo: true },
      select: { email: true },
    });
    const to = uniqEmails(gestores.map((g) => g.email));
    if (to.length === 0) {
      console.warn("[MAIL] Nenhum e-mail de Gestor de Projetos para limite diário de apontamento.");
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
      bodyHtml: `<p>O total de horas apontadas neste dia para este colaborador ultrapassou o limite diário configurado no cadastro dele (incluindo o mapa por dia da semana, quando existir).</p>`,
      footerNote:
        "Este e-mail foi enviado automaticamente conforme Configurações → E-mails. Se você não deve receber esta mensagem, peça ao Super Admin para ajustar as regras do tenant.",
    });

    const results = await Promise.allSettled(
      to.map((email) => sendMail({ to: email, subject, html })),
    );
    const rejected = results.filter((r) => r.status === "rejected").length;
    if (rejected > 0) {
      console.warn(`[MAIL] Falha ao enviar ${rejected}/${results.length} e-mails (limite diário).`);
    }
  } catch (err) {
    console.error("[MAIL] notifyGestoresIfApontamentoExcedeuLimiteDiario falhou:", err);
  }
}

/**
 * Notifica responsáveis do projeto + SUPER_ADMIN quando há uma solicitação PENDING
 * na tela de permissões (apontamento exige aprovação).
 *
 * Regra: só envia para responsáveis que são membros do projeto (ProjectResponsible).
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
        responsibles: { select: { user: { select: { id: true, email: true, ativo: true } } } },
      },
    });
    if (!project) return;

    const apontador = await prisma.user.findFirst({
      where: { id: args.apontadorUserId, tenantId: args.tenantId },
      select: { id: true, name: true },
    });
    if (!apontador) return;

    const responsaveisEmails = uniqEmails(
      (project.responsibles ?? [])
        .map((r) => r.user)
        .filter((u) => u?.ativo)
        .map((u) => u.email),
    );

    const superAdmins = await prisma.user.findMany({
      where: { tenantId: args.tenantId, role: "SUPER_ADMIN", ativo: true },
      select: { email: true },
    });
    const superAdminEmails = uniqEmails(superAdmins.map((u) => u.email));

    const to = uniqEmails([...responsaveisEmails, ...superAdminEmails]);
    if (to.length === 0) {
      console.warn("[MAIL] Nenhum destinatário para aprovação pendente (responsáveis + SUPER_ADMIN).");
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
    console.error("[MAIL] notifyResponsaveisEAdminsDeAprovacaoPendente falhou:", err);
  }
}
