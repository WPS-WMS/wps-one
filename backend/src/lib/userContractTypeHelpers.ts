import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Garante um ContractType com o mesmo nome do vínculo empregatício (legado).
 * Preferir `Supplier.contractTypeId` para novos fluxos.
 */
export async function resolveContractTypeIdFromEmploymentType(
  tenantId: string,
  employmentTypeRaw: string | null | undefined,
  db: Db = prisma,
): Promise<string | null> {
  const employmentType = String(employmentTypeRaw ?? "")
    .trim()
    .toUpperCase();
  if (!employmentType) return null;

  const existingType = await db.contractType.findFirst({
    where: {
      tenantId,
      name: { equals: employmentType, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existingType) return existingType.id;

  const createdType = await db.contractType.upsert({
    where: { tenantId_name: { tenantId, name: employmentType } },
    create: { tenantId, name: employmentType, isActive: true },
    update: { isActive: true },
    select: { id: true },
  });
  return createdType.id;
}

/** Tipo de contrato cadastrado no fornecedor. */
export async function resolveContractTypeFromSupplierId(
  tenantId: string,
  supplierId: string,
  db: Db = prisma,
): Promise<string | null> {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { contractTypeId: true },
  });
  return supplier?.contractTypeId ?? null;
}

export async function listSupplierIdsForProfessional(
  tenantId: string,
  userId: string,
  db: Db = prisma,
): Promise<string[]> {
  const [links, legacy] = await Promise.all([
    db.supplierUserLink.findMany({
      where: { userId, supplier: { tenantId } },
      select: { supplierId: true },
    }),
    db.supplier.findFirst({
      where: { tenantId, linkedUserId: userId },
      select: { id: true },
    }),
  ]);
  const ids = new Set<string>(links.map((row) => row.supplierId));
  if (legacy?.id) ids.add(legacy.id);
  return [...ids];
}

/** Completa o fornecedor só quando há um único vínculo; se houver vários, exige seleção. */
export async function completeSupplierIdForProfessional(
  tenantId: string,
  professionalUserId: string,
  supplierId: string | null | undefined,
  db: Db = prisma,
): Promise<{ supplierId: string | null; error?: string }> {
  if (supplierId) return { supplierId };
  const ids = await listSupplierIdsForProfessional(tenantId, professionalUserId, db);
  if (ids.length === 1) return { supplierId: ids[0]! };
  if (ids.length > 1) {
    return {
      supplierId: null,
      error:
        "Este profissional está vinculado a mais de um fornecedor. Selecione o fornecedor.",
    };
  }
  return { supplierId: null };
}

export async function resolveContractTypeFromUserId(
  tenantId: string,
  userId: string,
  db: Db = prisma,
): Promise<{
  professionalUserId: string;
  name: string | null;
  employmentType: string | null;
  contractTypeId: string | null;
} | null> {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId, role: { not: "CLIENTE" } },
    select: { id: true, name: true, employmentType: true },
  });
  if (!user) return null;
  const contractTypeId = await resolveContractTypeIdFromEmploymentType(
    tenantId,
    user.employmentType,
    db,
  );
  return {
    professionalUserId: user.id,
    name: user.name,
    employmentType: user.employmentType,
    contractTypeId,
  };
}

/** Resolve o profissional principal de um fornecedor (vínculo multi ou legado). */
export async function resolveProfessionalFromSupplierId(
  tenantId: string,
  supplierId: string,
  db: Db = prisma,
): Promise<{
  professionalUserId: string;
  name: string | null;
  employmentType: string | null;
  contractTypeId: string | null;
} | null> {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: {
      contractTypeId: true,
      linkedUser: { select: { id: true, name: true, employmentType: true } },
    },
  });
  if (!supplier) return null;

  const links = await db.supplierUserLink.findMany({
    where: { supplierId, user: { tenantId, role: { not: "CLIENTE" } } },
    orderBy: { createdAt: "asc" },
    select: {
      user: { select: { id: true, name: true, employmentType: true } },
    },
  });
  const fromLinks = links.map((l) => l.user);
  const preferred = fromLinks[0] ?? supplier.linkedUser ?? null;
  if (!preferred) {
    return supplier.contractTypeId
      ? {
          professionalUserId: "",
          name: null,
          employmentType: null,
          contractTypeId: supplier.contractTypeId,
        }
      : null;
  }

  return {
    professionalUserId: preferred.id,
    name: preferred.name,
    employmentType: preferred.employmentType,
    contractTypeId: supplier.contractTypeId,
  };
}
