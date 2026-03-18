import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";

export const clientsRouter = Router();
clientsRouter.use(authMiddleware);

clientsRouter.get("/", async (req: Request, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const isAdmin = user.role === "ADMIN" || user.role === "GESTOR_PROJETOS";
  const clients = await prisma.client.findMany({
    where: {
      tenantId: user.tenantId,
      ...(isAdmin
        ? {}
        : {
            OR: [
              // Clientes aos quais o usuário está vinculado diretamente (client_users)
              { users: { some: { userId: user.id } } },
              // Clientes que possuem pelo menos um projeto onde o usuário participa de alguma forma
              {
                projects: {
                  some: {
                    OR: [
                      // Projetos criados pelo usuário
                      { createdById: user.id },
                      // Projetos com alguma tarefa em que o usuário participa
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
    include: { 
      _count: { select: { projects: true, contacts: true } },
      contacts: true,
    },
    orderBy: { name: "asc" },
  });
  res.json(clients);
});

clientsRouter.get("/:id", async (req: Request, res) => {
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

clientsRouter.post("/", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem criar clientes." });
    return;
  }

  const {
    name,
    email,
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

  try {
    const client = await prisma.client.create({
      data: {
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
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
    console.error("Erro ao criar cliente:", error);
    res.status(500).json({ error: "Erro ao criar cliente" });
  }
});

clientsRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem editar clientes." });
    return;
  }

  const clientId = req.params.id;
  const {
    name,
    email,
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
    console.error("Erro ao atualizar cliente:", error);
    res.status(500).json({ error: "Erro ao atualizar cliente" });
  }
});

clientsRouter.delete("/:id", async (req, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem excluir clientes." });
    return;
  }

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
    console.error("Erro ao excluir cliente:", error);
    res.status(500).json({ error: "Erro ao excluir cliente" });
  }
});
