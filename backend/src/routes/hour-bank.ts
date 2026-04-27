import { Router } from "express";
import { Prisma } from "@prisma/client";
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

function getDailyLimitFromUserDow(user: UserForHourBank, dow: number): number {
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

function ymdUtcFromParts(year: number, month1to12: number, day: number): string {
  return new Date(Date.UTC(year, month1to12 - 1, day)).toISOString().slice(0, 10);
}

function ymdUtc(d: Date): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function computeHorasPrevistasParaMes(
  user: UserForHourBank | null,
  year: number,
  month: number,
  holidayYmdSet?: Set<string>
): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Início efetivo: máximo entre 1º do mês e dataInicioAtividades (se cair dentro do mês).
  let startDay = 1;
  if (user?.dataInicioAtividades) {
    const s = new Date(user.dataInicioAtividades);
    const sy = s.getUTCFullYear();
    const sm = s.getUTCMonth() + 1;
    if (sy > year || (sy === year && sm > month)) return 0;
    if (sy === year && sm === month) startDay = Math.max(startDay, s.getUTCDate());
  }

  // Fim efetivo: se inativado no mês, limitar até o dia da inativação.
  let endDay = daysInMonth;
  if (user?.inativadoEm) {
    const e = new Date(user.inativadoEm);
    const ey = e.getUTCFullYear();
    const em = e.getUTCMonth() + 1;
    if (ey < year || (ey === year && em < month)) return 0;
    if (ey === year && em === month) endDay = Math.min(endDay, e.getUTCDate());
  }

  if (startDay > endDay) return 0;

  let previstas = 0;
  for (let day = startDay; day <= endDay; day++) {
    const ymd = ymdUtcFromParts(year, month, day);
    const isHoliday = holidayYmdSet ? holidayYmdSet.has(ymd) : false;
    if (isHoliday) continue;
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    previstas += getDailyLimitFromUserDow(user ?? {}, dow);
  }
  return Math.round(previstas * 100) / 100;
}

/** Último dia do mês (1–12) em YYYY-MM-DD (UTC), alinhado ao agrupamento de apontamentos por ISO date. */
function ymdEndOfMonthUTC(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

/** Mês inteiro anterior à data de início das atividades (fim do mês < dia de início). */
function monthEndsBeforeDataInicio(
  year: number,
  month: number,
  dataInicioAtividades: Date | null | undefined
): boolean {
  if (!dataInicioAtividades) return false;
  const startYmd =
    dataInicioAtividades instanceof Date
      ? dataInicioAtividades.toISOString().slice(0, 10)
      : String(dataInicioAtividades).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) return false;
  return ymdEndOfMonthUTC(year, month) < startYmd;
}

hourBankRouter.get("/", async (req, res) => {
  try {
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

  const holidays = await prisma.tenantHoliday.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { date: true },
  });
  const holidayYmdSet = new Set(holidays.map((h) => ymdUtc(h.date)));

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

  // Saldo acumulado: cada mês incorpora (trabalhadas - previstas) e subtrai horas pagas naquele mês;
  // o mês seguinte parte desse saldo (efeito das horas pagas no mês anterior).
  let saldoAcumulado = 0;
  const result = [];
  for (let m = 1; m <= 12; m++) {
    const rec = recordsByMonth.get(m);
    const previstasComputed = computeHorasPrevistasParaMes(targetUser, y, m, holidayYmdSet);
    const horasPrevistas = Math.round(previstasComputed * 100) / 100;
    const horasTrabalhadas = Math.round((byMonth[m] || 0) * 100) / 100;
    const horasPagas = rec?.horasPagas != null && Number.isFinite(Number(rec.horasPagas)) ? Math.round(Number(rec.horasPagas) * 100) / 100 : 0;
    const deltaMes = Math.round((horasTrabalhadas - horasPrevistas) * 100) / 100;
    const antesDoInicio = monthEndsBeforeDataInicio(y, m, targetUser?.dataInicioAtividades);

    if (antesDoInicio) {
      if (rec) {
        result.push({
          id: rec.id,
          month: m,
          year: y,
          horasPrevistas,
          horasTrabalhadas,
          horasPagas,
          horasComplementares: 0,
          horasComplementaresMes: deltaMes,
          observacao: rec.observacao,
        });
      } else {
        result.push({
          id: null,
          month: m,
          year: y,
          horasPrevistas,
          horasTrabalhadas,
          horasPagas: 0,
          horasComplementares: 0,
          horasComplementaresMes: deltaMes,
          observacao: null,
        });
      }
      continue;
    }

    saldoAcumulado = Math.round((saldoAcumulado + deltaMes - horasPagas) * 100) / 100;

    if (rec) {
      result.push({
        id: rec.id,
        month: m,
        year: y,
        horasPrevistas,
        horasTrabalhadas,
        horasPagas,
        horasComplementares: saldoAcumulado,
        horasComplementaresMes: deltaMes,
        observacao: rec.observacao,
      });
    } else {
      result.push({
        id: null,
        month: m,
        year: y,
        horasPrevistas,
        horasTrabalhadas,
        horasPagas: 0,
        horasComplementares: saldoAcumulado,
        horasComplementaresMes: deltaMes,
        observacao: null,
      });
    }
  }
  return res.json(result);
  } catch (err) {
    console.error("[hour-bank GET]", err);
    let message = "Erro ao calcular o banco de horas.";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      message =
        "Banco de dados desatualizado: falta coluna (ex.: horasPagas em HourBankRecord). Execute prisma migrate deploy no servidor.";
    } else if (err instanceof Error && /horasPagas|does not exist|column/i.test(err.message)) {
      message =
        "Banco de dados desatualizado: execute as migrações Prisma no PostgreSQL (prisma migrate deploy).";
    }
    res.status(500).json({ error: message });
  }
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
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_PORTAL" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({
      error: "Somente Super Admin, Administrador do portal ou Gestor de Projetos pode editar a observação"
    });
    return;
  }
  const { month, year, observacao, horasTrabalhadas, horasPagas, userId } = req.body;
  if (horasPagas !== undefined && user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Somente o Super Admin pode informar ou alterar horas pagas." });
    return;
  }
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
    const holidays = await prisma.tenantHoliday.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { date: true },
    });
    const holidayYmdSet = new Set(holidays.map((h) => ymdUtc(h.date)));
    const horasPrevistas = computeHorasPrevistasParaMes(targetUserData, y, m, holidayYmdSet);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const entries = await prisma.timeEntry.findMany({
      where: { userId: targetUserId, date: { gte: start, lte: end } },
    });
    const horasTrab = entries.reduce((s, e) => s + e.totalHoras, 0);
    const hp =
      horasPagas !== undefined && horasPagas !== null && String(horasPagas).trim() !== ""
        ? Number(horasPagas)
        : 0;
    const horasPagasNum = Number.isFinite(hp) && hp >= 0 ? Math.round(hp * 100) / 100 : 0;
    const horasComplementares = horasTrab - horasPrevistas - horasPagasNum;
    record = await prisma.hourBankRecord.create({
      data: {
        userId: targetUserId,
        month: m,
        year: y,
        horasPrevistas: Math.round(horasPrevistas * 100) / 100,
        horasTrabalhadas: Math.round(horasTrab * 100) / 100,
        horasComplementares: Math.round(horasComplementares * 100) / 100,
        horasPagas: horasPagasNum > 0 ? horasPagasNum : null,
        observacao: observacao != null ? String(observacao) : null,
      },
    });
  } else {
    const updateData: { observacao?: string | null; horasPagas?: number | null } = {};
    if (observacao !== undefined) updateData.observacao = observacao != null ? String(observacao) : null;
    if (horasPagas !== undefined) {
      if (horasPagas === null || String(horasPagas).trim() === "") {
        updateData.horasPagas = null;
      } else {
        const hp = Number(horasPagas);
        if (!Number.isFinite(hp) || hp < 0) {
          res.status(400).json({ error: "Horas pagas inválidas. Informe um número ≥ 0 (em horas decimais, ex.: 1,5)." });
          return;
        }
        updateData.horasPagas = Math.round(hp * 100) / 100;
      }
    }
    if (Object.keys(updateData).length > 0) {
      record = await prisma.hourBankRecord.update({
        where: { id: record.id },
        data: updateData,
      });
    }
  }
  res.json(record);
});
