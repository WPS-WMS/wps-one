import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";

export const hourBankRouter = Router();
hourBankRouter.use(authMiddleware);

function getWorkingDays(year: number, month: number): number {
  let count = 0;
  const d = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  while (d <= last) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
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

  const carga = user.cargaHorariaSemanal ?? 40;
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { cargaHorariaSemanal: true },
  });
  const cargaTarget = targetUser?.cargaHorariaSemanal ?? carga;

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
    if (rec) {
      result.push({
        id: rec.id,
        month: m,
        year: y,
        horasPrevistas: rec.horasPrevistas,
        horasTrabalhadas: rec.horasTrabalhadas,
        horasComplementares: rec.horasComplementares ?? rec.horasTrabalhadas - rec.horasPrevistas,
        observacao: rec.observacao,
      });
    } else {
      const diasUteis = getWorkingDays(y, m);
      const previstas = (cargaTarget / 5) * diasUteis;
      result.push({
        id: null,
        month: m,
        year: y,
        horasPrevistas: Math.round(previstas * 100) / 100,
        horasTrabalhadas: Math.round(byMonth[m] * 100) / 100,
        horasComplementares: Math.round((byMonth[m] - previstas) * 100) / 100,
        observacao: null,
      });
    }
  }
  return res.json(result);
});

hourBankRouter.patch("/", async (req, res) => {
  const user = req.user;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Somente o perfil Admin pode editar a observação" });
    return;
  }
  const { month, year, observacao, horasTrabalhadas, userId } = req.body;
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

  function parseHoras(val: unknown): number | null {
    if (val == null) return null;
    const s = String(val).trim().replace(",", ".");
    if (!s) return null;
    const match = s.match(/^(\d+):(\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      return h + m / 60;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }

  const horasTrabalhadasNum = parseHoras(horasTrabalhadas);

  if (!record) {
    const carga = user.cargaHorariaSemanal ?? 40;
    const targetUserData = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { cargaHorariaSemanal: true },
    });
    const cargaTarget = targetUserData?.cargaHorariaSemanal ?? carga;
    const diasUteis = getWorkingDays(y, m);
    const horasPrevistas = (cargaTarget / 5) * diasUteis;
    let horasTrab = horasTrabalhadasNum;
    if (horasTrab == null) {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);
      const entries = await prisma.timeEntry.findMany({
        where: { userId: targetUserId, date: { gte: start, lte: end } },
      });
      horasTrab = entries.reduce((s, e) => s + e.totalHoras, 0);
    }
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
    const updateData: { observacao?: string | null; horasTrabalhadas?: number; horasComplementares?: number } = {};
    if (observacao !== undefined) updateData.observacao = observacao != null ? String(observacao) : null;
    if (horasTrabalhadasNum != null) {
      updateData.horasTrabalhadas = Math.round(horasTrabalhadasNum * 100) / 100;
      updateData.horasComplementares = Math.round((updateData.horasTrabalhadas - record.horasPrevistas) * 100) / 100;
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
