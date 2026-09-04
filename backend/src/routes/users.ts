import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { normalizeApontamentoViolacaoModo } from "../lib/apontamentoViolacao.js";
import { authMiddleware, verifyPassword, hashPassword } from "../lib/auth.js";
import { requireFeature, requireAnyFeature } from "../lib/authorizeFeature.js";
import { detachUserFromProjectsAndTickets } from "../lib/userDeactivation.js";
import type { Prisma } from "@prisma/client";
import { getAllowedFeaturesForUser } from "../lib/permissions.js";
import { hasAllUsersTasksListView } from "../lib/projectVisibility.js";
import { devLog, errorSummary } from "../lib/devLog.js";
import type { RoleId } from "../lib/permissions.js";
import { HOUR_BANK_EXCLUDED_ROLES, isKnownRole, roleRequiresTimeEntryConfig } from "../lib/roles.js";
import {
  parseEffectiveFromDate,
  recordHourlyRateChange,
} from "../lib/userHourlyRateHistory.js";
import {
  USER_FIELD_LABELS,
  buildUserHistoryEntries,
} from "../lib/userHistoryHelpers.js";

function parseOptionalHourlyRate(raw: unknown): number | null | "invalid" | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else {
    const cleaned = String(raw).trim();
    const normalized = cleaned.includes(",")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned;
    n = Number(normalized);
  }
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.round(n * 100) / 100;
}

const EMPLOYMENT_TYPES = ["PJ", "CLT", "COOPERADO", "SOCIEDADE"] as const;

/**
 * Aceita o nome de um tipo de contrato cadastrado (Financeiro > Tipos de contrato).
 * Mantém compatibilidade com os valores legados PJ/CLT/COOPERADO/SOCIEDADE.
 */
async function parseOptionalEmploymentType(
  tenantId: string,
  raw: unknown,
): Promise<string | null | "invalid" | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const value = String(raw).trim();
  if (!value) return null;

  const fromCatalog = await prisma.contractType.findFirst({
    where: { tenantId, name: { equals: value, mode: "insensitive" } },
    select: { name: true },
  });
  if (fromCatalog) return fromCatalog.name;

  const legacy = value.toUpperCase();
  if ((EMPLOYMENT_TYPES as readonly string[]).includes(legacy)) return legacy;

  return "invalid";
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeOptionalPhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits || null;
}

function parseSeeAllProjects(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

function parseVisibleProjectIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

async function replaceClientUserAccess(params: {
  userId: string;
  tenantId: string;
  clientIds: string[];
  seeAllProjects: boolean;
  visibleProjectIds: string[];
}) {
  const validClients = await prisma.client.findMany({
    where: { id: { in: params.clientIds }, tenantId: params.tenantId },
    select: { id: true },
  });
  const clientIds = validClients.map((c) => c.id);
  const validProjectIds = params.seeAllProjects
    ? []
    : (
        await prisma.project.findMany({
          where: {
            id: { in: params.visibleProjectIds },
            clientId: { in: clientIds },
            client: { tenantId: params.tenantId },
          },
          select: { id: true, clientId: true },
        })
      );

  await prisma.$transaction(async (tx) => {
    await tx.clientUserVisibleProject.deleteMany({
      where: { clientUser: { userId: params.userId } },
    });
    await tx.clientUser.deleteMany({ where: { userId: params.userId } });
    for (const clientId of clientIds) {
      const created = await tx.clientUser.create({
        data: {
          userId: params.userId,
          clientId,
          seeAllProjects: params.seeAllProjects,
        },
        select: { id: true },
      });
      if (params.seeAllProjects) continue;
      const projectIds = validProjectIds
        .filter((p) => p.clientId === clientId)
        .map((p) => p.id);
      if (projectIds.length === 0) continue;
      await tx.clientUserVisibleProject.createMany({
        data: projectIds.map((projectId) => ({
          clientUserId: created.id,
          projectId,
        })),
      });
    }
  });
}

export const usersRouter = Router();
usersRouter.use(authMiddleware);

usersRouter.get(
  "/for-select",
  requireAnyFeature([
    "projeto",
    "projeto.listaTarefas",
    "tarefa.verTodos",
    "relatorios.horas",
    "hora-banco",
    "relatorios",
    "financeiro.contasPagar",
    "financeiro.fornecedores",
    "relatorios.gestaoHoras.gerarContasPagar",
    "configuracoes.permissoes",
  ]),
  async (req, res) => {
  const authUser = req.user;
  // membros (tarefas/projetos): só ativos por padrão; relatórios/banco: todos por padrão.
  const scope = String(req.query.scope ?? "membros").trim().toLowerCase();
  const statusDefault =
    scope === "relatorios" || scope === "lista-tarefas" || scope === "banco-horas" ? "todos" : "ativos";
  const status = String(req.query.status ?? statusDefault).trim().toLowerCase();
  const ativoFilter: Prisma.UserWhereInput =
    status === "inativos"
      ? { ativo: false }
      : status === "todos"
        ? {}
        : { ativo: true };

  if (scope === "lista-tarefas") {
    const listUser = { id: authUser.id, role: authUser.role, tenantId: authUser.tenantId };
    const canViewAll = await hasAllUsersTasksListView(listUser);
    if (!canViewAll) {
      const self = await prisma.user.findFirst({
        where: { id: authUser.id, tenantId: authUser.tenantId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          updatedAt: true,
          ativo: true,
          linkedSupplier: { select: { id: true } },
          supplierUserLinks: { select: { supplierId: true } },
        },
      });
      const linkedIds = [
        ...new Set(
          [
            ...(self?.supplierUserLinks ?? []).map((l) => l.supplierId),
            self?.linkedSupplier?.id,
          ].filter((id): id is string => Boolean(id)),
        ),
      ];
      res.json(
        self
          ? [
              {
                ...self,
                linkedSupplierId: linkedIds[0] ?? null,
                linkedSupplierIds: linkedIds,
                linkedSupplier: undefined,
                supplierUserLinks: undefined,
              },
            ]
          : [],
      );
      return;
    }
  }

  const roleFilter: Prisma.UserWhereInput =
    scope === "banco-horas"
      ? { role: { notIn: [...HOUR_BANK_EXCLUDED_ROLES] } }
      : { role: { not: "CLIENTE" } };

  const users = await prisma.user.findMany({
    where: { tenantId: authUser.tenantId, ...roleFilter, ...ativoFilter },
    // Inclui role para permitir filtros no frontend (ex.: esconder SUPER_ADMIN na lista de membros da Lista de Tarefas).
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      updatedAt: true,
      ativo: true,
      hourlyRate: true,
      linkedSupplier: { select: { id: true } },
      supplierUserLinks: { select: { supplierId: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(
    users.map(({ linkedSupplier, supplierUserLinks, ...u }) => {
      const linkedSupplierIds = [
        ...new Set(
          [
            ...supplierUserLinks.map((l) => l.supplierId),
            linkedSupplier?.id,
          ].filter((id): id is string => Boolean(id)),
        ),
      ];
      return {
        ...u,
        linkedSupplierId: linkedSupplierIds[0] ?? null,
        linkedSupplierIds,
      };
    }),
  );
  },
);

usersRouter.get(
  "/for-project-select",
  requireAnyFeature(["projeto.novo", "projeto.editar"]),
  async (req, res) => {
  const authUser = req.user;
  const users = await prisma.user.findMany({
    where: { tenantId: authUser.tenantId, ativo: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      updatedAt: true,
      clientAccess: { select: { clientId: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl,
      updatedAt: u.updatedAt,
      clientIds: u.clientAccess?.map((c) => c.clientId) ?? [],
    })),
  );
  },
);

// Atualizar dados do próprio usuário (ex.: nome)
usersRouter.patch("/me", async (req, res) => {
  const authUser = req.user;
  const { name, avatarUrl } = req.body ?? {};
  if (name !== undefined && (!name || !String(name).trim())) {
    res.status(400).json({ error: "Nome é obrigatório" });
    return;
  }
  if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== "string") {
    res.status(400).json({ error: "avatarUrl inválido" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(avatarUrl !== undefined && { avatarUrl: avatarUrl ? String(avatarUrl) : null }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      updatedAt: true,
      tenantId: true,
      cargo: true,
      cargaHorariaSemanal: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      violacaoApontamentoModo: true,
      diasPermitidos: true,
      mustChangePassword: true,
    },
  });
  const role = updated.role as RoleId;
  const allowedFeatures = await getAllowedFeaturesForUser({ tenantId: updated.tenantId, role });
  res.json({ ...updated, allowedFeatures });
});

// Trocar senha (obrigatório no primeiro acesso)
usersRouter.patch("/me/password", async (req, res) => {
  const authUser = req.user;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { passwordHash: true },
  });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Senha atual incorreta" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: authUser.id },
    data: { passwordHash, mustChangePassword: false },
  });
  res.json({ ok: true });
});

// Gestão de usuários (Configurações)
usersRouter.use(requireFeature("configuracoes.usuarios"));

usersRouter.get("/", async (req, res) => {
  const authUser = req.user;
  const tenantId = authUser.tenantId;
  const q = String(req.query.q || "");
  const status = String(req.query.status ?? "todos").trim().toLowerCase();
  const roleRaw = String(req.query.role ?? "").trim();
  const roleFilter =
    roleRaw && isKnownRole(roleRaw) ? { role: roleRaw } : {};
  const ativoFilter: Prisma.UserWhereInput =
    status === "inativos"
      ? { ativo: false }
      : status === "ativos"
        ? { ativo: true }
        : {};
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      ...ativoFilter,
      ...roleFilter,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      cargo: true,
      hourlyRate: true,
      employmentType: true,
      cargaHorariaSemanal: true,
      limiteHorasDiarias: true,
      limiteHorasPorDia: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      violacaoApontamentoModo: true,
      diasPermitidos: true,
      birthDate: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      dataInicioAtividades: true,
      ativo: true,
      inativadoEm: true,
      inativacaoMotivo: true,
      createdAt: true,
      clientAccess: {
        select: {
          clientId: true,
          seeAllProjects: true,
          visibleProjects: { select: { projectId: true } },
        },
      },
      linkedSupplier: {
        select: { id: true, nomeApelido: true, cnpjCpf: true, status: true, personType: true },
      },
    },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

usersRouter.get("/client-projects", async (req, res) => {
  const authUser = req.user;
  const clientId = String(req.query.clientId ?? "").trim();
  if (!clientId) {
    res.json([]);
    return;
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: authUser.tenantId },
    select: { id: true },
  });
  if (!client) {
    res.status(400).json({ error: "Empresa inválida." });
    return;
  }
  const projects = await prisma.project.findMany({
    where: { clientId, client: { tenantId: authUser.tenantId } },
    select: { id: true, name: true, arquivado: true },
    orderBy: [{ arquivado: "asc" }, { name: "asc" }],
  });
  res.json(projects);
});

usersRouter.get("/:id/hourly-rate-history", async (req, res) => {
  const authUser = req.user;
  const userId = String(req.params.id);
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: authUser.tenantId },
    select: { id: true },
  });
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  const history = await prisma.userHourlyRateHistory.findMany({
    where: { userId, tenantId: authUser.tenantId },
    select: { id: true, hourlyRate: true, effectiveFrom: true, createdAt: true },
    orderBy: { effectiveFrom: "desc" },
  });
  res.json(history);
});

usersRouter.get("/:id/history", async (req, res) => {
  const authUser = req.user;
  const userId = String(req.params.id);
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: authUser.tenantId },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  const [rows, rateHistory] = await Promise.all([
    prisma.userHistory.findMany({
      where: { userId, tenantId: authUser.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { author: { select: { id: true, name: true, email: true } } },
    }),
    prisma.userHourlyRateHistory.findMany({
      where: { userId, tenantId: authUser.tenantId },
      select: { hourlyRate: true, effectiveFrom: true, createdAt: true },
    }),
  ]);

  // A linha de taxa hora ganha a vigência correspondente, que só existe nessa tabela.
  const effectiveFromByCreatedAt = new Map(
    rateHistory.map((r) => [r.createdAt.getTime(), r.effectiveFrom]),
  );
  const findEffectiveFrom = (createdAt: Date): Date | null => {
    let closest: { diff: number; date: Date } | null = null;
    for (const [time, date] of effectiveFromByCreatedAt) {
      const diff = Math.abs(time - createdAt.getTime());
      if (diff <= 5000 && (closest == null || diff < closest.diff)) closest = { diff, date };
    }
    return closest?.date ?? null;
  };

  res.json(
    rows.map((r) => {
      const effectiveFrom = r.field === "hourlyRate" ? findEffectiveFrom(r.createdAt) : null;
      return {
        id: r.id,
        action: r.action,
        field: r.field,
        fieldLabel: r.field ? (USER_FIELD_LABELS[r.field] ?? r.field) : null,
        oldValue: r.oldValue,
        newValue: r.newValue,
        details: effectiveFrom
          ? `${r.details} (válida a partir de ${effectiveFrom.toISOString().slice(0, 10).split("-").reverse().join("/")})`
          : r.details,
        createdAt: r.createdAt,
        user: r.author ?? { id: "", name: "—" },
      };
    }),
  );
});

usersRouter.post("/", async (req, res) => {
  const authUser = req.user;
  const {
    email,
    name,
    password,
    role,
    cargo,
    avatarUrl,
    hourlyRate,
    hourlyRateEffectiveFrom,
    employmentType,
    cargaHorariaSemanal,
    limiteHorasDiarias,
    limiteHorasPorDia,
    permitirMaisHoras,
    permitirFimDeSemana,
    permitirOutroPeriodo,
    violacaoApontamentoModo,
    diasPermitidos,
    dataInicioAtividades,
    birthDate,
    emergencyContactName,
    emergencyContactPhone,
    clientIds,
    seeAllProjects,
    visibleProjectIds,
  } = req.body;
  const hourlyRateEffectiveFromCreate = parseEffectiveFromDate(hourlyRateEffectiveFrom);
  if (hourlyRateEffectiveFromCreate === "invalid") {
    res.status(400).json({ error: "Data de vigência da taxa hora inválida." });
    return;
  }
  const roleStr = String(role ?? "").trim();
  if (!isKnownRole(roleStr)) {
    res.status(400).json({ error: "Perfil inválido." });
    return;
  }
  const needsApontamento = roleRequiresTimeEntryConfig(roleStr);
  // Para CLIENTE / Administrativo / Financeiro, não exigimos dataInicioAtividades nem limites de apontamento
  if (!email || !name || !password || !roleStr || (needsApontamento && !dataInicioAtividades)) {
    res
      .status(400)
      .json({ error: "E-mail, nome, senha e tipo são obrigatórios. Para usuários não-Cliente, a data de início das atividades também é obrigatória." });
    return;
  }

  // Quando "permitirOutroPeriodo" estiver habilitado, "diasPermitidos" passa a ser obrigatório
  // e deve ser um número maior ou igual a 0 (quantidade de dias para trás permitidos).
  if (needsApontamento && permitirOutroPeriodo) {
    const diasRaw = diasPermitidos;
    const diasNum =
      typeof diasRaw === "number"
        ? diasRaw
        : typeof diasRaw === "string"
          ? Number(diasRaw)
          : Array.isArray(diasRaw) || typeof diasRaw === "object"
            ? NaN
            : NaN;
    if (Number.isNaN(diasNum) || diasNum < 0) {
      res.status(400).json({
        error:
          'Quando "Permitido apontar em outro período" estiver marcado, informe uma quantidade válida de dias permitidos para apontamento (0 ou mais).',
      });
      return;
    }
  }

  // "Limite diário de horas para apontamento" é obrigatório para perfis que apontam horas.
  // Exigimos o mapa por dia (limiteHorasPorDia) no formato { dom, seg, ter, qua, qui, sex, sab }.
  if (needsApontamento) {
    const expectedKeys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
    if (!limiteHorasPorDia || typeof limiteHorasPorDia !== "object" || Array.isArray(limiteHorasPorDia)) {
      res.status(400).json({
        error: 'Informe o "Limite diário de horas para apontamento" (por dia da semana) para este usuário.',
      });
      return;
    }
    const map = limiteHorasPorDia as Record<string, unknown>;
    let anyPositive = false;
    for (const k of expectedKeys) {
      const v = map[k];
      if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
        res.status(400).json({
          error: 'O "Limite diário de horas para apontamento" deve ser um número válido (>= 0) para cada dia da semana.',
        });
        return;
      }
      if (v > 23.99) {
        res.status(400).json({
          error: 'O "Limite diário de horas para apontamento" não pode exceder 23:59 por dia.',
        });
        return;
      }
      if (v > 0) anyPositive = true;
    }
    if (!anyPositive) {
      res.status(400).json({
        error: 'O "Limite diário de horas para apontamento" não pode ser 0 para todos os dias.',
      });
      return;
    }
  }
  let clientIdsValid: string[] = [];
  if (role === "CLIENTE") {
    const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
    if (ids.length === 0) {
      res.status(400).json({
        error: "Usuários com perfil Cliente devem estar vinculados a pelo menos uma empresa (cliente).",
      });
      return;
    }
    const validClients = await prisma.client.findMany({
      where: { id: { in: ids }, tenantId: authUser.tenantId },
      select: { id: true },
    });
    clientIdsValid = validClients.map((c) => c.id);
    const validSet = new Set(clientIdsValid);
    const invalid = ids.filter((id: string) => !validSet.has(id));
    if (invalid.length > 0) {
      res.status(400).json({ error: "Uma ou mais empresas selecionadas não são válidas." });
      return;
    }
  }
  const emailNorm = String(email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNorm)) {
    res.status(400).json({ error: "E-mail em formato inválido" });
    return;
  }
  const existing = await prisma.user.findFirst({
    where: { email: emailNorm },
  });
  if (existing) {
    res.status(400).json({ error: "E-mail já cadastrado" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const isCliente = roleStr === "CLIENTE";
  const allowOtherPeriod = needsApontamento && Boolean(permitirOutroPeriodo);
  const parsedHourlyRate = needsApontamento ? parseOptionalHourlyRate(hourlyRate) : null;
  if (parsedHourlyRate === "invalid") {
    res.status(400).json({ error: "Taxa hora inválida." });
    return;
  }
  const parsedEmploymentType = isCliente
    ? null
    : await parseOptionalEmploymentType(authUser.tenantId, employmentType);
  if (parsedEmploymentType === "invalid") {
    res.status(400).json({ error: "Tipo de contrato inválido." });
    return;
  }
  const newUser = await prisma.user.create({
    data: {
      email: emailNorm,
      name,
      passwordHash,
      role: roleStr,
      tenantId: authUser.tenantId,
      cargo: cargo || null,
      avatarUrl: avatarUrl ? String(avatarUrl) : null,
      hourlyRate: needsApontamento ? parsedHourlyRate : null,
      employmentType: parsedEmploymentType ?? null,
      cargaHorariaSemanal: cargaHorariaSemanal ?? 40,
      limiteHorasDiarias: needsApontamento ? (limiteHorasDiarias != null ? Number(limiteHorasDiarias) : 8) : null,
      limiteHorasPorDia:
        needsApontamento && limiteHorasPorDia && typeof limiteHorasPorDia === "object"
          ? JSON.stringify(limiteHorasPorDia)
          : null,
      permitirMaisHoras: needsApontamento ? (permitirMaisHoras ?? false) : false,
      permitirFimDeSemana: needsApontamento ? (permitirFimDeSemana ?? false) : false,
      permitirOutroPeriodo: allowOtherPeriod,
      violacaoApontamentoModo: needsApontamento
        ? normalizeApontamentoViolacaoModo(violacaoApontamentoModo)
        : "NAO_PERMITIR",
      diasPermitidos:
        !needsApontamento || !allowOtherPeriod
          ? null
          : diasPermitidos != null
            ? typeof diasPermitidos === "string" || typeof diasPermitidos === "number"
              ? String(diasPermitidos)
              : JSON.stringify(diasPermitidos)
            : null,
      dataInicioAtividades: needsApontamento && dataInicioAtividades ? new Date(dataInicioAtividades) : null,
      birthDate:
        needsApontamento && birthDate
          ? new Date(String(birthDate))
          : null,
      emergencyContactName: normalizeOptionalString(emergencyContactName),
      emergencyContactPhone: normalizeOptionalPhone(emergencyContactPhone),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      cargo: true,
      hourlyRate: true,
      employmentType: true,
      cargaHorariaSemanal: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      violacaoApontamentoModo: true,
      diasPermitidos: true,
      createdAt: true,
    },
  });
  if (roleStr === "CLIENTE" && clientIdsValid.length > 0) {
    await replaceClientUserAccess({
      userId: newUser.id,
      tenantId: authUser.tenantId,
      clientIds: clientIdsValid,
      seeAllProjects: parseSeeAllProjects(seeAllProjects),
      visibleProjectIds: parseVisibleProjectIds(visibleProjectIds),
    });
  }
  await prisma.userHistory.create({
    data: {
      tenantId: authUser.tenantId,
      userId: newUser.id,
      authorId: authUser.id,
      action: "CREATED",
      details: `Usuário "${newUser.name}" cadastrado`,
    },
  });
  if (newUser.hourlyRate != null) {
    // Sem vigência informada, a taxa inicial vale desde o início das atividades para
    // cobrir apontamentos retroativos lançados logo após o cadastro.
    const initialEffectiveFrom =
      hourlyRateEffectiveFromCreate ??
      (dataInicioAtividades ? new Date(String(dataInicioAtividades)) : undefined);
    await recordHourlyRateChange(prisma, {
      tenantId: authUser.tenantId,
      userId: newUser.id,
      hourlyRate: newUser.hourlyRate,
      effectiveFrom: initialEffectiveFrom,
      createdById: authUser.id,
    });
  }
  res.json(newUser);
});

// Editar usuário (apenas ADMIN)
usersRouter.patch("/:id", async (req, res) => {
  try {
    const authUser = req.user;
    const userId = req.params.id;
    const body = req.body ?? {};
    const {
      name,
      email,
      password,
      role,
      cargo,
      avatarUrl,
      hourlyRate,
      hourlyRateEffectiveFrom,
      employmentType,
      cargaHorariaSemanal,
      limiteHorasDiarias,
      limiteHorasPorDia,
      permitirMaisHoras,
      permitirFimDeSemana,
      permitirOutroPeriodo,
      violacaoApontamentoModo,
      diasPermitidos,
      clientIds,
      seeAllProjects,
      visibleProjectIds,
      ativo,
      inativacaoMotivo,
      dataInicioAtividades,
      birthDate,
      emergencyContactName,
      emergencyContactPhone,
    } = body;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientAccess: {
          select: {
            clientId: true,
            seeAllProjects: true,
            visibleProjects: { select: { projectId: true } },
          },
        },
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    if (existing.tenantId !== authUser.tenantId) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    const newRole = role !== undefined ? String(role).trim() : existing.role;
    if (role !== undefined && !isKnownRole(newRole)) {
      res.status(400).json({ error: "Perfil inválido." });
      return;
    }
    if (newRole === "CLIENTE") {
      if (!authUser.tenantId) {
        res.status(500).json({ error: "Configuração inválida. Faça login novamente." });
        return;
      }
      const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
      const currentIds = (existing.clientAccess ?? []).map((a) => a.clientId);
      const effectiveIds = ids.length > 0 ? ids : currentIds;
      if (effectiveIds.length === 0) {
        res.status(400).json({
          error: "Usuários com perfil Cliente devem estar vinculados a pelo menos uma empresa (cliente).",
        });
        return;
      }
      if (Array.isArray(clientIds) && ids.length === 0) {
        res.status(400).json({
          error: "Usuários com perfil Cliente devem estar vinculados a pelo menos uma empresa (cliente).",
        });
        return;
      }
      if (ids.length > 0) {
        const validClients = await prisma.client.findMany({
          where: { id: { in: ids }, tenantId: authUser.tenantId },
          select: { id: true },
        });
        const validSet = new Set(validClients.map((c) => c.id));
        const invalid = ids.filter((id: string) => !validSet.has(id));
        if (invalid.length > 0) {
          res.status(400).json({ error: "Uma ou mais empresas selecionadas não são válidas." });
          return;
        }
      }
    }

    const data: Parameters<typeof prisma.user.update>[0]["data"] = {};
    if (name !== undefined) data.name = String(name).trim();
    if (role !== undefined) data.role = String(role);
    if (cargo !== undefined) data.cargo = (cargo as string)?.trim() || null;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl ? String(avatarUrl) : null;
    if (hourlyRate !== undefined) {
      const parsed = newRole === "CLIENTE" ? null : parseOptionalHourlyRate(hourlyRate);
      if (parsed === "invalid") {
        res.status(400).json({ error: "Taxa hora inválida." });
        return;
      }
      data.hourlyRate = parsed;
    }
    const hourlyRateEffectiveFromEdit = parseEffectiveFromDate(hourlyRateEffectiveFrom);
    if (hourlyRateEffectiveFromEdit === "invalid") {
      res.status(400).json({ error: "Data de vigência da taxa hora inválida." });
      return;
    }
    if (employmentType !== undefined) {
      const parsed =
        newRole === "CLIENTE"
          ? null
          : await parseOptionalEmploymentType(authUser.tenantId, employmentType);
      if (parsed === "invalid") {
        res.status(400).json({ error: "Tipo de contrato inválido." });
        return;
      }
      data.employmentType = parsed;
    }
    if (cargaHorariaSemanal !== undefined) data.cargaHorariaSemanal = cargaHorariaSemanal ?? 40;
    // Cliente não aponta horas: ignorar/limpar configurações de apontamento
    if (newRole === "CLIENTE") {
      data.limiteHorasDiarias = null;
      data.limiteHorasPorDia = null;
      data.hourlyRate = null;
      data.employmentType = null;
      data.permitirMaisHoras = false;
      data.permitirFimDeSemana = false;
      data.permitirOutroPeriodo = false;
      data.violacaoApontamentoModo = "NAO_PERMITIR";
      data.diasPermitidos = null;
      data.dataInicioAtividades = null;
    } else {
      // Se o usuário aponta horas e o payload tenta limpar o mapa, bloqueia.
      if (limiteHorasPorDia === null) {
        res.status(400).json({
          error: 'Informe o "Limite diário de horas para apontamento" (por dia da semana) para este usuário.',
        });
        return;
      }
      if (limiteHorasDiarias !== undefined) data.limiteHorasDiarias = Number(limiteHorasDiarias);
      if (limiteHorasPorDia !== undefined) {
        if (
          limiteHorasPorDia == null ||
          typeof limiteHorasPorDia !== "object" ||
          Array.isArray(limiteHorasPorDia)
        ) {
          res.status(400).json({
            error: 'Informe o "Limite diário de horas para apontamento" (por dia da semana) para este usuário.',
          });
          return;
        }
        const expectedKeys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
        const map = limiteHorasPorDia as Record<string, unknown>;
        let anyPositive = false;
        for (const k of expectedKeys) {
          const v = map[k];
          if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
            res.status(400).json({
              error:
                'O "Limite diário de horas para apontamento" deve ser um número válido (>= 0) para cada dia da semana.',
            });
            return;
          }
          if (v > 23.99) {
            res.status(400).json({
              error: 'O "Limite diário de horas para apontamento" não pode exceder 23:59 por dia.',
            });
            return;
          }
          if (v > 0) anyPositive = true;
        }
        if (!anyPositive) {
          res.status(400).json({
            error: 'O "Limite diário de horas para apontamento" não pode ser 0 para todos os dias.',
          });
          return;
        }
        data.limiteHorasPorDia =
          typeof limiteHorasPorDia === "string"
            ? limiteHorasPorDia
            : Array.isArray(limiteHorasPorDia) || typeof limiteHorasPorDia === "object"
              ? JSON.stringify(limiteHorasPorDia)
              : null;
      }
      if (dataInicioAtividades !== undefined) {
        data.dataInicioAtividades =
          dataInicioAtividades === null || dataInicioAtividades === ""
            ? null
            : new Date(String(dataInicioAtividades));
      }
      if (permitirMaisHoras !== undefined) data.permitirMaisHoras = Boolean(permitirMaisHoras);
      if (permitirFimDeSemana !== undefined) data.permitirFimDeSemana = Boolean(permitirFimDeSemana);
      if (permitirOutroPeriodo !== undefined) {
        data.permitirOutroPeriodo = Boolean(permitirOutroPeriodo);
        if (!data.permitirOutroPeriodo) {
          data.diasPermitidos = null;
        }
      }
      if (violacaoApontamentoModo !== undefined) {
        data.violacaoApontamentoModo = normalizeApontamentoViolacaoModo(violacaoApontamentoModo);
      }
      if (diasPermitidos !== undefined) {
        const effectiveAllow = data.permitirOutroPeriodo ?? existing.permitirOutroPeriodo ?? false;
        data.diasPermitidos = effectiveAllow
          ? typeof diasPermitidos === "string"
            ? diasPermitidos
            : Array.isArray(diasPermitidos)
              ? JSON.stringify(diasPermitidos)
              : diasPermitidos != null
                ? JSON.stringify(diasPermitidos)
                : null
          : null;
      }
    }
    if (birthDate !== undefined) {
      const roleFinal = (data.role as string | undefined) ?? existing.role;
      const isClienteFinal = roleFinal === "CLIENTE";
      data.birthDate =
        !isClienteFinal && birthDate
          ? new Date(String(birthDate))
          : null;
    }
    if (emergencyContactName !== undefined) {
      data.emergencyContactName = normalizeOptionalString(emergencyContactName);
    }
    if (emergencyContactPhone !== undefined) {
      data.emergencyContactPhone = normalizeOptionalPhone(emergencyContactPhone);
    }
    if (typeof ativo === "boolean") {
      // Regra: usuário ADMIN não pode inativar a si mesmo
      if (!ativo && existing.role === "SUPER_ADMIN" && existing.id === authUser.id) {
        res.status(400).json({ error: "O usuário Admin não pode se inativar." });
        return;
      }
      // Regra: não permitir inativar o único ADMIN ativo do tenant
      if (!ativo && existing.role === "SUPER_ADMIN") {
        const otherActiveAdmins = await prisma.user.count({
          where: {
            tenantId: authUser.tenantId,
            role: "SUPER_ADMIN",
            ativo: true,
            id: { not: userId },
          },
        });
        if (otherActiveAdmins === 0) {
          res
            .status(400)
            .json({ error: "Não é possível inativar o único usuário com perfil Admin do sistema." });
          return;
        }
      }
      data.ativo = ativo;
      if (!ativo) {
        data.inativadoEm = new Date();
        if (typeof inativacaoMotivo === "string" && inativacaoMotivo.trim()) {
          data.inativacaoMotivo = inativacaoMotivo.trim();
        }
      } else {
        data.inativadoEm = null;
        data.inativacaoMotivo = null;
      }
    }
    // (configs de apontamento movidas para o bloco acima)

    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNorm)) {
        res.status(400).json({ error: "E-mail em formato inválido" });
        return;
      }
      const other = await prisma.user.findFirst({
        where: { email: emailNorm, id: { not: userId } },
      });
      if (other) {
        res.status(400).json({ error: "E-mail já está em uso por outro usuário" });
        return;
      }
      data.email = emailNorm;
    }

    if (password != null && String(password).trim() !== "") {
      data.passwordHash = await hashPassword(String(password));
    }

    const historyEntries = buildUserHistoryEntries(
      existing as unknown as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
    );
    if (data.passwordHash !== undefined) {
      historyEntries.push({ field: "password", oldValue: null, newValue: null });
    }
    if (Array.isArray(clientIds) || seeAllProjects !== undefined || visibleProjectIds !== undefined) {
      const beforeLinks = existing.clientAccess ?? [];
      const beforeAll = beforeLinks.some((a) => a.seeAllProjects);
      const beforeIds = [
        ...new Set(beforeLinks.flatMap((a) => a.visibleProjects.map((p) => p.projectId))),
      ].sort();
      const afterAll =
        seeAllProjects !== undefined ? parseSeeAllProjects(seeAllProjects) : beforeAll;
      const afterIds =
        visibleProjectIds !== undefined ? parseVisibleProjectIds(visibleProjectIds).sort() : beforeIds;
      const visibilityChanged =
        beforeAll !== afterAll || (!afterAll && beforeIds.join(",") !== afterIds.join(","));
      if (visibilityChanged) {
        historyEntries.push({
          field: "clientProjectVisibility",
          oldValue: beforeAll ? "Todos" : beforeIds.length ? `${beforeIds.length} projeto(s)` : "Nenhum",
          newValue: afterAll ? "Todos" : afterIds.length ? `${afterIds.length} projeto(s)` : "Nenhum",
        });
      }
    }
    if (Array.isArray(clientIds)) {
      const before = [...new Set((existing.clientAccess ?? []).map((a) => a.clientId))].sort();
      const after = [...new Set(clientIds.filter(Boolean).map(String))].sort();
      if (before.join(",") !== after.join(",")) {
        const names = await prisma.client.findMany({
          where: { id: { in: [...new Set([...before, ...after])] }, tenantId: authUser.tenantId },
          select: { id: true, name: true },
        });
        const nameById = new Map(names.map((c) => [c.id, c.name]));
        const label = (ids: string[]) =>
          ids.length === 0 ? null : ids.map((id) => nameById.get(id) ?? id).join(", ");
        historyEntries.push({
          field: "clientAccess",
          oldValue: label(before),
          newValue: label(after),
        });
      }
    }

    const willDeactivate = typeof ativo === "boolean" && !ativo;
    const hourlyRateChanged =
      data.hourlyRate !== undefined && (data.hourlyRate ?? null) !== (existing.hourlyRate ?? null);
    const updated = await prisma.$transaction(async (tx) => {
      if (willDeactivate) {
        await detachUserFromProjectsAndTickets(tx, userId);
      }
      if (hourlyRateChanged) {
        await recordHourlyRateChange(tx, {
          tenantId: authUser.tenantId,
          userId,
          hourlyRate: (data.hourlyRate as number | null) ?? null,
          effectiveFrom: hourlyRateEffectiveFromEdit,
          createdById: authUser.id,
        });
      }
      if (historyEntries.length > 0) {
        await tx.userHistory.createMany({
          data: historyEntries.map((e) => ({
            tenantId: authUser.tenantId,
            userId,
            authorId: authUser.id,
            action: e.field === "password" ? "PASSWORD" : "UPDATED",
            field: e.field,
            oldValue: e.oldValue,
            newValue: e.newValue,
            details:
              e.field === "password"
                ? "Senha alterada"
                : `${USER_FIELD_LABELS[e.field] ?? e.field} alterado`,
          })),
        });
      }
      return tx.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatarUrl: true,
          updatedAt: true,
          cargo: true,
          cargaHorariaSemanal: true,
          permitirMaisHoras: true,
          permitirFimDeSemana: true,
          permitirOutroPeriodo: true,
          diasPermitidos: true,
          createdAt: true,
          ativo: true,
        },
      });
    });

    // Recorrências usam valor fixo: a nova taxa não se propaga sozinha para as parcelas futuras.
    let recurrenceWarning: { count: number; rules: Array<{ id: string; description: string }> } | null =
      null;
    if (hourlyRateChanged) {
      const today = new Date();
      const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );
      const rules = await prisma.payableRecurrenceRule.findMany({
        where: {
          tenantId: authUser.tenantId,
          professionalUserId: userId,
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gte: todayUtc } }],
        },
        select: { id: true, description: true },
        orderBy: { description: "asc" },
      });
      if (rules.length > 0) recurrenceWarning = { count: rules.length, rules };
    }

    if (newRole === "CLIENTE" && Array.isArray(clientIds)) {
      const ids = clientIds.filter(Boolean);
      if (ids.length > 0) {
        const existingAll = (existing.clientAccess ?? []).some((a) => a.seeAllProjects);
        const existingIds = [
          ...new Set((existing.clientAccess ?? []).flatMap((a) => a.visibleProjects.map((p) => p.projectId))),
        ];
        await replaceClientUserAccess({
          userId,
          tenantId: authUser.tenantId,
          clientIds: ids.map(String),
          seeAllProjects: seeAllProjects !== undefined ? parseSeeAllProjects(seeAllProjects) : existingAll,
          visibleProjectIds:
            visibleProjectIds !== undefined ? parseVisibleProjectIds(visibleProjectIds) : existingIds,
        });
      }
    } else if (newRole !== "CLIENTE") {
      await prisma.clientUserVisibleProject.deleteMany({
        where: { clientUser: { userId } },
      });
      await prisma.clientUser.deleteMany({ where: { userId } });
    }

    res.json({ ...updated, recurrenceWarning });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("PATCH /api/users/:id error:", errorSummary(err));
    if (stack) devLog(stack);
    if (!res.headersSent) {
      const isDev = process.env.NODE_ENV !== "production";
      res.status(500).json({
        error: isDev ? message : "Erro ao salvar usuário. Tente novamente.",
      });
    }
  }
});

// Excluir usuário (apenas ADMIN, não pode excluir a si mesmo)
usersRouter.delete("/:id", async (req, res) => {
  const authUser = req.user;
  const userId = req.params.id;
  if (userId === authUser.id) {
    res.status(400).json({ error: "Você não pode excluir seu próprio usuário" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  if (existing.tenantId !== authUser.tenantId) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } }),
    prisma.ticket.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  res.status(204).send();
});
