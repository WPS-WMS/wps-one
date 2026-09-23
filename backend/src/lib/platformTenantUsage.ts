import { prisma } from "./prisma.js";

export type TenantUsageSnapshot = {
  usersTotal: number;
  usersActive: number;
  /** Usuários ativos cobráveis (exclui PLATFORM_ADMIN e CLIENTE). */
  billableUsersActive: number;
  projects: number;
  storageBytes: number;
  lastActivityAt: string | null;
};

const NON_BILLABLE_ROLES = ["PLATFORM_ADMIN", "CLIENTE"] as const;

async function sumAttachmentBytes(tenantId: string): Promise<number> {
  const [reimbursement, payable, receivable, supplier, ticket, contract] = await Promise.all([
    prisma.reimbursementAttachment.aggregate({
      where: { reimbursement: { tenantId } },
      _sum: { fileSize: true },
    }),
    prisma.payableAttachment.aggregate({
      where: { payable: { tenantId } },
      _sum: { fileSize: true },
    }),
    prisma.receivableAttachment.aggregate({
      where: { receivable: { tenantId } },
      _sum: { fileSize: true },
    }),
    prisma.supplierAttachment.aggregate({
      where: { supplier: { tenantId } },
      _sum: { fileSize: true },
    }),
    prisma.ticketAttachment.aggregate({
      where: { ticket: { project: { client: { tenantId } } } },
      _sum: { fileSize: true },
    }),
    prisma.projectContractAttachment.aggregate({
      where: { contract: { tenantId } },
      _sum: { fileSize: true },
    }),
  ]);

  return (
    (reimbursement._sum.fileSize ?? 0) +
    (payable._sum.fileSize ?? 0) +
    (receivable._sum.fileSize ?? 0) +
    (supplier._sum.fileSize ?? 0) +
    (ticket._sum.fileSize ?? 0) +
    (contract._sum.fileSize ?? 0)
  );
}

async function resolveLastActivityAt(tenantId: string): Promise<string | null> {
  const [user, timeEntry, ticket] = await Promise.all([
    prisma.user.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.timeEntry.findFirst({
      where: { user: { tenantId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.ticket.findFirst({
      where: { project: { client: { tenantId } } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const dates = [user?.updatedAt, timeEntry?.createdAt, ticket?.updatedAt].filter(
    (d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()),
  );

  if (dates.length === 0) return null;
  const max = dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  return max.toISOString();
}

export async function getTenantUsageSnapshot(tenantId: string): Promise<TenantUsageSnapshot> {
  const [usersTotal, usersActive, billableUsersActive, projects, storageBytes, lastActivityAt] =
    await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, ativo: true } }),
      prisma.user.count({
        where: {
          tenantId,
          ativo: true,
          role: { notIn: [...NON_BILLABLE_ROLES] },
        },
      }),
      prisma.project.count({ where: { client: { tenantId } } }),
      sumAttachmentBytes(tenantId),
      resolveLastActivityAt(tenantId),
    ]);

  return {
    usersTotal,
    usersActive,
    billableUsersActive,
    projects,
    storageBytes,
    lastActivityAt,
  };
}

/**
 * Snapshot em lote para listagens da plataforma.
 * Uma leitura de users + projects (sem storage/lastActivity — esses ficam no detalhe).
 */
export async function getTenantUsageSnapshotsForList(
  tenantIds: string[],
): Promise<Map<string, TenantUsageSnapshot>> {
  const map = new Map<string, TenantUsageSnapshot>();
  for (const id of tenantIds) {
    map.set(id, {
      usersTotal: 0,
      usersActive: 0,
      billableUsersActive: 0,
      projects: 0,
      storageBytes: 0,
      lastActivityAt: null,
    });
  }
  if (tenantIds.length === 0) return map;

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, ativo: true, role: true },
    }),
    prisma.project.findMany({
      where: { client: { tenantId: { in: tenantIds } } },
      select: { client: { select: { tenantId: true } } },
    }),
  ]);

  for (const u of users) {
    const row = map.get(u.tenantId);
    if (!row) continue;
    row.usersTotal += 1;
    if (u.ativo) {
      row.usersActive += 1;
      if (!(NON_BILLABLE_ROLES as readonly string[]).includes(u.role)) {
        row.billableUsersActive += 1;
      }
    }
  }

  for (const p of projects) {
    const tenantId = p.client?.tenantId;
    if (!tenantId) continue;
    const row = map.get(tenantId);
    if (row) row.projects += 1;
  }

  return map;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}
