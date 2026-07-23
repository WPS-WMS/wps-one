import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Garante um ContractType com o mesmo nome do vínculo empregatício do usuário (PJ, CLT…).
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

/**
 * Resolve o profissional principal de um fornecedor (vínculo multi ou legado).
 * Prefere o primeiro usuário que tenha employmentType preenchido.
 */
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
  const links = await db.supplierUserLink.findMany({
    where: { supplierId, user: { tenantId, role: { not: "CLIENTE" } } },
    orderBy: { createdAt: "asc" },
    select: {
      user: { select: { id: true, name: true, employmentType: true } },
    },
  });
  const fromLinks = links.map((l) => l.user);
  const preferred =
    fromLinks.find((u) => Boolean(u.employmentType?.trim())) ?? fromLinks[0] ?? null;
  if (preferred) {
    const contractTypeId = await resolveContractTypeIdFromEmploymentType(
      tenantId,
      preferred.employmentType,
      db,
    );
    return {
      professionalUserId: preferred.id,
      name: preferred.name,
      employmentType: preferred.employmentType,
      contractTypeId,
    };
  }

  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: {
      linkedUser: { select: { id: true, name: true, employmentType: true } },
    },
  });
  if (!supplier?.linkedUser) return null;
  const contractTypeId = await resolveContractTypeIdFromEmploymentType(
    tenantId,
    supplier.linkedUser.employmentType,
    db,
  );
  return {
    professionalUserId: supplier.linkedUser.id,
    name: supplier.linkedUser.name,
    employmentType: supplier.linkedUser.employmentType,
    contractTypeId,
  };
}
