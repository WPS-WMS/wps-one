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
