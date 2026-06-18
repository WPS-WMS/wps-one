import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { isMicrosoftGraphConfigured } from "../lib/microsoftGraphAuth.js";
import { resolveSiteAndDrive, logSharePointError } from "../lib/sharepointDrive.js";
import {
  getSharePointTenantConfig,
  getSharePointClientConfig,
  provisionProjectSharePointFolder,
  provisionTicketSharePointFolder,
  syncTicketAttachmentsFromSharePoint,
} from "../lib/sharepointSyncService.js";

/** Normaliza URL do site (remove pasta Shared Documents etc.). */
function normalizeSharePointSiteUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "");
    const siteMatch = path.match(/^(\/sites\/[^/]+)/i);
    if (siteMatch) {
      u.pathname = siteMatch[1];
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/+$/, "");
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export const sharepointRouter = Router();
sharepointRouter.use(authMiddleware);

/** GET /api/sharepoint/config — configuração do tenant */
sharepointRouter.get("/config", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
    },
  });
  if (!tenant) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }
  res.json({
    ...tenant,
    graphConfigured: isMicrosoftGraphConfigured(),
    rootFolderPath: tenant.sharePointRootFolderPath ?? "Projetos WPSone",
  });
});

/** PUT /api/sharepoint/config */
sharepointRouter.put("/config", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const body = req.body as {
    sharePointEnabled?: boolean;
    sharePointSiteUrl?: string | null;
    sharePointDriveId?: string | null;
    sharePointRootFolderPath?: string | null;
  };

  const enabled = body.sharePointEnabled === true;
  const siteUrl =
    body.sharePointSiteUrl != null
      ? normalizeSharePointSiteUrl(String(body.sharePointSiteUrl).trim() || null)
      : undefined;
  const driveId = body.sharePointDriveId != null ? String(body.sharePointDriveId).trim() || null : undefined;
  const rootPathRaw =
    body.sharePointRootFolderPath != null ? String(body.sharePointRootFolderPath).trim() : undefined;
  const rootFolderPath = rootPathRaw === undefined ? undefined : rootPathRaw || "Projetos WPSone";

  if (enabled && !isMicrosoftGraphConfigured()) {
    res.status(400).json({
      error: "Microsoft Graph não está configurado no servidor (variáveis TENANT_ID, CLIENT_ID, CLIENT_SECRET).",
    });
    return;
  }

  const current = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { sharePointSiteUrl: true, sharePointRootFolderPath: true },
  });
  if (!current) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }

  const nextSiteUrl = siteUrl !== undefined ? siteUrl : current.sharePointSiteUrl;
  // Site no tenant é opcional quando cada cliente tem sua equipe Teams.

  const siteChanged = siteUrl !== undefined && siteUrl !== current.sharePointSiteUrl;
  const rootChanged =
    rootFolderPath !== undefined && rootFolderPath !== (current.sharePointRootFolderPath ?? "Projetos WPSone");

  const updated = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      ...(body.sharePointEnabled !== undefined ? { sharePointEnabled: enabled } : {}),
      ...(siteUrl !== undefined ? { sharePointSiteUrl: siteUrl } : {}),
      ...(driveId !== undefined ? { sharePointDriveId: driveId } : {}),
      ...(rootFolderPath !== undefined ? { sharePointRootFolderPath: rootFolderPath } : {}),
      ...(siteChanged || rootChanged ? { sharePointRootFolderItemId: null } : {}),
    },
    select: {
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
    },
  });

  res.json({ ...updated, graphConfigured: isMicrosoftGraphConfigured() });
});

/** POST /api/sharepoint/test-connection */
sharepointRouter.post("/test-connection", requireFeature("configuracoes.emails"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const cfg = await getSharePointTenantConfig(user.tenantId);
  if (!cfg?.siteUrl) {
    res.status(400).json({ error: "Configure a URL do site SharePoint antes de testar." });
    return;
  }
  try {
    const resolved = await resolveSiteAndDrive(cfg.siteUrl, cfg.driveId);
    res.json({
      ok: true,
      siteId: resolved.siteId,
      driveId: resolved.driveId,
    });
  } catch (err) {
    logSharePointError("test-connection", err);
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao conectar ao SharePoint",
    });
  }
});

/** GET /api/sharepoint/clients/:clientId/config */
sharepointRouter.get("/clients/:clientId/config", requireFeature("configuracoes.clientes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const clientId = req.params.clientId;
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
      tenant: { select: { sharePointEnabled: true } },
    },
  });
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }
  res.json({
    clientId: client.id,
    clientName: client.name,
    sharePointEnabled: client.sharePointEnabled,
    sharePointSiteUrl: client.sharePointSiteUrl,
    sharePointDriveId: client.sharePointDriveId,
    sharePointRootFolderPath: client.sharePointRootFolderPath ?? "Projetos WPSone",
    sharePointRootFolderItemId: client.sharePointRootFolderItemId,
    tenantSharePointEnabled: client.tenant.sharePointEnabled === true,
    graphConfigured: isMicrosoftGraphConfigured(),
  });
});

/** PUT /api/sharepoint/clients/:clientId/config */
sharepointRouter.put("/clients/:clientId/config", requireFeature("configuracoes.clientes"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const clientId = req.params.clientId;
  const body = req.body as {
    sharePointEnabled?: boolean;
    sharePointSiteUrl?: string | null;
    sharePointDriveId?: string | null;
    sharePointRootFolderPath?: string | null;
  };

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      sharePointSiteUrl: true,
      sharePointRootFolderPath: true,
      tenant: { select: { sharePointEnabled: true } },
    },
  });
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }
  if (client.tenant.sharePointEnabled !== true) {
    res.status(400).json({
      error: "Ative a integração SharePoint em Configurações antes de configurar por cliente.",
    });
    return;
  }

  const enabled = body.sharePointEnabled === true;
  const siteUrl =
    body.sharePointSiteUrl != null
      ? normalizeSharePointSiteUrl(String(body.sharePointSiteUrl).trim() || null)
      : undefined;
  const driveId = body.sharePointDriveId != null ? String(body.sharePointDriveId).trim() || null : undefined;
  const rootPathRaw =
    body.sharePointRootFolderPath != null ? String(body.sharePointRootFolderPath).trim() : undefined;
  const rootFolderPath = rootPathRaw === undefined ? undefined : rootPathRaw || "Projetos WPSone";

  if (enabled && !isMicrosoftGraphConfigured()) {
    res.status(400).json({
      error: "Microsoft Graph não está configurado no servidor (variáveis TENANT_ID, CLIENT_ID, CLIENT_SECRET).",
    });
    return;
  }

  const nextSiteUrl = siteUrl !== undefined ? siteUrl : client.sharePointSiteUrl;
  if (enabled && !nextSiteUrl) {
    res.status(400).json({ error: "Informe a URL da equipe Teams / site SharePoint do cliente." });
    return;
  }

  const siteChanged = siteUrl !== undefined && siteUrl !== client.sharePointSiteUrl;
  const rootChanged =
    rootFolderPath !== undefined &&
    rootFolderPath !== (client.sharePointRootFolderPath ?? "Projetos WPSone");

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(body.sharePointEnabled !== undefined ? { sharePointEnabled: enabled } : {}),
      ...(siteUrl !== undefined ? { sharePointSiteUrl: siteUrl } : {}),
      ...(driveId !== undefined ? { sharePointDriveId: driveId } : {}),
      ...(rootFolderPath !== undefined ? { sharePointRootFolderPath: rootFolderPath } : {}),
      ...(siteChanged || rootChanged ? { sharePointRootFolderItemId: null } : {}),
    },
    select: {
      id: true,
      name: true,
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
    },
  });

  res.json({
    ...updated,
    clientId: updated.id,
    clientName: updated.name,
    tenantSharePointEnabled: true,
    graphConfigured: isMicrosoftGraphConfigured(),
  });
});

/** POST /api/sharepoint/clients/:clientId/test-connection */
sharepointRouter.post(
  "/clients/:clientId/test-connection",
  requireFeature("configuracoes.clientes"),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const clientId = req.params.clientId;
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }
    const cfg = await getSharePointClientConfig(clientId);
    if (!cfg?.siteUrl) {
      res.status(400).json({ error: "Configure a URL da equipe do cliente antes de testar." });
      return;
    }
    try {
      const resolved = await resolveSiteAndDrive(cfg.siteUrl, cfg.driveId);
      res.json({
        ok: true,
        siteId: resolved.siteId,
        driveId: resolved.driveId,
        scope: cfg.scope,
      });
    } catch (err) {
      logSharePointError("client test-connection", err);
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao conectar ao SharePoint",
      });
    }
  },
);

/** POST /api/sharepoint/projects/:projectId/provision */
sharepointRouter.post("/projects/:projectId/provision", requireFeature("projeto.editar"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const projectId = req.params.projectId;
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    select: { id: true, sharePointFolderUrl: true },
  });
  if (!project) {
    res.status(404).json({ error: "Projeto não encontrado" });
    return;
  }
  await provisionProjectSharePointFolder(projectId);
  const refreshed = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      sharePointFolderId: true,
      sharePointFolderUrl: true,
      sharePointSyncStatus: true,
      sharePointSyncError: true,
    },
  });
  res.json(refreshed);
});

/** POST /api/sharepoint/tickets/:ticketId/provision */
sharepointRouter.post("/tickets/:ticketId/provision", requireFeature("tarefa.editar"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const ticketId = req.params.ticketId;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Tarefa não encontrada" });
    return;
  }
  await provisionTicketSharePointFolder(ticketId);
  const refreshed = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      sharePointFolderId: true,
      sharePointFolderUrl: true,
      sharePointSyncStatus: true,
      sharePointSyncError: true,
    },
  });
  res.json(refreshed);
});

/** POST /api/sharepoint/tickets/:ticketId/sync — puxa anexos do SharePoint */
sharepointRouter.post("/tickets/:ticketId/sync", requireFeature("tarefa.editar"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const ticketId = req.params.ticketId;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, project: { client: { tenantId: user.tenantId } } },
    select: { id: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Tarefa não encontrada" });
    return;
  }
  await syncTicketAttachmentsFromSharePoint(ticketId);
  res.json({ ok: true });
});
