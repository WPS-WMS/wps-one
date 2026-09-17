import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import {
  buildMicrosoftAuthorizeUrl,
  disconnectTenantMicrosoftOAuth,
  exchangeMicrosoftAuthCode,
  getTenantMicrosoftConnectionStatus,
  isGraphAvailableForWpsTenant,
  isMicrosoftOAuthAppConfigured,
  saveTenantMicrosoftOAuthConnection,
  signMicrosoftOAuthState,
  verifyMicrosoftOAuthState,
  withGraphForWpsTenant,
} from "../lib/microsoftGraphAuth.js";
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

function normalizeAppBaseUrl(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function frontendAppBaseUrl(): string {
  const appEnv = String(process.env.APP_ENV || process.env.DEPLOY_ENV || "")
    .trim()
    .toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (appEnv === "qa" || nodeEnv === "qa") {
    return normalizeAppBaseUrl(process.env.APP_URL_QA || process.env.APP_URL) || "http://localhost:3000";
  }
  if (appEnv === "prod" || appEnv === "production" || nodeEnv === "production") {
    return (
      normalizeAppBaseUrl(process.env.APP_URL_PROD || process.env.APP_URL) || "http://localhost:3000"
    );
  }
  return normalizeAppBaseUrl(process.env.APP_URL || process.env.FRONTEND_URL) || "http://localhost:3000";
}

function safeReturnPath(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/admin/configuracoes/sharepoint";
  }
  if (!/configuracoes\/sharepoint/i.test(value)) {
    return "/admin/configuracoes/sharepoint";
  }
  return value.split("?")[0];
}

export const sharepointRouter = Router();

/**
 * Callback OAuth Microsoft (público — state assinado).
 * GET /api/sharepoint/oauth/callback?code=&state=
 */
sharepointRouter.get("/oauth/callback", async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  const stateRaw = String(req.query.state ?? "").trim();
  const oauthError = String(req.query.error_description || req.query.error || "").trim();

  let returnPath = "/admin/configuracoes/sharepoint";
  try {
    if (oauthError) throw new Error(oauthError || "Autorização Microsoft cancelada.");
    if (!code || !stateRaw) throw new Error("Callback Microsoft incompleto.");

    const state = verifyMicrosoftOAuthState(stateRaw);
    returnPath = safeReturnPath(state.ret);

    const tokens = await exchangeMicrosoftAuthCode(code);
    await saveTenantMicrosoftOAuthConnection({
      wpsTenantId: state.tid,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
    });

    const dest = `${frontendAppBaseUrl()}${returnPath}?microsoft=connected`;
    res.redirect(302, dest);
  } catch (err) {
    logSharePointError("oauth/callback", err);
    const msg = encodeURIComponent(
      err instanceof Error ? err.message.slice(0, 180) : "Falha ao conectar Microsoft",
    );
    res.redirect(302, `${frontendAppBaseUrl()}${returnPath}?microsoft=error&message=${msg}`);
  }
});

sharepointRouter.use(authMiddleware);

/** GET /api/sharepoint/oauth/start — inicia OAuth no tenant Microsoft do cliente */
sharepointRouter.get("/oauth/start", requireFeature("configuracoes.sharepoint"), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  if (!isMicrosoftOAuthAppConfigured()) {
    res.status(400).json({
      error:
        "App Microsoft não configurado no servidor (CLIENT_ID / CLIENT_SECRET). Configure o app multi-tenant e o redirect URI.",
    });
    return;
  }
  const returnPath = safeReturnPath(String(req.query.returnPath ?? ""));
  const state = signMicrosoftOAuthState({
    tid: user.tenantId,
    uid: user.id,
    ret: returnPath,
  });
  try {
    const authorizeUrl = buildMicrosoftAuthorizeUrl(state);
    res.json({ authorizeUrl });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Não foi possível iniciar o OAuth Microsoft.",
    });
  }
});

/** POST /api/sharepoint/oauth/disconnect */
sharepointRouter.post(
  "/oauth/disconnect",
  requireFeature("configuracoes.sharepoint"),
  async (req, res) => {
    const user = (req as Request & { user: { tenantId: string } }).user;
    await disconnectTenantMicrosoftOAuth(user.tenantId);
    const microsoft = await getTenantMicrosoftConnectionStatus(user.tenantId);
    if (!microsoft.graphAvailable) {
      await prisma.tenant.update({
        where: { id: user.tenantId },
        data: { sharePointEnabled: false },
      });
    }
    res.json({ ok: true, microsoft });
  },
);

/** GET /api/sharepoint/config — configuração do tenant */
sharepointRouter.get("/config", requireFeature("configuracoes.sharepoint"), async (req, res) => {
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
  const microsoft = await getTenantMicrosoftConnectionStatus(user.tenantId);
  res.json({
    ...tenant,
    graphConfigured: microsoft.graphAvailable,
    microsoft,
    rootFolderPath: tenant.sharePointRootFolderPath ?? "Projetos WPSone",
  });
});

/** PUT /api/sharepoint/config */
sharepointRouter.put("/config", requireFeature("configuracoes.sharepoint"), async (req, res) => {
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
  const driveId =
    body.sharePointDriveId != null ? String(body.sharePointDriveId).trim() || null : undefined;
  const rootPathRaw =
    body.sharePointRootFolderPath != null ? String(body.sharePointRootFolderPath).trim() : undefined;
  const rootFolderPath = rootPathRaw === undefined ? undefined : rootPathRaw || "Projetos WPSone";

  if (enabled && !(await isGraphAvailableForWpsTenant(user.tenantId))) {
    res.status(400).json({
      error:
        "Conecte a conta Microsoft desta empresa (ou configure o Graph legado no servidor) antes de ativar.",
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

  const siteChanged = siteUrl !== undefined && siteUrl !== current.sharePointSiteUrl;
  const rootChanged =
    rootFolderPath !== undefined &&
    rootFolderPath !== (current.sharePointRootFolderPath ?? "Projetos WPSone");

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

  const microsoft = await getTenantMicrosoftConnectionStatus(user.tenantId);
  res.json({
    ...updated,
    graphConfigured: microsoft.graphAvailable,
    microsoft,
  });
});

/** POST /api/sharepoint/test-connection */
sharepointRouter.post("/test-connection", requireFeature("configuracoes.sharepoint"), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const cfg = await getSharePointTenantConfig(user.tenantId);
  if (!cfg?.siteUrl) {
    res.status(400).json({ error: "Configure a URL do site SharePoint antes de testar." });
    return;
  }
  try {
    const resolved = await withGraphForWpsTenant(user.tenantId, () =>
      resolveSiteAndDrive(cfg.siteUrl!, cfg.driveId),
    );
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
  const microsoft = await getTenantMicrosoftConnectionStatus(user.tenantId);
  res.json({
    clientId: client.id,
    clientName: client.name,
    sharePointEnabled: client.sharePointEnabled,
    sharePointSiteUrl: client.sharePointSiteUrl,
    sharePointDriveId: client.sharePointDriveId,
    sharePointRootFolderPath: client.sharePointRootFolderPath ?? "Projetos WPSone",
    sharePointRootFolderItemId: client.sharePointRootFolderItemId,
    tenantSharePointEnabled: client.tenant.sharePointEnabled === true,
    graphConfigured: microsoft.graphAvailable,
    microsoft,
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
  const driveId =
    body.sharePointDriveId != null ? String(body.sharePointDriveId).trim() || null : undefined;
  const rootPathRaw =
    body.sharePointRootFolderPath != null ? String(body.sharePointRootFolderPath).trim() : undefined;
  const rootFolderPath = rootPathRaw === undefined ? undefined : rootPathRaw || "Projetos WPSone";

  if (enabled && !(await isGraphAvailableForWpsTenant(user.tenantId))) {
    res.status(400).json({
      error: "Conecte a conta Microsoft da empresa em Integrações antes de ativar por cliente.",
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

  const microsoft = await getTenantMicrosoftConnectionStatus(user.tenantId);
  res.json({
    ...updated,
    clientId: updated.id,
    clientName: updated.name,
    tenantSharePointEnabled: true,
    graphConfigured: microsoft.graphAvailable,
    microsoft,
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
      const resolved = await withGraphForWpsTenant(user.tenantId, () =>
        resolveSiteAndDrive(cfg.siteUrl!, cfg.driveId),
      );
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

/** POST /api/sharepoint/tickets/:ticketId/sync */
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
