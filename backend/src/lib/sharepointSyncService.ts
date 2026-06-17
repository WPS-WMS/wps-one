import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { prisma } from "./prisma.js";
import { isMicrosoftGraphConfigured } from "./microsoftGraphAuth.js";
import {
  createChildFolder,
  downloadDriveItemContent,
  ensureDriveFolderPath,
  listDriveFolderDelta,
  logSharePointError,
  resolveSiteAndDrive,
  uploadFileToFolder,
} from "./sharepointDrive.js";
import { projectSharePointFolderName, ticketSharePointFolderName } from "./sharepointPaths.js";
import { getUploadsRoot } from "./uploadsRoot.js";

export type SharePointTenantConfig = {
  enabled: boolean;
  siteUrl: string | null;
  driveId: string | null;
  rootFolderPath: string;
  rootFolderItemId: string | null;
};

export async function getSharePointTenantConfig(tenantId: string): Promise<SharePointTenantConfig | null> {
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
  };
}

export function isSharePointIntegrationActive(cfg: SharePointTenantConfig | null): boolean {
  return !!(
    cfg?.enabled &&
    cfg.siteUrl &&
    isMicrosoftGraphConfigured()
  );
}

async function resolveTenantDrive(cfg: SharePointTenantConfig): Promise<{ driveId: string; siteId: string }> {
  if (!cfg.siteUrl) throw new Error("Site SharePoint não configurado.");
  const resolved = await resolveSiteAndDrive(cfg.siteUrl, cfg.driveId);
  if (cfg.driveId !== resolved.driveId) {
    // cache drive id when descoberto pela primeira vez
    await prisma.tenant.updateMany({
      where: { sharePointSiteUrl: cfg.siteUrl },
      data: { sharePointDriveId: resolved.driveId },
    });
  }
  return resolved;
}

async function ensureTenantProjectsRoot(tenantId: string, cfg: SharePointTenantConfig): Promise<string> {
  if (cfg.rootFolderItemId) return cfg.rootFolderItemId;

  const { driveId } = await resolveTenantDrive(cfg);
  const rootFolder = await ensureDriveFolderPath(driveId, cfg.rootFolderPath);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { sharePointRootFolderItemId: rootFolder.id },
  });
  return rootFolder.id;
}

export async function provisionProjectSharePointFolder(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      sharePointFolderId: true,
      client: { select: { name: true, tenantId: true } },
    },
  });
  if (!project?.client?.tenantId) return;
  if (project.sharePointFolderId) return;

  const cfg = await getSharePointTenantConfig(project.client.tenantId);
  if (!isSharePointIntegrationActive(cfg)) return;

  try {
    const rootItemId = await ensureTenantProjectsRoot(project.client.tenantId, cfg!);
    const { driveId } = await resolveTenantDrive(cfg!);
    const folderName = projectSharePointFolderName(project.client.name, project.name);
    const folder = await createChildFolder(driveId, rootItemId, folderName);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        sharePointFolderId: folder.id,
        sharePointFolderUrl: folder.webUrl,
        sharePointSyncStatus: "OK",
        sharePointSyncError: null,
      },
    });
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
}

export async function provisionTicketSharePointFolder(ticketId: string): Promise<void> {
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
          client: { select: { tenantId: true, name: true } },
        },
      },
    },
  });
  if (!ticket) return;
  if (String(ticket.type ?? "").trim() === "SUBPROJETO") return;
  if (ticket.sharePointFolderId) return;

  const tenantId = ticket.project?.client?.tenantId;
  if (!tenantId) return;

  const cfg = await getSharePointTenantConfig(tenantId);
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

    const { driveId } = await resolveTenantDrive(cfg!);
    const folderName = ticketSharePointFolderName(ticket.code, ticket.title);
    const folder = await createChildFolder(driveId, project.sharePointFolderId, folderName);
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        sharePointFolderId: folder.id,
        sharePointFolderUrl: folder.webUrl,
        sharePointSyncStatus: "OK",
        sharePointSyncError: null,
      },
    });
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
          project: { select: { client: { select: { tenantId: true } } } },
        },
      },
    },
  });
  if (!attachment?.ticket?.project?.client?.tenantId) return;
  if (attachment.sharePointItemId) return;

  const cfg = await getSharePointTenantConfig(attachment.ticket.project.client.tenantId);
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

    const { driveId } = await resolveTenantDrive(cfg!);
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
      project: { select: { client: { select: { tenantId: true } } } },
    },
  });
  if (!ticket?.sharePointFolderId || !ticket.project?.client?.tenantId) return;

  const cfg = await getSharePointTenantConfig(ticket.project.client.tenantId);
  if (!isSharePointIntegrationActive(cfg)) return;

  try {
    const { driveId } = await resolveTenantDrive(cfg!);
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
            where: { tenantId: ticket.project.client.tenantId, role: "SUPER_ADMIN" },
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
    logSharePointError(`syncTicketAttachmentsFromSharePoint ${ticketId}`, err);
  }
}

export function scheduleSharePointJob(fn: () => Promise<void>): void {
  void fn().catch((err) => logSharePointError("background job", err));
}

export async function runSharePointPollingCycle(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { sharePointEnabled: true, sharePointSiteUrl: { not: null } },
    select: { id: true },
  });
  if (tenants.length === 0) return;
  if (!isMicrosoftGraphConfigured()) return;

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
