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
  if ((user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || user.role === "ADMIN_PORTAL") && userId) {
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

  // Intervalo anual em UTC para não "pular" dias/mês por diferença de timezone.
  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
  const entries = await prisma.timeEntry.findMany({
    where: { userId: targetUserId, date: { gte: start, lte: end } },
  });
  const byMonth: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = 0;
  for (const e of entries) {
    // Evita divergência por timezone:
    // - Apontamentos agrupam por YMD (slice "YYYY-MM-DD") na UI.
    // - Aqui, também derivamos o mês a partir da string YMD em vez de getMonth() (timezone local).
    // Prisma retorna `Date` para DateTime.
    // A UI agrupa apontamentos por `YYYY-MM-DD` usando `slice(0,10)` sobre ISO.
    // Então aqui também extraímos YMD via `toISOString()` para não depender do `toString()` local.
    const datePart =
      e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10);
    if (!datePart) continue;
    const m = parseInt(datePart.slice(5, 7), 10);
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
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

// Debug: lista TimeEntry efetivamente usados no cálculo do banco de horas.
// Útil para verificar divergências (ex.: "apontamentos do mês sumiram, mas banco ainda mostra horas").
hourBankRouter.get("/debug-time-entries", async (req, res) => {
  const user = req.user;
  const { userId, year, month } = req.query;

  if (!year || !month) {
    res.status(400).json({ error: "Informe `year` e `month` (ex.: year=2026&month=3)." });
    return;
  }

  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (!y || m < 1 || m > 12) {
    res.status(400).json({ error: "Parâmetros inválidos: use year inteiro e month entre 1 e 12." });
    return;
  }

  let targetUserId = user.id;
  if ((user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || user.role === "ADMIN_PORTAL") && userId) {
    const targetUser = await prisma.user.findFirst({
      where: { id: String(userId), tenantId: user.tenantId },
    });
    if (!targetUser) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    targetUserId = targetUser.id;
  }

  // Intervalo do mês em UTC para não divergenciar por timezone.
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const entries = await prisma.timeEntry.findMany({
    where: { userId: targetUserId, date: { gte: start, lte: end } },
    orderBy: [{ date: "desc" }, { horaInicio: "asc" }],
    include: {
      project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      ticket: { select: { id: true, code: true, title: true } },
      activity: { select: { id: true, name: true } },
    },
  });

  const totalHoras = Math.round(entries.reduce((s, e) => s + e.totalHoras, 0) * 100) / 100;

  res.json({
    userId: targetUserId,
    year: y,
    month: m,
    count: entries.length,
    totalHoras,
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10),
      horaInicio: e.horaInicio,
      horaFim: e.horaFim,
      totalHoras: e.totalHoras,
      project: e.project
        ? { id: e.project.id, name: e.project.name, client: e.project.client ? { id: e.project.client.id, name: e.project.client.name } : null }
        : null,
      ticket: e.ticket ? { id: e.ticket.id, code: e.ticket.code, title: e.ticket.title } : null,
      activity: e.activity ? { id: e.activity.id, name: e.activity.name } : null,
    })),
  });
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
  if ((user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS" || user.role === "ADMIN_PORTAL") && userId) {
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
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
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
