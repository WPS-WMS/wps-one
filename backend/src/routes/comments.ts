import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { notifyTicketMembers } from "../lib/ticketEmailNotifications.js";
import sanitizeHtml from "sanitize-html";

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

function sanitizeCommentHtml(html: string): string {
  // Allowlist minimal: foco em texto + links + listas + quebras de linha e imagens/âncoras do editor.
  return sanitizeHtml(String(html || ""), {
    allowedTags: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "p",
      "br",
      "div",
      "span",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "a",
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title"],
      "*": ["style"],
    },
    // Remover qualquer on* e atributos não listados.
    allowedSchemes: ["http", "https", "data", "blob"],
    allowProtocolRelative: false,
    // Impede tags perigosas por completo (svg, iframe, etc.).
    disallowedTagsMode: "discard",
    // Normaliza/limpa CSS inline (mantemos simples; pode apertar mais depois).
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
        "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
        "font-weight": [/^\d+$/, /^bold$/, /^normal$/],
        "font-style": [/^italic$/, /^normal$/],
        "text-decoration": [/^none$/, /^underline$/, /^line-through$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
  });
}

// GET /api/comments?ticketId=xxx - Lista comentários de um ticket
commentsRouter.get("/", async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; role: string; tenantId: string } }).user;
    const { ticketId } = req.query;

    if (!ticketId || typeof ticketId !== "string") {
      res.status(400).json({ error: "ticketId é obrigatório" });
      return;
    }

    // Verifica se o usuário tem acesso ao ticket (payload mínimo — evita joins caros).
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        project: { client: { tenantId: user.tenantId } },
      },
      select: {
        id: true,
        createdById: true,
        project: { select: { clientId: true } },
      },
    });

    if (!ticket) {
      // Verifica se o ticket existe mas não pertence ao tenant
      const ticketExists = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, projectId: true },
      });
      if (ticketExists) {
        res.status(403).json({ error: "Você não tem permissão para acessar este ticket" });
        return;
      }
      res.status(404).json({ error: "Ticket não encontrado" });
      return;
    }

    // Cliente: só pode ver comentários do(s) seu(s) cliente(s) ou de tickets que ele criou.
    if (user.role === "CLIENTE") {
      const clientId = ticket.project?.clientId ? String(ticket.project.clientId) : "";
      const hasLink = clientId
        ? await prisma.clientUser
            .findFirst({ where: { userId: user.id, clientId }, select: { id: true } })
            .then(Boolean)
        : false;
      const hasAccess = hasLink || ticket.createdById === user.id;
      if (!hasAccess) {
        res.status(403).json({ error: "Você não tem permissão para acessar este ticket" });
        return;
      }
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

    if (!ticketId || !content) {
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
      res.status(404).json({ error: "Ticket não encontrado" });
      return;
    }

    // Valida se o conteúdo tem texto real (remove tags HTML e verifica se sobra texto)
    const rawHtmlContent = String(content);
    const htmlContent = sanitizeCommentHtml(rawHtmlContent);
    const textContent = htmlContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!textContent) {
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

    if (comment.visibility === "PUBLIC") {
      const plain = htmlContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
      const excerpt = plain.length > 280 ? `${plain.slice(0, 280)}…` : plain;
      const who = escapeCommentName(comment.user?.name ?? "Usuário");
      notifyTicketMembers({
        tenantId: user.tenantId,
        ticketId,
        subject: `Tarefa ${ticket.code} — novo comentário`,
        title: `Novo comentário na tarefa ${ticket.code}`,
        messageHtml: `<p><b>${who}</b> comentou:</p><p style="white-space:pre-wrap">${escapeCommentText(
          excerpt,
        )}</p>`,
        trigger: "COMENTARIO",
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
      res.status(403).json({ error: "Você não tem permissão para editar este comentário" });
      return;
    }

    // Valida se o conteúdo tem texto real (remove tags HTML e verifica se sobra texto)
    const rawHtmlContent = String(content);
    const htmlContent = sanitizeCommentHtml(rawHtmlContent);
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

    res.status(204).send();
  } catch (error) {
    console.error("Erro ao deletar comentário:", error);
    res.status(500).json({ error: "Erro ao deletar comentário" });
  }
});
