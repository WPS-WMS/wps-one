import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { notifyTicketMembers } from "../lib/ticketEmailNotifications.js";

export const commentsRouter = Router();
commentsRouter.use(authMiddleware);

function escapeCommentText(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCommentName(input: string): string {
  return escapeCommentText(input);
}

function sanitizeHtmlBasic(html: string): string {
  if (!html) return "";
  let s = String(html);
  // Remove tags de script e seu conteúdo
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  // Remove atributos on* (onload, onclick, etc.)
  s = s.replace(/\s*on\w+="[^"]*"/gi, "");
  s = s.replace(/\s*on\w+='[^']*'/gi, "");
  // Remove javascript: em URLs
  s = s.replace(/javascript:/gi, "");
  return s;
}

// GET /api/comments?ticketId=xxx - Lista comentários de um ticket
commentsRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { ticketId } = req.query;

    console.log("GET /api/comments - ticketId:", ticketId, "user:", user.id, "tenantId:", user.tenantId);

    if (!ticketId || typeof ticketId !== "string") {
      console.error("ticketId inválido:", ticketId);
      res.status(400).json({ error: "ticketId é obrigatório" });
      return;
    }

    // Verifica se o usuário tem acesso ao ticket
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        project: {
          client: { tenantId: user.tenantId },
        },
      },
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!ticket) {
      console.error("Ticket não encontrado:", ticketId, "para tenant:", user.tenantId);
      // Verifica se o ticket existe mas não pertence ao tenant
      const ticketExists = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, projectId: true },
      });
      if (ticketExists) {
        console.error("Ticket existe mas não pertence ao tenant do usuário");
        res.status(403).json({ error: "Você não tem permissão para acessar este ticket" });
        return;
      }
      res.status(404).json({ error: "Ticket não encontrado" });
      return;
    }

    const comments = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        ...(user.role === "CLIENTE" ? { visibility: "PUBLIC" } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log("Comentários encontrados:", comments.length);
    res.json(comments);
  } catch (error) {
    console.error("Erro ao buscar comentários:", error);
    res.status(500).json({ error: "Erro ao buscar comentários" });
  }
});

// POST /api/comments - Cria um novo comentário
commentsRouter.post("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
    const { ticketId, content, visibility } = req.body;

    console.log("POST /api/comments - ticketId:", ticketId, "content length:", content?.length, "user:", user.id);

    if (!ticketId || !content) {
      console.error("Dados inválidos:", { ticketId, hasContent: !!content });
      res.status(400).json({ error: "ticketId e content são obrigatórios" });
      return;
    }

    // Verifica se o ticket existe e o usuário tem acesso
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        project: {
          client: { tenantId: user.tenantId },
        },
      },
      select: {
        id: true,
        code: true,
        title: true,
        project: { select: { name: true, tipoProjeto: true } },
      },
    });

    if (!ticket) {
      console.error("Ticket não encontrado:", ticketId, "para tenant:", user.tenantId);
      res.status(404).json({ error: "Ticket não encontrado" });
      return;
    }

    // Valida se o conteúdo tem texto real (remove tags HTML e verifica se sobra texto)
    const rawHtmlContent = String(content);
    const htmlContent = sanitizeHtmlBasic(rawHtmlContent);
    const textContent = htmlContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!textContent) {
      console.error("Comentário vazio após remover HTML");
      res.status(400).json({ error: "O comentário não pode estar vazio" });
      return;
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        userId: user.id,
        content: htmlContent,
        visibility:
          user.role === "CLIENTE"
            ? "PUBLIC"
            : String(visibility || "")
                .toUpperCase()
                .trim() === "INTERNAL"
              ? "INTERNAL"
              : "PUBLIC",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    // Registrar no histórico
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "COMMENT_ADDED",
        field: null,
        oldValue: null,
        newValue: null,
        details: "Comentário adicionado",
      },
    });

    console.log("Comentário criado com sucesso:", comment.id);

    if (comment.visibility === "PUBLIC") {
      const plain = htmlContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
      const excerpt = plain.length > 280 ? `${plain.slice(0, 280)}…` : plain;
      const who = escapeCommentName(comment.user?.name ?? "Usuário");
      notifyTicketMembers({
        tenantId: user.tenantId,
        ticketId,
        subject: `Chamado ${ticket.code} — novo comentário`,
        title: `Novo comentário no chamado ${ticket.code}`,
        messageHtml: `<p><b>${who}</b> comentou:</p><p style="white-space:pre-wrap">${escapeCommentText(
          excerpt,
        )}</p>`,
        trigger: "COMENTARIO",
        includeProjectResponsibles: true,
      }).catch(() => {});
    }

    res.status(201).json(comment);
  } catch (error) {
    console.error("Erro ao criar comentário:", error);
    res.status(500).json({ error: "Erro ao criar comentário" });
  }
});

// POST /api/comments/:id/attachments - Adiciona anexo a um comentário
commentsRouter.post("/:id/attachments", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const commentId = req.params.id;
  const { filename, fileUrl, fileType, fileSize } = req.body;

  if (!filename || !fileUrl || !fileType || !fileSize) {
    res.status(400).json({ error: "filename, fileUrl, fileType e fileSize são obrigatórios" });
    return;
  }

  // Verifica se o comentário existe e pertence ao tenant do usuário
  const comment = await prisma.ticketComment.findFirst({
    where: {
      id: commentId,
      ticket: {
        project: {
          client: { tenantId: user.tenantId },
        },
      },
    },
  });

  if (!comment) {
    res.status(404).json({ error: "Comentário não encontrado" });
    return;
  }

  const attachment = await prisma.ticketCommentAttachment.create({
    data: {
      commentId,
      filename: String(filename),
      fileUrl: String(fileUrl),
      fileType: String(fileType),
      fileSize: Number(fileSize),
    },
  });

  res.status(201).json(attachment);
});

// PATCH /api/comments/:id - Edita um comentário
commentsRouter.patch("/:id", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
    const commentId = req.params.id;
    const { content } = req.body;

    console.log("PATCH /api/comments/:id - commentId:", commentId, "user:", user.id);

    if (!content) {
      res.status(400).json({ error: "content é obrigatório" });
      return;
    }

    const comment = await prisma.ticketComment.findFirst({
      where: {
        id: commentId,
        ticket: {
          project: {
            client: { tenantId: user.tenantId },
          },
        },
      },
    });

    if (!comment) {
      console.error("Comentário não encontrado:", commentId);
      res.status(404).json({ error: "Comentário não encontrado" });
      return;
    }

    // Apenas o autor ou SUPER_ADMIN pode editar
    if (comment.userId !== user.id && user.role !== "SUPER_ADMIN") {
      console.error("Usuário sem permissão para editar comentário:", user.id, "comment userId:", comment.userId);
      res.status(403).json({ error: "Você não tem permissão para editar este comentário" });
      return;
    }

    // Valida se o conteúdo tem texto real (remove tags HTML e verifica se sobra texto)
    const rawHtmlContent = String(content);
    const htmlContent = sanitizeHtmlBasic(rawHtmlContent);
    const textContent = htmlContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!textContent) {
      console.error("Comentário vazio após remover HTML");
      res.status(400).json({ error: "O comentário não pode estar vazio" });
      return;
    }

    const updatedComment = await prisma.ticketComment.update({
      where: { id: commentId },
      data: {
        content: htmlContent,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    // Registrar no histórico
    await prisma.ticketHistory.create({
      data: {
        ticketId: comment.ticketId,
        userId: user.id,
        action: "COMMENT_EDITED",
        field: null,
        oldValue: null,
        newValue: null,
        details: "Comentário editado",
      },
    });

    console.log("Comentário atualizado com sucesso:", updatedComment.id);
    res.json(updatedComment);
  } catch (error) {
    console.error("Erro ao atualizar comentário:", error);
    res.status(500).json({ error: "Erro ao atualizar comentário" });
  }
});

// DELETE /api/comments/:id - Deleta um comentário
commentsRouter.delete("/:id", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
    const commentId = req.params.id;

    console.log("DELETE /api/comments/:id - commentId:", commentId, "user:", user.id);

    const comment = await prisma.ticketComment.findFirst({
      where: {
        id: commentId,
        ticket: {
          project: {
            client: { tenantId: user.tenantId },
          },
        },
      },
    });

    if (!comment) {
      console.error("Comentário não encontrado:", commentId);
      res.status(404).json({ error: "Comentário não encontrado" });
      return;
    }

    // Apenas o autor ou SUPER_ADMIN pode deletar
    if (comment.userId !== user.id && user.role !== "SUPER_ADMIN") {
      console.error("Usuário sem permissão para deletar comentário:", user.id, "comment userId:", comment.userId);
      res.status(403).json({ error: "Você não tem permissão para deletar este comentário" });
      return;
    }

    const ticketId = comment.ticketId;
    
    await prisma.ticketComment.delete({
      where: { id: commentId },
    });

    // Registrar no histórico
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: "COMMENT_DELETED",
        field: null,
        oldValue: null,
        newValue: null,
        details: "Comentário removido",
      },
    });

    console.log("Comentário deletado com sucesso:", commentId);
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao deletar comentário:", error);
    res.status(500).json({ error: "Erro ao deletar comentário" });
  }
});
