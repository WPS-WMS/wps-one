import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, verifyPassword, hashPassword } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";

export const usersRouter = Router();
usersRouter.use(authMiddleware);

usersRouter.get("/for-select", requireFeature("projeto"), async (req, res) => {
  const authUser = req.user;
  const users = await prisma.user.findMany({
    where: { tenantId: authUser.tenantId, role: { not: "CLIENTE" }, ativo: true },
    // Inclui role para permitir filtros no frontend (ex.: esconder SUPER_ADMIN/GESTOR_PROJETOS em listas de membros).
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

usersRouter.get("/for-project-select", requireFeature("projeto.novo"), async (req, res) => {
  const authUser = req.user;
  const users = await prisma.user.findMany({
    where: { tenantId: authUser.tenantId },
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
});

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
      diasPermitidos: true,
      mustChangePassword: true,
    },
  });
  res.json(updated);
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
  const users = await prisma.user.findMany({
    where: {
      tenantId,
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
      cargaHorariaSemanal: true,
      limiteHorasDiarias: true,
      limiteHorasPorDia: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      diasPermitidos: true,
      birthDate: true,
      dataInicioAtividades: true,
      ativo: true,
      inativadoEm: true,
      inativacaoMotivo: true,
      createdAt: true,
      clientAccess: { select: { clientId: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json(users);
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
    cargaHorariaSemanal,
    limiteHorasDiarias,
    limiteHorasPorDia,
    permitirMaisHoras,
    permitirFimDeSemana,
    permitirOutroPeriodo,
    diasPermitidos,
    dataInicioAtividades,
    birthDate,
    clientIds,
  } = req.body;
  // Para CLIENTE, não exigimos dataInicioAtividades nem configurações de apontamento
  if (!email || !name || !password || !role || (String(role) !== "CLIENTE" && !dataInicioAtividades)) {
    res
      .status(400)
      .json({ error: "E-mail, nome, senha e tipo são obrigatórios. Para usuários não-Cliente, a data de início das atividades também é obrigatória." });
    return;
  }

  // Quando "permitirOutroPeriodo" estiver habilitado, "diasPermitidos" passa a ser obrigatório
  // e deve ser um número maior ou igual a 0 (quantidade de dias para trás permitidos).
  if (String(role) !== "CLIENTE" && permitirOutroPeriodo) {
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
  if (String(role) !== "CLIENTE") {
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
    where: { email: emailNorm, tenantId: authUser.tenantId },
  });
  if (existing) {
    res.status(400).json({ error: "E-mail já cadastrado" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const isCliente = String(role) === "CLIENTE";
  const allowOtherPeriod = !isCliente && Boolean(permitirOutroPeriodo);
  const newUser = await prisma.user.create({
    data: {
      email: emailNorm,
      name,
      passwordHash,
      role,
      tenantId: authUser.tenantId,
      cargo: cargo || null,
      avatarUrl: avatarUrl ? String(avatarUrl) : null,
      cargaHorariaSemanal: cargaHorariaSemanal ?? 40,
      // Cliente não aponta horas: limpar configurações de apontamento
      limiteHorasDiarias: isCliente ? null : limiteHorasDiarias != null ? Number(limiteHorasDiarias) : 8,
      limiteHorasPorDia:
        isCliente
          ? null
          : limiteHorasPorDia && typeof limiteHorasPorDia === "object"
            ? JSON.stringify(limiteHorasPorDia)
            : null,
      permitirMaisHoras: isCliente ? false : permitirMaisHoras ?? false,
      permitirFimDeSemana: isCliente ? false : permitirFimDeSemana ?? false,
      permitirOutroPeriodo: allowOtherPeriod,
      diasPermitidos:
        isCliente || !allowOtherPeriod
          ? null
          : diasPermitidos != null
            ? typeof diasPermitidos === "string" || typeof diasPermitidos === "number"
              ? String(diasPermitidos)
              : JSON.stringify(diasPermitidos)
            : null,
      dataInicioAtividades: isCliente ? null : dataInicioAtividades ? new Date(dataInicioAtividades) : null,
      birthDate:
        !isCliente && birthDate
          ? new Date(String(birthDate))
          : null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      cargo: true,
      cargaHorariaSemanal: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      diasPermitidos: true,
      createdAt: true,
    },
  });
  if (role === "CLIENTE" && clientIdsValid.length > 0) {
    await prisma.clientUser.createMany({
      data: clientIdsValid.map((clientId) => ({ userId: newUser.id, clientId })),
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
      cargaHorariaSemanal,
      limiteHorasDiarias,
      limiteHorasPorDia,
      permitirMaisHoras,
      permitirFimDeSemana,
      permitirOutroPeriodo,
      diasPermitidos,
      clientIds,
      ativo,
      inativacaoMotivo,
      dataInicioAtividades,
      birthDate,
    } = body;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: { clientAccess: { select: { clientId: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }
    if (existing.tenantId !== authUser.tenantId) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    const newRole = role !== undefined ? String(role) : existing.role;
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
    if (cargaHorariaSemanal !== undefined) data.cargaHorariaSemanal = cargaHorariaSemanal ?? 40;
    // Cliente não aponta horas: ignorar/limpar configurações de apontamento
    if (newRole === "CLIENTE") {
      data.limiteHorasDiarias = null;
      data.limiteHorasPorDia = null;
      data.permitirMaisHoras = false;
      data.permitirFimDeSemana = false;
      data.permitirOutroPeriodo = false;
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

    const updated = await prisma.user.update({
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
      },
    });

    if (newRole === "CLIENTE" && Array.isArray(clientIds)) {
      const ids = clientIds.filter(Boolean);
      if (ids.length > 0) {
        const validClients = await prisma.client.findMany({
          where: { id: { in: ids }, tenantId: authUser.tenantId },
          select: { id: true },
        });
        await prisma.clientUser.deleteMany({ where: { userId } });
        await prisma.clientUser.createMany({
          data: validClients.map((c) => ({ userId, clientId: c.id })),
        });
      }
    } else if (newRole !== "CLIENTE") {
      await prisma.clientUser.deleteMany({ where: { userId } });
    }

    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("PATCH /api/users/:id error:", message);
    if (stack) console.error(stack);
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
