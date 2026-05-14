import type { Prisma } from "@prisma/client";
import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { projectVisibilityWhere, userCanAccessProject } from "../lib/projectVisibility.js";
import { getBrasilMonthBoundsUtc, listWeeksOverlappingBrasilMonth } from "../lib/brasilTmMonthWeeks.js";
import { parseSaoPauloWallClock } from "../lib/brasilCalendarMonthBounds.js";
import { errorSummary } from "../lib/devLog.js";

export const tmGestaoRouter = Router();
tmGestaoRouter.use(authMiddleware);

const TM_TIPOS = ["TIME_MATERIAL", "AMS"] as const;

function baseProjectWhere(user: { id: string; role: string; tenantId: string }) {
  return {
    ...projectVisibilityWhere(user),
    arquivado: false,
    tipoProjeto: { in: [...TM_TIPOS] },
  };
}

function parseWeekPlanArray(json: unknown, len: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: len }, () => null);
  if (!Array.isArray(json)) return out;
  for (let i = 0; i < len && i < json.length; i++) {
    const v = json[i];
    if (v == null || v === "") out[i] = null;
    else if (typeof v === "number" && Number.isFinite(v)) out[i] = v;
    else {
      const n = Number(v);
      out[i] = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}

async function monthExecByProject(projectIds: string[], m0: Date, m1: Date): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of projectIds) map.set(id, 0);
  if (projectIds.length === 0) return map;
  const rows = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, date: { gte: m0, lt: m1 } },
    _sum: { totalHoras: true },
  });
  for (const r of rows) {
    map.set(r.projectId, r._sum.totalHoras ?? 0);
  }
  return map;
}

async function weekExecByProject(
  projectIds: string[],
  clipStart: Date,
  clipEndExclusive: Date,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of projectIds) map.set(id, 0);
  if (projectIds.length === 0) return map;
  const rows = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, date: { gte: clipStart, lt: clipEndExclusive } },
    _sum: { totalHoras: true },
  });
  for (const r of rows) {
    map.set(r.projectId, r._sum.totalHoras ?? 0);
  }
  return map;
}

/** Lista projetos AMS / T&M visíveis ao utilizador. */
tmGestaoRouter.get("/projects", requireAnyFeature(["projeto.lista", "projeto.listaTarefas"]), async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const rows = await prisma.project.findMany({
      where: baseProjectWhere(user),
      select: { id: true, name: true, tipoProjeto: true },
      orderBy: { name: "asc" },
    });
    res.json(rows);
  } catch (err) {
    console.error("GET /api/tm-gestao/projects error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar projetos T&M." });
  }
});

tmGestaoRouter.get("/", requireAnyFeature(["projeto.lista", "projeto.listaTarefas"]), async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const nowSp = parseSaoPauloWallClock(new Date());
    const year = Math.min(2100, Math.max(2000, Number(req.query.year) || nowSp.y));
    const month = Math.min(12, Math.max(1, Number(req.query.month) || nowSp.m));
    const tab = String(req.query.tab ?? "projetos").toLowerCase() === "total" ? "total" : "projetos";
    const projectFilter = String(req.query.projectId ?? "all").trim();

    const weeks = listWeeksOverlappingBrasilMonth(year, month);
    const { start: m0, endExclusive: m1 } = getBrasilMonthBoundsUtc(year, month);

    const allProjects = await prisma.project.findMany({
      where: baseProjectWhere(user),
      select: { id: true, name: true, tipoProjeto: true },
      orderBy: { name: "asc" },
    });
    const allIds = allProjects.map((p) => p.id);

    let projectIds = allIds;
    if (tab === "projetos" && projectFilter && projectFilter.toLowerCase() !== "all") {
      if (!allIds.includes(projectFilter)) {
        res.status(404).json({ error: "Projeto não encontrado ou não é T&M/AMS." });
        return;
      }
      projectIds = [projectFilter];
    }

    const plans = await prisma.projectTmMonthPlan.findMany({
      where: { year, month, projectId: { in: tab === "total" ? allIds : projectIds } },
    });
    const planByProject = new Map(plans.map((p) => [p.projectId, p]));

    const monthExecMap = await monthExecByProject(tab === "total" ? allIds : projectIds, m0, m1);

    const weekExecMaps: Map<string, number>[] = [];
    for (const w of weeks) {
      weekExecMaps.push(await weekExecByProject(tab === "total" ? allIds : projectIds, w.clipStart, w.clipEndExclusive));
    }

    const weekMeta = weeks.map((w) => ({
      index: w.index,
      label: w.label,
      clipStart: w.clipStart.toISOString(),
      clipEndExclusive: w.clipEndExclusive.toISOString(),
    }));

    if (tab === "total") {
      let mesPlanejadoSum = 0;
      const weekPlanSum = weeks.map(() => 0);
      let mensalExecutadoSum = 0;
      const weekExecutadoSum = weeks.map((_, i) => {
        let s = 0;
        for (const id of allIds) s += weekExecMaps[i]?.get(id) ?? 0;
        return s;
      });
      for (const id of allIds) {
        mensalExecutadoSum += monthExecMap.get(id) ?? 0;
        const pl = planByProject.get(id);
        mesPlanejadoSum += pl?.mesPlanejado != null && Number.isFinite(pl.mesPlanejado) ? Number(pl.mesPlanejado) : 0;
        const wk = parseWeekPlanArray(pl?.weekPlanHoras ?? null, weeks.length);
        for (let i = 0; i < weeks.length; i++) {
          weekPlanSum[i] += wk[i] != null && Number.isFinite(wk[i] as number) ? Number(wk[i]) : 0;
        }
      }
      res.json({
        year,
        month,
        tab: "total",
        monthBounds: { start: m0.toISOString(), endExclusive: m1.toISOString() },
        weeks: weekMeta,
        totals: {
          mesPlanejadoSum,
          mensalExecutadoSum,
          weekPlanSum,
          weekExecutadoSum,
        },
      });
      return;
    }

    const projectsPayload = projectIds.map((id) => {
      const p = allProjects.find((x) => x.id === id)!;
      const pl = planByProject.get(id);
      const wk = parseWeekPlanArray(pl?.weekPlanHoras ?? null, weeks.length);
      const weekExecutado = weeks.map((_, i) => weekExecMaps[i]?.get(id) ?? 0);
      return {
        projectId: id,
        name: p.name,
        tipoProjeto: p.tipoProjeto,
        mesPlanejado: pl?.mesPlanejado ?? null,
        weekPlanHoras: wk,
        mensalExecutado: monthExecMap.get(id) ?? 0,
        weekExecutado,
      };
    });

    res.json({
      year,
      month,
      tab: "projetos",
      monthBounds: { start: m0.toISOString(), endExclusive: m1.toISOString() },
      weeks: weekMeta,
      projects: projectsPayload,
    });
  } catch (err) {
    console.error("GET /api/tm-gestao error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao carregar gestão T&M." });
  }
});

tmGestaoRouter.patch("/planning", requireFeature("projeto.editar"), async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { projectId, year, month, mesPlanejado, weekPlanHoras } = req.body ?? {};
    const pid = String(projectId ?? "").trim();
    const y = Number(year);
    const mo = Number(month);
    if (!pid || !Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
      res.status(400).json({ error: "projectId, year e month (1–12) são obrigatórios." });
      return;
    }

    const ok = await userCanAccessProject(prisma, user, pid);
    if (!ok) {
      res.status(403).json({ error: "Sem permissão para este projeto." });
      return;
    }

    const proj = await prisma.project.findFirst({
      where: { id: pid, ...baseProjectWhere(user) },
      select: { id: true },
    });
    if (!proj) {
      res.status(400).json({ error: "Projeto inválido ou não é T&M/AMS." });
      return;
    }

    const weeks = listWeeksOverlappingBrasilMonth(y, mo);
    const expectedLen = weeks.length;
    let weekArr: (number | null)[] | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "weekPlanHoras")) {
      if (!Array.isArray(weekPlanHoras)) {
        res.status(400).json({ error: "weekPlanHoras deve ser um array." });
        return;
      }
      if (weekPlanHoras.length !== expectedLen) {
        res.status(400).json({ error: `weekPlanHoras deve ter ${expectedLen} elementos (semanas do mês).` });
        return;
      }
      weekArr = weekPlanHoras.map((cell: unknown) => {
        if (cell == null || cell === "") return null;
        const n = Number(cell);
        return Number.isFinite(n) ? n : null;
      });
    }

    let mesVal: number | null | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "mesPlanejado")) {
      if (mesPlanejado == null || mesPlanejado === "") mesVal = null;
      else {
        const n = Number(mesPlanejado);
        mesVal = Number.isFinite(n) ? n : null;
      }
    }

    if (mesVal === undefined && !weekArr) {
      res.status(400).json({ error: "Envie mesPlanejado e/ou weekPlanHoras." });
      return;
    }

    const updateData: Prisma.ProjectTmMonthPlanUpdateInput = {};
    if (mesVal !== undefined) updateData.mesPlanejado = mesVal;
    if (weekArr) updateData.weekPlanHoras = weekArr as Prisma.InputJsonValue;

    await prisma.projectTmMonthPlan.upsert({
      where: { projectId_year_month: { projectId: pid, year: y, month: mo } },
      create: {
        projectId: pid,
        year: y,
        month: mo,
        mesPlanejado: mesVal !== undefined ? mesVal : null,
        weekPlanHoras: (weekArr != null ? weekArr : []) as Prisma.InputJsonValue,
      },
      update: updateData,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/tm-gestao/planning error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao guardar planeamento." });
  }
});
