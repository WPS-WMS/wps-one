import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { isPlatformAdmin } from "../lib/platformAdmin.js";
import { formatStorageBytes, getTenantUsageSnapshot } from "../lib/platformTenantUsage.js";
import { errorSummary } from "../lib/devLog.js";

export const platformRouter = Router();
platformRouter.use(authMiddleware);

type AuthedUser = { id: string; email: string; role: string; tenantId: string };

async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    if (!(await isPlatformAdmin(user))) {
      res.status(403).json({ error: "Sem permissão para o painel da plataforma." });
      return;
    }
    next();
  } catch (err) {
    console.error("[platform] auth", errorSummary(err));
    res.status(500).json({ error: "Erro ao validar acesso da plataforma." });
  }
}

platformRouter.get("/access", async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    const allowed = await isPlatformAdmin(user);
    res.json({ platformAdmin: allowed });
  } catch (err) {
    console.error("[platform] access", errorSummary(err));
    res.status(500).json({ error: "Erro ao validar acesso." });
  }
});

platformRouter.get("/tenants", requirePlatformAdmin, async (_req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
    });

    const items = await Promise.all(
      tenants.map(async (t) => {
        const usage = await getTenantUsageSnapshot(t.id);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          usage: {
            ...usage,
            storageFormatted: formatStorageBytes(usage.storageBytes),
          },
          subscription: {
            plan: null as string | null,
            status: "none" as const,
            label: "Não configurado",
          },
        };
      }),
    );

    const totals = items.reduce(
      (acc, row) => {
        acc.tenants += 1;
        acc.usersActive += row.usage.usersActive;
        acc.projects += row.usage.projects;
        acc.storageBytes += row.usage.storageBytes;
        return acc;
      },
      { tenants: 0, usersActive: 0, projects: 0, storageBytes: 0 },
    );

    res.json({
      items,
      totals: {
        ...totals,
        storageFormatted: formatStorageBytes(totals.storageBytes),
      },
    });
  } catch (err) {
    console.error("[platform] tenants list", errorSummary(err));
    res.status(500).json({ error: "Erro ao listar tenants." });
  }
});

platformRouter.get("/tenants/:id", requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Informe o tenant." });
    return;
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
    });
    if (!tenant) {
      res.status(404).json({ error: "Tenant não encontrado." });
      return;
    }

    const usage = await getTenantUsageSnapshot(tenant.id);
    const recentUsers = await prisma.user.findMany({
      where: { tenantId: tenant.id },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        ativo: true,
        updatedAt: true,
      },
    });

    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      usage: {
        ...usage,
        storageFormatted: formatStorageBytes(usage.storageBytes),
      },
      subscription: {
        plan: null as string | null,
        status: "none" as const,
        label: "Não configurado",
        note: "Planos e preços serão definidos pelo comercial.",
      },
      recentUsers: recentUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        ativo: u.ativo,
        updatedAt: u.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[platform] tenant detail", errorSummary(err));
    res.status(500).json({ error: "Erro ao carregar tenant." });
  }
});
