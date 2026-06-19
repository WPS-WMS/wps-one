import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { prisma } from "./prisma.js";
import { isMicrosoftGraphConfigured } from "./microsoftGraphAuth.js";
import {
  createChildFolder,
  downloadDriveItemContent,
  ensureDriveFolderPath,
  getDriveItemById,
  listDriveFolderDelta,
  logSharePointError,
  resolveSiteAndDrive,
  uploadFileToFolder,
} from "./sharepointDrive.js";
import {
  projectSharePointFolderName,
  projectSharePointFolderNameInClientSite,
  ticketSharePointFolderName,
} from "./sharepointPaths.js";
import { getUploadsRoot } from "./uploadsRoot.js";

export type SharePointSiteConfig = {
  enabled: boolean;
  siteUrl: string | null;
  driveId: string | null;
  rootFolderPath: string;
  rootFolderItemId: string | null;
  /** client = equipe do cliente; tenant = site único legado */
  scope: "client" | "tenant";
  tenantId: string;
  clientId?: string;
};

export type SharePointTenantConfig = SharePointSiteConfig;

/** Configuração global do tenant (legado / fallback). */
export async function getSharePointTenantConfig(tenantId: string): Promise<SharePointSiteConfig | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
    },
  });
  if (!tenant) return null;
  return {
    enabled: tenant.sharePointEnabled === true,
    siteUrl: tenant.sharePointSiteUrl,
    driveId: tenant.sharePointDriveId,
    rootFolderPath: tenant.sharePointRootFolderPath?.trim() || "Projetos WPSone",
    rootFolderItemId: tenant.sharePointRootFolderItemId,
    scope: "tenant",
    tenantId,
  };
}

/** Configuração efetiva para um cliente (prioriza equipe do cliente). */
export async function getSharePointClientConfig(clientId: string): Promise<SharePointSiteConfig | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      tenantId: true,
      sharePointEnabled: true,
      sharePointSiteUrl: true,
      sharePointDriveId: true,
      sharePointRootFolderPath: true,
      sharePointRootFolderItemId: true,
      tenant: {
        select: {
          sharePointEnabled: true,
          sharePointSiteUrl: true,
          sharePointDriveId: true,
          sharePointRootFolderPath: true,
          sharePointRootFolderItemId: true,
        },
      },
    },
  });
  if (!client?.tenant) return null;
  if (client.tenant.sharePointEnabled !== true) return null;

  const clientSite = client.sharePointSiteUrl?.trim() || null;
  if (client.sharePointEnabled === true && clientSite) {
    return {
      enabled: true,
      siteUrl: clientSite,
      driveId: client.sharePointDriveId,
      rootFolderPath: client.sharePointRootFolderPath?.trim() || "Projetos WPSone",
      rootFolderItemId: client.sharePointRootFolderItemId,
      scope: "client",
      tenantId: client.tenantId,
      clientId: client.id,
    };
  }

  const tenantSite = client.tenant.sharePointSiteUrl?.trim() || null;
  if (tenantSite) {
    return {
      enabled: true,
      siteUrl: tenantSite,
      driveId: client.tenant.sharePointDriveId,
      rootFolderPath: client.tenant.sharePointRootFolderPath?.trim() || "Projetos WPSone",
      rootFolderItemId: client.tenant.sharePointRootFolderItemId,
      scope: "tenant",
      tenantId: client.tenantId,
    };
  }

  return null;
}

export function isSharePointIntegrationActive(cfg: SharePointSiteConfig | null): boolean {
  return !!(cfg?.enabled && cfg.siteUrl && isMicrosoftGraphConfigured());
}

async function resolveSiteDrive(cfg: SharePointSiteConfig): Promise<{ driveId: string; siteId: string }> {
  if (!cfg.siteUrl) throw new Error("Site SharePoint não configurado.");
  const resolved = await resolveSiteAndDrive(cfg.siteUrl, cfg.driveId);
  if (cfg.driveId !== resolved.driveId) {
    if (cfg.scope === "client" && cfg.clientId) {
      await prisma.client.update({
        where: { id: cfg.clientId },
        data: { sharePointDriveId: resolved.driveId },
      });
    } else {
      await prisma.tenant.update({
        where: { id: cfg.tenantId },
        data: { sharePointDriveId: resolved.driveId },
      });
    }
  }
  return resolved;
}

async function ensureProjectsRoot(cfg: SharePointSiteConfig): Promise<string> {
  if (cfg.rootFolderItemId) return cfg.rootFolderItemId;

  const { driveId } = await resolveSiteDrive(cfg);
  const rootFolder = await ensureDriveFolderPath(driveId, cfg.rootFolderPath);

  if (cfg.scope === "client" && cfg.clientId) {
    await prisma.client.update({
      where: { id: cfg.clientId },
      data: { sharePointRootFolderItemId: rootFolder.id },
    });
  } else {
    await prisma.tenant.update({
      where: { id: cfg.tenantId },
      data: { sharePointRootFolderItemId: rootFolder.id },
    });
  }
  return rootFolder.id;
}

function projectFolderName(cfg: SharePointSiteConfig, clientName: string, projectName: string): string {
  return cfg.scope === "client"
    ? projectSharePointFolderNameInClientSite(projectName)
    : projectSharePointFolderName(clientName, projectName);
}

/** Serializa provisionamento por projeto/tarefa — cada chamada revalida o banco após a anterior. */
const provisionTail = new Map<string, Promise<void>>();

async function runProvisionExclusive(key: string, fn: () => Promise<void>): Promise<void> {
  const previous = provisionTail.get(key) ?? Promise.resolve();
  const current = previous.then(fn);
  provisionTail.set(
    key,
    current.catch(() => undefined),
  );
  await current;
}

function isSharePointNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\(\s*404\s*\)/.test(msg) || msg.includes("itemNotFound") || msg.includes("não encontrad");
}

async function markTicketSharePointFolderMissing(ticketId: string): Promise<void> {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      sharePointSyncStatus: "FOLDER_MISSING",
      sharePointSyncError:
        "Pasta SharePoint vinculada não encontrada. Anexos do WPSone permanecem no sistema; excluir outras pastas duplicadas no SharePoint não afeta esta tarefa.",
      sharePointDeltaLink: null,
    },
  });
}

export async function provisionProjectSharePointFolder(projectId: string): Promise<void> {
  await runProvisionExclusive(`project:${projectId}`, async () => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        sharePointFolderId: true,
        client: { select: { id: true, name: true, tenantId: true } },
      },
    });
    if (!project?.client?.id) return;
    if (project.sharePointFolderId) return;

    const cfg = await getSharePointClientConfig(project.client.id);
    if (!isSharePointIntegrationActive(cfg)) return;

    try {
      const rootItemId = await ensureProjectsRoot(cfg!);
      const { driveId } = await resolveSiteDrive(cfg!);
      const folderName = projectFolderName(cfg!, project.client.name, project.name);
      const folder = await createChildFolder(driveId, rootItemId, folderName);
      const { count } = await prisma.project.updateMany({
        where: { id: projectId, sharePointFolderId: null },
        data: {
          sharePointFolderId: folder.id,
          sharePointFolderUrl: folder.webUrl,
          sharePointSyncStatus: "OK",
          sharePointSyncError: null,
        },
      });
      if (count === 0) return;
    } catch (err) {
      logSharePointError(`provisionProjectSharePointFolder ${projectId}`, err);
      await prisma.project.update({
        where: { id: projectId },
        data: {
          sharePointSyncStatus: "FAILED",
          sharePointSyncError: err instanceof Error ? err.message.slice(0, 500) : "Erro SharePoint",
        },
      });
    }
  });
}

export async function provisionTicketSharePointFolder(ticketId: string): Promise<void> {
  await runProvisionExclusive(`ticket:${ticketId}`, async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        sharePointFolderId: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            sharePointFolderId: true,
            sharePointSyncStatus: true,
            client: { select: { id: true, tenantId: true, name: true } },
          },
        },
      },
    });
    if (!ticket) return;
    if (String(ticket.type ?? "").trim() === "SUBPROJETO") return;
    if (ticket.sharePointFolderId) return;

    const clientId = ticket.project?.client?.id;
    if (!clientId) return;

    const cfg = await getSharePointClientConfig(clientId);
    if (!isSharePointIntegrationActive(cfg)) return;

    try {
      if (!ticket.project.sharePointFolderId) {
        await provisionProjectSharePointFolder(ticket.projectId);
      }
      const project = await prisma.project.findUnique({
        where: { id: ticket.projectId },
        select: { sharePointFolderId: true },
      });
      if (!project?.sharePointFolderId) {
        throw new Error("Pasta SharePoint do projeto indisponível.");
      }

      const { driveId } = await resolveSiteDrive(cfg!);
      const folderName = ticketSharePointFolderName(ticket.code, ticket.title);
      const folder = await createChildFolder(driveId, project.sharePointFolderId, folderName);
      const { count } = await prisma.ticket.updateMany({
        where: { id: ticketId, sharePointFolderId: null },
        data: {
          sharePointFolderId: folder.id,
          sharePointFolderUrl: folder.webUrl,
          sharePointSyncStatus: "OK",
          sharePointSyncError: null,
        },
      });
      if (count === 0) return;
    } catch (err) {
      logSharePointError(`provisionTicketSharePointFolder ${ticketId}`, err);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          sharePointSyncStatus: "FAILED",
          sharePointSyncError: err instanceof Error ? err.message.slice(0, 500) : "Erro SharePoint",
        },
      });
    }
  });
}

export async function pushAttachmentToSharePoint(attachmentId: string, buffer: Buffer): Promise<void> {
  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      filename: true,
      fileType: true,
      sharePointItemId: true,
      ticket: {
        select: {
          id: true,
          sharePointFolderId: true,
          project: { select: { client: { select: { id: true, tenantId: true } } } },
        },
      },
    },
  });
  const clientId = attachment?.ticket?.project?.client?.id;
  if (!clientId) return;
  if (attachment.sharePointItemId) return;

  const cfg = await getSharePointClientConfig(clientId);
  if (!isSharePointIntegrationActive(cfg)) return;

  try {
    if (!attachment.ticket.sharePointFolderId) {
      await provisionTicketSharePointFolder(attachment.ticket.id);
    }
    const ticket = await prisma.ticket.findUnique({
      where: { id: attachment.ticket.id },
      select: { sharePointFolderId: true },
    });
    if (!ticket?.sharePointFolderId) throw new Error("Pasta SharePoint da tarefa indisponível.");

    const { driveId } = await resolveSiteDrive(cfg!);
    const folderItem = await getDriveItemById(driveId, ticket.sharePointFolderId);
    if (!folderItem?.isFolder) {
      await markTicketSharePointFolderMissing(attachment.ticket.id);
      throw new Error("Pasta SharePoint da tarefa não encontrada.");
    }

    const item = await uploadFileToFolder(
      driveId,
      ticket.sharePointFolderId,
      attachment.filename,
      buffer,
      attachment.fileType,
    );
    await prisma.ticketAttachment.update({
      where: { id: attachmentId },
      data: {
        sharePointItemId: item.id,
        sharePointWebUrl: item.webUrl,
        sharePointETag: item.eTag,
        syncSource: "flowa",
        syncedAt: new Date(),
      },
    });
  } catch (err) {
    logSharePointError(`pushAttachmentToSharePoint ${attachmentId}`, err);
  }
}

const uploadsTicketsDir = join(getUploadsRoot(), "tickets");

async function ensureUploadsDir(): Promise<void> {
  if (!existsSync(uploadsTicketsDir)) {
    await mkdir(uploadsTicketsDir, { recursive: true });
  }
}

export async function syncTicketAttachmentsFromSharePoint(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      sharePointFolderId: true,
      sharePointDeltaLink: true,
      createdById: true,
      project: { select: { client: { select: { id: true, tenantId: true } } } },
    },
  });
  const clientId = ticket?.project?.client?.id;
  if (!ticket?.sharePointFolderId || !clientId) return;

  const cfg = await getSharePointClientConfig(clientId);
  if (!isSharePointIntegrationActive(cfg)) return;

  try {
    const { driveId } = await resolveSiteDrive(cfg!);
    const folderItem = await getDriveItemById(driveId, ticket.sharePointFolderId);
    if (!folderItem?.isFolder) {
      await markTicketSharePointFolderMissing(ticketId);
      return;
    }

    const delta = await listDriveFolderDelta(
      driveId,
      ticket.sharePointFolderId,
      ticket.sharePointDeltaLink,
    );

    if (delta.deltaLink) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { sharePointDeltaLink: delta.deltaLink },
      });
    }

    const files = delta.items.filter((i) => !i.isFolder && i.name);
    if (files.length === 0) return;

    const existing = await prisma.ticketAttachment.findMany({
      where: { ticketId },
      select: { id: true, sharePointItemId: true, sharePointETag: true, filename: true },
    });
    const byItemId = new Map(existing.filter((e) => e.sharePointItemId).map((e) => [e.sharePointItemId!, e]));
    const byName = new Map(existing.map((e) => [e.filename.toLowerCase(), e]));

    await ensureUploadsDir();
    const fallbackUserId = ticket.createdById;
    const tenantId = ticket.project.client.tenantId;

    for (const file of files) {
      const known = byItemId.get(file.id);
      if (known && known.sharePointETag === file.eTag) continue;

      if (known) {
        await prisma.ticketAttachment.update({
          where: { id: known.id },
          data: {
            sharePointETag: file.eTag,
            sharePointWebUrl: file.webUrl,
            syncedAt: new Date(),
          },
        });
        continue;
      }

      const dupByName = byName.get(file.name.toLowerCase());
      if (dupByName?.sharePointItemId) continue;

      const buffer = await downloadDriveItemContent(driveId, file.id);
      const timestamp = Date.now();
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueFileName = `${ticketId}-sp-${timestamp}-${sanitized}`;
      await writeFile(join(uploadsTicketsDir, uniqueFileName), buffer);

      const userId =
        fallbackUserId ??
        (
          await prisma.user.findFirst({
            where: { tenantId, role: "SUPER_ADMIN" },
            select: { id: true },
          })
        )?.id;
      if (!userId) continue;

      await prisma.ticketAttachment.create({
        data: {
          ticketId,
          userId,
          filename: file.name,
          fileUrl: `/uploads/tickets/${uniqueFileName}`,
          fileType: file.fileMime || "application/octet-stream",
          fileSize: file.size ?? buffer.length,
          sharePointItemId: file.id,
          sharePointWebUrl: file.webUrl,
          sharePointETag: file.eTag,
          syncSource: "sharepoint",
          syncedAt: new Date(),
        },
      });

      await prisma.ticketHistory.create({
        data: {
          ticketId,
          userId,
          action: "ATTACHMENT_ADDED",
          field: null,
          oldValue: null,
          newValue: file.name,
          details: `Anexo "${file.name}" sincronizado do SharePoint`,
        },
      }).catch(() => undefined);
    }
  } catch (err) {
    if (isSharePointNotFoundError(err)) {
      await markTicketSharePointFolderMissing(ticketId);
      return;
    }
    logSharePointError(`syncTicketAttachmentsFromSharePoint ${ticketId}`, err);
  }
}

export function scheduleSharePointJob(fn: () => Promise<void>): void {
  void fn().catch((err) => logSharePointError("background job", err));
}

export async function runSharePointPollingCycle(): Promise<void> {
  if (!isMicrosoftGraphConfigured()) return;

  const tenants = await prisma.tenant.findMany({
    where: { sharePointEnabled: true },
    select: { id: true },
  });
  if (tenants.length === 0) return;

  for (const t of tenants) {
    const tickets = await prisma.ticket.findMany({
      where: {
        sharePointFolderId: { not: null },
        project: { client: { tenantId: t.id } },
        type: { not: "SUBPROJETO" },
      },
      select: { id: true },
      take: 200,
      orderBy: { updatedAt: "desc" },
    });
    for (const ticket of tickets) {
      await syncTicketAttachmentsFromSharePoint(ticket.id);
    }
  }
}
