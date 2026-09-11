import { prisma } from "./prisma.js";

export type TenantUsageSnapshot = {
  usersTotal: number;
  usersActive: number;
  clients: number;
  projects: number;
  tickets: number;
  timeEntries: number;
  reimbursements: number;
  payables: number;
  receivables: number;
  storageBytes: number;
  lastActivityAt: string | null;
};

async function sumAttachmentBytes(tenantId: string): Promise<number> {
  const [
    reimbursement,
    payable,
    receivable,
    supplier,
    ticket,
    contract,
  ] = await Promise.all([
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
  const [user, timeEntry, ticket, reimbursement] = await Promise.all([
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
    prisma.reimbursement.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const dates = [
    user?.updatedAt,
    timeEntry?.createdAt,
    ticket?.updatedAt,
    reimbursement?.createdAt,
  ].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));

  if (dates.length === 0) return null;
  const max = dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  return max.toISOString();
}

export async function getTenantUsageSnapshot(tenantId: string): Promise<TenantUsageSnapshot> {
  const [
    usersTotal,
    usersActive,
    clients,
    projects,
    tickets,
    timeEntries,
    reimbursements,
    payables,
    receivables,
    storageBytes,
    lastActivityAt,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, ativo: true } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.project.count({ where: { client: { tenantId } } }),
    prisma.ticket.count({ where: { project: { client: { tenantId } } } }),
    prisma.timeEntry.count({ where: { user: { tenantId } } }),
    prisma.reimbursement.count({ where: { tenantId } }),
    prisma.payable.count({ where: { tenantId } }),
    prisma.receivable.count({ where: { tenantId } }),
    sumAttachmentBytes(tenantId),
    resolveLastActivityAt(tenantId),
  ]);

  return {
    usersTotal,
    usersActive,
    clients,
    projects,
    tickets,
    timeEntries,
    reimbursements,
    payables,
    receivables,
    storageBytes,
    lastActivityAt,
  };
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
