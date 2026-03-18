import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const hourBankRouter = Router();
hourBankRouter.use(authMiddleware);
hourBankRouter.use(requireFeature("hora-banco"));

type UserForHourBank = {
  limiteHorasDiarias?: number | null;
  limiteHorasPorDia?: string | null;
  dataInicioAtividades?: Date | null;
  inativadoEm?: Date | null;
};

function getDailyLimitFromUser(user: UserForHourBank, dateValue: Date): number {
  const dow = dateValue.getDay();
  const fallback =
    typeof user.limiteHorasDiarias === "number" && !Number.isNaN(user.limiteHorasDiarias)
      ? user.limiteHorasDiarias
      : 8;
  const raw = user.limiteHorasPorDia;
  // Se não existir mapa por dia, consideramos o padrão do sistema:
  // fim de semana (dom/sáb) = 0, demais dias = fallback.
  if (!raw) return dow === 0 || dow === 6 ? 0 : fallback;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    const key = keys[dow] as string;
    const v = map[key];
    // Se o dia estiver definido como 0, deve valer 0 (ex.: fim de semana).
    // Se não estiver definido, mantém o padrão: fim de semana 0, senão fallback.
    if (typeof v === "number" && v >= 0) return v;
    return dow === 0 || dow === 6 ? 0 : fallback;
  } catch {
    return dow === 0 || dow === 6 ? 0 : fallback;
  }
}

function computeHorasPrevistasParaMes(
  user: UserForHourBank | null,
  year: number,
  month: number
): number {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  let d = new Date(startOfMonth);
  if (user?.dataInicioAtividades && user.dataInicioAtividades > d) {
    d = new Date(user.dataInicioAtividades);
    d.setHours(0, 0, 0, 0);
  }

  // Se o usuário foi inativado, não calcular horas previstas após a data de inativação.
  // (mesma lógica da dataInicioAtividades, só que ao contrário)
  let effectiveEnd = new Date(endOfMonth);
  if (user?.inativadoEm) {
    const inat = new Date(user.inativadoEm);
    inat.setHours(23, 59, 59, 999);
    if (inat < effectiveEnd) effectiveEnd = inat;
  }

  if (d > effectiveEnd) return 0;

  let previstas = 0;
  while (d <= effectiveEnd) {
    previstas += getDailyLimitFromUser(user ?? {}, d);
    d.setDate(d.getDate() + 1);
  }
  return Math.round(previstas * 100) / 100;
}

hourBankRouter.get("/", async (req, res) => {
  const user = req.user;
  const { userId, year } = req.query;
  let targetUserId = user.id;
  if ((user.role === "ADMIN" || user.role === "GESTOR_PROJETOS") && userId) {
    const targetUser = await prisma.user.findFirst({
      where: { id: String(userId), tenantId: user.tenantId },
    });
    if (!targetUser) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    targetUserId = targetUser.id;
  }
  const y = year ? parseInt(String(year), 10) : new Date().getFullYear();

  const records = await prisma.hourBankRecord.findMany({
    where: { userId: targetUserId, year: y },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      limiteHorasDiarias: true,
      limiteHorasPorDia: true,
      dataInicioAtividades: true,
      inativadoEm: true,
    },
  });

  const start = new Date(y, 0, 1);
  const end = new Date(y, 11, 31, 23, 59, 59);
  const entries = await prisma.timeEntry.findMany({
    where: { userId: targetUserId, date: { gte: start, lte: end } },
  });
  const byMonth: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = 0;
  for (const e of entries) {
    const m = new Date(e.date).getMonth() + 1;
    byMonth[m] = (byMonth[m] || 0) + e.totalHoras;
  }

  const recordsByMonth = new Map(records.map((r) => [r.month, r]));

  const result = [];
  for (let m = 1; m <= 12; m++) {
    const rec = recordsByMonth.get(m);
    const previstasComputed = computeHorasPrevistasParaMes(targetUser, y, m);
    const horasPrevistas = Math.round(previstasComputed * 100) / 100;
    const horasTrabalhadas = Math.round((byMonth[m] || 0) * 100) / 100;
    const horasComplementares = Math.round((horasTrabalhadas - horasPrevistas) * 100) / 100;

    if (rec) {
      result.push({
        id: rec.id,
        month: m,
        year: y,
        horasPrevistas,
        horasTrabalhadas,
        horasComplementares,
        observacao: rec.observacao,
      });
    } else {
      result.push({
        id: null,
        month: m,
        year: y,
        horasPrevistas,
        horasTrabalhadas,
        horasComplementares,
        observacao: null,
      });
    }
  }
  return res.json(result);
});

hourBankRouter.patch("/", async (req, res) => {
  const user = req.user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Somente Admin ou Gestor de Projetos pode editar a observação" });
    return;
  }
  const { month, year, observacao, horasTrabalhadas, userId } = req.body;
  if (horasTrabalhadas !== undefined) {
    res.status(400).json({
      error: "Horas trabalhadas não pode ser ajustado manualmente. Esse valor é calculado pelos apontamentos.",
    });
    return;
  }
  let targetUserId = user.id;
  if ((user.role === "ADMIN" || user.role === "GESTOR_PROJETOS") && userId) {
    const targetUser = await prisma.user.findFirst({
      where: { id: String(userId), tenantId: user.tenantId },
    });
    if (!targetUser) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    targetUserId = targetUser.id;
  }
  const m = parseInt(String(month), 10);
  const y = parseInt(String(year), 10);
  if (!m || m < 1 || m > 12 || !y) {
    res.status(400).json({ error: "Mês e ano são obrigatórios" });
    return;
  }

  let record = await prisma.hourBankRecord.findUnique({
    where: {
      userId_month_year: { userId: targetUserId, month: m, year: y },
    },
  });

  if (!record) {
    const targetUserData = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        limiteHorasDiarias: true,
        limiteHorasPorDia: true,
        dataInicioAtividades: true,
        inativadoEm: true,
      },
    });
    const horasPrevistas = computeHorasPrevistasParaMes(targetUserData, y, m);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const entries = await prisma.timeEntry.findMany({
      where: { userId: targetUserId, date: { gte: start, lte: end } },
    });
    const horasTrab = entries.reduce((s, e) => s + e.totalHoras, 0);
    const horasComplementares = horasTrab - horasPrevistas;
    record = await prisma.hourBankRecord.create({
      data: {
        userId: targetUserId,
        month: m,
        year: y,
        horasPrevistas: Math.round(horasPrevistas * 100) / 100,
        horasTrabalhadas: Math.round(horasTrab * 100) / 100,
        horasComplementares: Math.round(horasComplementares * 100) / 100,
        observacao: observacao != null ? String(observacao) : null,
      },
    });
  } else {
    const updateData: { observacao?: string | null } = {};
    if (observacao !== undefined) updateData.observacao = observacao != null ? String(observacao) : null;
    if (Object.keys(updateData).length > 0) {
      record = await prisma.hourBankRecord.update({
        where: { id: record.id },
        data: updateData,
      });
    }
  }
  res.json(record);
});
