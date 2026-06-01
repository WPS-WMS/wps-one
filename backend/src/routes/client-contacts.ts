import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { errorSummary } from "../lib/devLog.js";

export const clientContactsRouter = Router();
clientContactsRouter.use(authMiddleware);
clientContactsRouter.use(requireFeature("configuracoes.clientes"));

clientContactsRouter.get("/client/:clientId", async (req: Request, res) => {
  const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
  const clientId = req.params.clientId;

  // Verificar se o cliente pertence ao tenant
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const contacts = await prisma.clientContact.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });

  res.json(contacts);
});

clientContactsRouter.post("/", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;

  const { clientId, name, email, telefone } = req.body;

  if (!clientId || !name || !name.trim()) {
    res.status(400).json({ error: "ID do cliente e nome do contato são obrigatórios" });
    return;
  }

  // Verificar se o cliente pertence ao tenant
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  try {
    const contact = await prisma.clientContact.create({
      data: {
        clientId,
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        telefone: telefone ? String(telefone).trim() : null,
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error("Erro ao criar contato:", errorSummary(error));
    res.status(500).json({ error: "Erro ao criar contato" });
  }
});

clientContactsRouter.patch("/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;

  const contactId = req.params.id;
  const { name, email, telefone } = req.body;

  // Verificar se o contato existe e pertence a um cliente do tenant
  const contact = await prisma.clientContact.findFirst({
    where: { id: contactId },
    include: { client: true },
  });

  if (!contact) {
    res.status(404).json({ error: "Contato não encontrado" });
    return;
  }

  if (contact.client.tenantId !== user.tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    const updated = await prisma.clientContact.update({
      where: { id: contactId },
      data: {
        name: name ? String(name).trim() : undefined,
        email: email !== undefined ? (email ? String(email).trim() : null) : undefined,
        telefone: telefone !== undefined ? (telefone ? String(telefone).trim() : null) : undefined,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar contato:", errorSummary(error));
    res.status(500).json({ error: "Erro ao atualizar contato" });
  }
});

clientContactsRouter.delete("/:id", async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;

  const contactId = req.params.id;

  // Verificar se o contato existe e pertence a um cliente do tenant
  const contact = await prisma.clientContact.findFirst({
    where: { id: contactId },
    include: { client: true },
  });

  if (!contact) {
    res.status(404).json({ error: "Contato não encontrado" });
    return;
  }

  if (contact.client.tenantId !== user.tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    await prisma.clientContact.delete({ where: { id: contactId } });
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir contato:", errorSummary(error));
    res.status(500).json({ error: "Erro ao excluir contato" });
  }
});
