import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, verifyPassword, hashPassword } from "../lib/auth.js";

export const usersRouter = Router();
usersRouter.use(authMiddleware);

// Atualizar dados do próprio usuário (ex.: nome)
usersRouter.patch("/me", async (req, res) => {
  const authUser = req.user;
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: "Nome é obrigatório" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { name: String(name).trim() },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      cargo: true,
      cargaHorariaSemanal: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      diasPermitidos: true,
      mustChangePassword: true,
      // avatarUrl será adicionado na model futuramente
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

usersRouter.get("/for-select", async (req, res) => {
  const authUser = req.user;
  // Lista de usuários para selects de responsável/membros em projeto/tópico/tarefa.
  // Antes era restrito só a ADMIN e GESTOR_PROJETOS; isso fazia com que CONSULTOR
  // não conseguisse ver nem os membros atuais ao abrir o modal de edição.
  // Mantemos o bloqueio apenas para CLIENTE.
  if (authUser.role === "CLIENTE") {
    res.status(403).json({ error: "Não autorizado" });
    return;
  }
  const users = await prisma.user.findMany({
    where: { tenantId: authUser.tenantId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

usersRouter.get("/", async (req, res) => {
  const authUser = req.user;
  if (authUser.role !== "ADMIN") {
    res.status(403).json({ error: "Não autorizado" });
    return;
  }
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
      cargo: true,
      cargaHorariaSemanal: true,
      limiteHorasDiarias: true,
      limiteHorasPorDia: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      diasPermitidos: true,
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
  if (authUser.role !== "ADMIN") {
    res.status(403).json({ error: "Não autorizado" });
    return;
  }
  const {
    email,
    name,
    password,
    role,
    cargo,
    cargaHorariaSemanal,
    limiteHorasDiarias,
    limiteHorasPorDia,
    permitirMaisHoras,
    permitirFimDeSemana,
    permitirOutroPeriodo,
    diasPermitidos,
    clientIds,
  } = req.body;
  if (!email || !name || !password || !role) {
    res.status(400).json({ error: "E-mail, nome, senha e tipo são obrigatórios" });
    return;
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
  const newUser = await prisma.user.create({
    data: {
      email: emailNorm,
      name,
      passwordHash,
      role,
      tenantId: authUser.tenantId,
      cargo: cargo || null,
      cargaHorariaSemanal: cargaHorariaSemanal ?? 40,
      limiteHorasDiarias: limiteHorasDiarias != null ? Number(limiteHorasDiarias) : 8,
      limiteHorasPorDia:
        limiteHorasPorDia && typeof limiteHorasPorDia === "object"
          ? JSON.stringify(limiteHorasPorDia)
          : null,
      permitirMaisHoras: permitirMaisHoras ?? false,
      permitirFimDeSemana: permitirFimDeSemana ?? false,
      permitirOutroPeriodo: permitirOutroPeriodo ?? false,
      diasPermitidos: diasPermitidos
        ? JSON.stringify(diasPermitidos)
        : '["seg","ter","qua","qui","sex"]',
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
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
    if (authUser.role !== "ADMIN") {
      res.status(403).json({ error: "Não autorizado" });
      return;
    }
    const userId = req.params.id;
    const body = req.body ?? {};
    const {
      name,
      email,
      password,
      role,
      cargo,
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
    } = body;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: { clientAccess: { select: { clientId: true } } },
    });
    if (!existing) {
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
    if (cargaHorariaSemanal !== undefined) data.cargaHorariaSemanal = cargaHorariaSemanal ?? 40;
    if (limiteHorasDiarias !== undefined) data.limiteHorasDiarias = Number(limiteHorasDiarias);
    if (limiteHorasPorDia !== undefined) {
      data.limiteHorasPorDia =
        typeof limiteHorasPorDia === "string"
          ? limiteHorasPorDia
          : Array.isArray(limiteHorasPorDia) || typeof limiteHorasPorDia === "object"
            ? JSON.stringify(limiteHorasPorDia)
            : null;
    }
    if (typeof ativo === "boolean") {
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
    if (permitirMaisHoras !== undefined) data.permitirMaisHoras = Boolean(permitirMaisHoras);
    if (permitirFimDeSemana !== undefined) data.permitirFimDeSemana = Boolean(permitirFimDeSemana);
    if (permitirOutroPeriodo !== undefined) data.permitirOutroPeriodo = Boolean(permitirOutroPeriodo);
    if (diasPermitidos !== undefined) {
      data.diasPermitidos =
        typeof diasPermitidos === "string"
          ? diasPermitidos
          : Array.isArray(diasPermitidos)
            ? JSON.stringify(diasPermitidos)
            : diasPermitidos != null
              ? JSON.stringify(diasPermitidos)
              : null;
    }

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
  if (authUser.role !== "ADMIN") {
    res.status(403).json({ error: "Não autorizado" });
    return;
  }
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

  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } }),
    prisma.ticket.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  res.status(204).send();
});
