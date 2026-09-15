import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { errorSummary } from "../lib/devLog.js";

export const productUpdatesRouter = Router();
productUpdatesRouter.use(authMiddleware);

type AuthedUser = { id: string; email: string; role: string; tenantId: string };

async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    if (!(await isPlatformAdmin(user))) {
      res.status(403).json({ error: "Sem permissão para gerenciar atualizações do produto." });
      return;
    }
    next();
  } catch (err) {
    console.error("[product-updates] auth", errorSummary(err));
    res.status(500).json({ error: "Erro ao validar acesso." });
  }
}

function serialize(row: {
  id: string;
  title: string;
  content: string;
  publishedAt: Date;
  createdAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    publishedAt: row.publishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lista pública (usuário autenticado de qualquer tenant). */
productUpdatesRouter.get("/", async (_req, res) => {
  try {
    const limitRaw = Number((_req.query.limit as string) || 50);
    const take = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50;
    const rows = await prisma.productUpdate.findMany({
      orderBy: { publishedAt: "desc" },
      take,
    });
    res.json({ items: rows.map(serialize) });
  } catch (err) {
    console.error("[product-updates] list", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar atualizações." });
  }
});

productUpdatesRouter.post("/", requirePlatformAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    const content = String(req.body?.content ?? "").trim();
    if (!title) {
      res.status(400).json({ error: "Informe o título da atualização." });
      return;
    }
    let publishedAt = new Date();
    if (req.body?.publishedAt != null && String(req.body.publishedAt).trim()) {
      const d = new Date(String(req.body.publishedAt).trim());
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Data de publicação inválida." });
        return;
      }
      publishedAt = d;
    }
    const row = await prisma.productUpdate.create({
      data: { title, content, publishedAt },
    });
    res.status(201).json(serialize(row));
  } catch (err) {
    console.error("[product-updates] create", errorSummary(err));
    res.status(500).json({ error: "Erro ao publicar atualização." });
  }
});

productUpdatesRouter.delete("/:id", requirePlatformAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }
    const existing = await prisma.productUpdate.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: "Atualização não encontrada." });
      return;
    }
    await prisma.productUpdate.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("[product-updates] delete", errorSummary(err));
    res.status(500).json({ error: "Erro ao excluir atualização." });
  }
});
