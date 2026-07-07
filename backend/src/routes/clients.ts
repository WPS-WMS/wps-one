import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { PROJETO_FEATURE_IDS, type FeatureId } from "../lib/permissions.js";
import { hasAllTenantProjectsView, hasAllUsersTasksListView } from "../lib/projectVisibility.js";
import { errorSummary } from "../lib/devLog.js";

const CLIENT_FOR_SELECT_FEATURES = [
  ...PROJETO_FEATURE_IDS,
  "projeto.listaTarefas",
  "tarefa.verTodos",
] as FeatureId[];

export const clientsRouter = Router();
clientsRouter.use(authMiddleware);

clientsRouter.get("/for-select", requireAnyFeature(CLIENT_FOR_SELECT_FEATURES), async (req: Request, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const canSeeAllClients =
    user.role === "SUPER_ADMIN" ||
    (await hasAllTenantProjectsView(user)) ||
    (await hasAllUsersTasksListView(user));
  const isAdmin = canSeeAllClients;
  const clients = await prisma.client.findMany({
    where: {
      tenantId: user.tenantId,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { users: { some: { userId: user.id } } },
              {
                projects: {
                  some: {
                    OR: [
                      { createdById: user.id },
                      {
                        tickets: {
                          some: {
                            OR: [
                              { assignedToId: user.id },
                              { createdById: user.id },
                              { responsibles: { some: { userId: user.id } } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(clients);
});

clientsRouter.get(
  "/for-project-select",
  requireAnyFeature(["projeto.novo", "projeto.editar"]),
  async (req: Request, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const canSeeAllClients =
    user.role === "SUPER_ADMIN" || (await hasAllTenantProjectsView(user));
  const clients = await prisma.client.findMany({
    where: {
      tenantId: user.tenantId,
      ...(canSeeAllClients
        ? {}
        : {
            OR: [
              { users: { some: { userId: user.id } } },
              {
                projects: {
                  some: {
                    OR: [
                      { createdById: user.id },
                      {
                        tickets: {
                          some: {
                            OR: [
                              { assignedToId: user.id },
                              { createdById: user.id },
                              { responsibles: { some: { userId: user.id } } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(clients);
  },
);

clientsRouter.get(
  "/",
  requireAnyFeature(["configuracoes.clientes", "financeiro.clientesFinanceiros", "financeiro.contasReceber"]),
  async (req: Request, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const clients = await prisma.client.findMany({
    where: {
      tenantId: user.tenantId,
    },
    include: { 
      _count: { select: { projects: true, contacts: true } },
      contacts: true,
    },
    orderBy: { name: "asc" },
  });
  res.json(clients);
});

clientsRouter.get("/:id", requireFeature("configuracoes.clientes"), async (req: Request, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const clientId = req.params.id;
  
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      tenantId: user.tenantId,
    },
    include: {
      _count: { select: { projects: true, contacts: true } },
      contacts: {
        orderBy: { createdAt: "desc" },
      },
      projects: {
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  res.json(client);
});

clientsRouter.get(
  "/:id/financial",
  requireAnyFeature(["configuracoes.clientes", "financeiro.clientesFinanceiros"]),
  async (req: Request, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const clientId = req.params.id;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true, name: true, cnpj: true },
    });
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const financial = await prisma.clientFinancial.findUnique({
      where: { clientId },
    });

    res.json({
      client,
      financial: financial ?? null,
    });
  },
);

clientsRouter.put(
  "/:id/financial",
  requireAnyFeature(["configuracoes.clientes", "financeiro.clientesFinanceiros"]),
  async (req: Request, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const clientId = req.params.id;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const optStr = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s.length > 0 ? s : null;
    };

    let prazoMedio: number | null = null;
    if (b.prazoMedioPagamentoDias != null && String(b.prazoMedioPagamentoDias).trim() !== "") {
      const n = Number(b.prazoMedioPagamentoDias);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: "Prazo médio de pagamento inválido." });
        return;
      }
      prazoMedio = Math.round(n);
    }

    const moeda = optStr(b.moedaContrato)?.toUpperCase() ?? "BRL";

    const data = {
      razaoSocial: optStr(b.razaoSocial),
      ie: b.ieIsento === true ? null : optStr(b.ie),
      ieIsento: b.ieIsento === true,
      condicoesPagamento: optStr(b.condicoesPagamento),
      prazoMedioPagamentoDias: prazoMedio,
      moedaContrato: moeda,
      retencaoImpostos: optStr(b.retencaoImpostos),
      dadosFaturamento: optStr(b.dadosFaturamento),
      contatoFinNome: optStr(b.contatoFinNome),
      contatoFinEmail: optStr(b.contatoFinEmail),
      contatoFinCel: optStr(b.contatoFinCel),
    };

    try {
      const financial = await prisma.clientFinancial.upsert({
        where: { clientId },
        create: { clientId, tenantId: user.tenantId, ...data },
        update: data,
      });
      res.json({ financial });
    } catch (error) {
      console.error("Erro ao salvar dados financeiros do cliente:", errorSummary(error));
      res.status(500).json({ error: "Erro ao salvar dados financeiros do cliente" });
    }
  },
);

clientsRouter.post("/", requireFeature("configuracoes.clientes"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;

  const {
    name,
    email,
    cnpj,
    telefone,
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
  } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Nome do cliente é obrigatório" });
    return;
  }

  if (!email || !String(email).trim()) {
    res.status(400).json({ error: "E-mail do cliente é obrigatório" });
    return;
  }

  try {
    const client = await prisma.client.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim(),
        cnpj: cnpj ? String(cnpj).trim() : null,
        telefone: telefone ? String(telefone).trim() : null,
        cep: cep ? String(cep).trim() : null,
        endereco: endereco ? String(endereco).trim() : null,
        numero: numero ? String(numero).trim() : null,
        complemento: complemento ? String(complemento).trim() : null,
        bairro: bairro ? String(bairro).trim() : null,
        cidade: cidade ? String(cidade).trim() : null,
        estado: estado ? String(estado).trim() : null,
        tenantId: user.tenantId,
      },
      include: { _count: { select: { projects: true } } },
    });

    res.status(201).json(client);
  } catch (error) {
    console.error("Erro ao criar cliente:", errorSummary(error));
    res.status(500).json({ error: "Erro ao criar cliente" });
  }
});

clientsRouter.patch("/:id", requireFeature("configuracoes.clientes"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;

  const clientId = req.params.id;
  const {
    name,
    email,
    cnpj,
    telefone,
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
  } = req.body;

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  try {
    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: name ? String(name).trim() : undefined,
        email: email !== undefined ? (email ? String(email).trim() : null) : undefined,
        cnpj: cnpj !== undefined ? (cnpj ? String(cnpj).trim() : null) : undefined,
        telefone: telefone !== undefined ? (telefone ? String(telefone).trim() : null) : undefined,
        cep: cep !== undefined ? (cep ? String(cep).trim() : null) : undefined,
        endereco: endereco !== undefined ? (endereco ? String(endereco).trim() : null) : undefined,
        numero: numero !== undefined ? (numero ? String(numero).trim() : null) : undefined,
        complemento: complemento !== undefined ? (complemento ? String(complemento).trim() : null) : undefined,
        bairro: bairro !== undefined ? (bairro ? String(bairro).trim() : null) : undefined,
        cidade: cidade !== undefined ? (cidade ? String(cidade).trim() : null) : undefined,
        estado: estado !== undefined ? (estado ? String(estado).trim() : null) : undefined,
      },
      include: {
        _count: { select: { projects: true, contacts: true } },
        contacts: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", errorSummary(error));
    res.status(500).json({ error: "Erro ao atualizar cliente" });
  }
});

clientsRouter.delete("/:id", requireFeature("configuracoes.clientes"), async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;

  const clientId = req.params.id;
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
    include: { _count: { select: { projects: true } } },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  if (client._count.projects > 0) {
    res.status(400).json({ error: "Não é possível excluir cliente com projetos associados" });
    return;
  }

  try {
    await prisma.client.delete({ where: { id: clientId } });
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir cliente:", errorSummary(error));
    res.status(500).json({ error: "Erro ao excluir cliente" });
  }
});
