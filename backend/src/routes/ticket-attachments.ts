import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join, normalize, sep } from "path";
import { existsSync } from "fs";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";

export const ticketAttachmentsRouter = Router();
ticketAttachmentsRouter.use(authMiddleware);

async function canAccessTicket(user: { id: string; role: string; tenantId: string }, ticketId: string): Promise<boolean> {
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      project: { client: { tenantId: user.tenantId } },
    },
    select: {
      id: true,
      createdById: true,
      assignedToId: true,
      parentTicketId: true,
      responsibles: { select: { userId: true } },
      project: { select: { client: { select: { users: { select: { userId: true } } } } } },
    },
  });
  if (!ticket) return false;

  const canSeeAll = user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
  if (canSeeAll) return true;

  if (user.role === "CLIENTE") {
    const clientUsers = ticket.project?.client?.users ?? [];
    return clientUsers.some((u) => u.userId === user.id);
  }

  if (user.role === "CONSULTOR") {
    const uid = user.id;
    const isDirect =
      (ticket.assignedToId && ticket.assignedToId === uid) ||
      (ticket.createdById && ticket.createdById === uid) ||
      (Array.isArray(ticket.responsibles) && ticket.responsibles.some((r) => r.userId === uid));
    if (isDirect) return true;

    // Regra do tópico: membro do tópico pai pode ver tarefa
    if (ticket.parentTicketId) {
      const topicMember = await prisma.ticketResponsible.findFirst({
        where: { ticketId: ticket.parentTicketId, userId: uid },
        select: { id: true },
      });
      return Boolean(topicMember);
    }
    return false;
  }

  // Outros perfis: se estiver no tenant, permite (ajuste conforme regras futuras)
  return true;
}

// Criar diretório de uploads se não existir
const uploadsDir = join(getUploadsRoot(), "tickets");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch(console.error);
}

// GET /api/ticket-attachments?ticketId=xxx - Lista anexos de uma tarefa
ticketAttachmentsRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { ticketId } = req.query;

    if (!ticketId || typeof ticketId !== "string") {
      res.status(400).json({ error: "ticketId é obrigatório" });
      return;
    }

    if (!(await canAccessTicket(user, ticketId))) {
      res.status(403).json({ error: "Sem permissão para acessar esta tarefa" });
      return;
    }

    const attachments = await prisma.ticketAttachment.findMany({
      where: { ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(attachments);
  } catch (error) {
    console.error("Erro ao buscar anexos:", error);
    res.status(500).json({ error: "Erro ao buscar anexos" });
  }
});

// GET /api/ticket-attachments/:id/file — download autenticado (evita depender de /uploads público)
ticketAttachmentsRouter.get("/:id/file", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { id } = req.params;

    const attachment = await prisma.ticketAttachment.findFirst({
      where: {
        id,
        ticket: { project: { client: { tenantId: user.tenantId } } },
      },
      select: { id: true, ticketId: true, fileUrl: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado" });
      return;
    }
    if (!(await canAccessTicket(user, attachment.ticketId))) {
      res.status(403).json({ error: "Sem permissão para acessar este anexo" });
      return;
    }

    const abs = resolveUploadsPublicPath(attachment.fileUrl);
    const ticketsRoot = normalize(join(getUploadsRoot(), "tickets")) + sep;
    if (!abs || !(normalize(abs) + sep).startsWith(ticketsRoot)) {
      res.status(403).json({ error: "Caminho de arquivo inválido" });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "Arquivo não encontrado no servidor" });
      return;
    }

    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Erro ao enviar arquivo" });
      }
    });
  } catch (error) {
    console.error("Erro ao servir anexo:", error);
    if (!res.headersSent) res.status(500).json({ error: "Erro ao servir anexo" });
  }
});

// POST /api/ticket-attachments - Faz upload de um anexo
ticketAttachmentsRouter.post("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
    const { ticketId, fileName, fileData, fileType, fileSize } = req.body;

    if (!ticketId || !fileName || !fileData) {
      res.status(400).json({ error: "ticketId, fileName e fileData são obrigatórios" });
      return;
    }

    // Validar tipo de arquivo: imagens + documentos comuns
    const allowedMimeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "application/zip",
      "application/x-zip-compressed",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
    const allowedExtensions = new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
      ".zip",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
    ]);
    const fileExtension = String(fileName).toLowerCase().substring(String(fileName).lastIndexOf("."));
    if (!allowedExtensions.has(fileExtension)) {
      res.status(400).json({ error: "Tipo de arquivo não permitido. Envie imagens ou PDF." });
      return;
    }
    const mimeFromDataUrl = typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
    const effectiveType = String(fileType || mimeFromDataUrl || "");
    if (effectiveType && !allowedMimeTypes.has(effectiveType)) {
      res.status(400).json({ error: "Tipo de arquivo não permitido. Envie imagens ou PDF." });
      return;
    }

    if (!(await canAccessTicket(user, ticketId))) {
      res.status(403).json({ error: "Sem permissão para anexar nesta tarefa" });
      return;
    }

    // Converter base64 para buffer
    const base64Data = fileData.replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Validar tamanho do arquivo (em produção: 30MB; QA/dev mantém 10MB)
    const maxSize = (process.env.NODE_ENV === "production" ? 30 : 10) * 1024 * 1024;
    if (buffer.length > maxSize) {
      res.status(400).json({
        error: `Arquivo muito grande. Tamanho máximo: ${process.env.NODE_ENV === "production" ? "30MB" : "10MB"}`,
      });
      return;
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueFileName = `${ticketId}-${timestamp}-${sanitizedFileName}`;
    const filePath = join(uploadsDir, uniqueFileName);

    // Salvar arquivo
    await writeFile(filePath, buffer);

    // Salvar registro no banco
    const attachment = await prisma.ticketAttachment.create({
      data: {
        ticketId,
        userId: user.id,
        filename: fileName,
        fileUrl: `/uploads/tickets/${uniqueFileName}`,
        fileType: effectiveType || "application/octet-stream",
        fileSize: fileSize || buffer.length,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Registrar no histórico
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "ATTACHMENT_ADDED",
        field: null,
        oldValue: null,
        newValue: fileName,
        details: `Anexo "${fileName}" adicionado`,
      },
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("Erro ao fazer upload do anexo:", error);
    res.status(500).json({ error: "Erro ao fazer upload do anexo" });
  }
});

// DELETE /api/ticket-attachments/:id - Remove um anexo
ticketAttachmentsRouter.delete("/:id", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
    const { id } = req.params;

    const attachment = await prisma.ticketAttachment.findFirst({
      where: {
        id,
        ticket: { project: { client: { tenantId: user.tenantId } } },
      },
      include: {
        ticket: { select: { id: true } },
      },
    });

    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado" });
      return;
    }

    // Apenas o autor ou admin/gestor pode deletar
    const canDelete =
      attachment.userId === user.id || user.role === "SUPER_ADMIN" || user.role === "GESTOR_PROJETOS";
    if (!canDelete) {
      res.status(403).json({ error: "Sem permissão para excluir este anexo" });
      return;
    }

    // Remover arquivo do sistema de arquivos
    const filePath = resolveUploadsPublicPath(attachment.fileUrl);
    if (filePath && existsSync(filePath)) {
      await unlink(filePath).catch(console.error);
    }

    // Registrar no histórico antes de deletar
    await prisma.ticketHistory.create({
      data: {
        ticketId: attachment.ticketId,
        userId: user.id,
        action: "ATTACHMENT_DELETED",
        field: null,
        oldValue: attachment.filename,
        newValue: null,
        details: `Anexo "${attachment.filename}" removido`,
      },
    });

    // Remover registro do banco
    await prisma.ticketAttachment.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir anexo:", error);
    res.status(500).json({ error: "Erro ao excluir anexo" });
  }
});
