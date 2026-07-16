/**
 * Remove CRs de projeto órfãs (sem receita vinculada / receita CANCELADO)
 * e CRs do projeto DELLAMED | AMS.
 * Uso: npx tsx scripts/cleanup-orphan-project-receivables.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function dispose(receivableId: string, userId: string) {
  const receivable = await prisma.receivable.findUnique({
    where: { id: receivableId },
    include: { installments: { select: { id: true, status: true } } },
  });
  if (!receivable || receivable.status === "CANCELADO") return;
  const hasReceived = receivable.installments.some((i) => i.status === "RECEBIDO");
  await prisma.$transaction(async (tx) => {
    await tx.receivableInstallment.updateMany({
      where: { receivableId: receivable.id, status: { not: "RECEBIDO" } },
      data: { status: "CANCELADO" },
    });
    await tx.receivable.update({
      where: { id: receivable.id },
      data: {
        status: hasReceived ? "RECEBIDO" : "CANCELADO",
        projectRevenueId: null,
        updatedById: userId,
      },
    });
    await tx.receivableHistory.create({
      data: {
        receivableId: receivable.id,
        userId,
        action: "CANCEL",
        details: "Cancelada por limpeza (receita de projeto removida).",
      },
    });
  });
  console.log("cancelled", receivable.id, receivable.description);
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, tenantId: true },
  });
  if (!admin) throw new Error("Nenhum admin encontrado.");

  const orphans = await prisma.receivable.findMany({
    where: {
      tenantId: admin.tenantId,
      status: { not: "CANCELADO" },
      AND: [
        { OR: [{ sourceType: "PROJECT_REVENUE" }, { kind: "PROJETO" }] },
        {
          OR: [{ projectRevenueId: null }, { projectRevenue: { status: "CANCELADO" } }],
        },
      ],
    },
    select: { id: true, description: true },
  });
  console.log("orphans", orphans.length);

  const ams = await prisma.project.findFirst({
    where: {
      name: { contains: "AMS", mode: "insensitive" },
      client: { tenantId: admin.tenantId, name: { contains: "Dellamed", mode: "insensitive" } },
    },
    select: { id: true, name: true },
  });
  console.log("ams project", ams);

  const amsReceivables = ams
    ? await prisma.receivable.findMany({
        where: {
          tenantId: admin.tenantId,
          projectId: ams.id,
          status: { not: "CANCELADO" },
        },
        select: { id: true, description: true, status: true, totalAmountCents: true },
      })
    : [];
  console.log("ams receivables", amsReceivables);

  const byClientProject = await prisma.receivable.findMany({
    where: {
      tenantId: admin.tenantId,
      status: { not: "CANCELADO" },
      client: { name: { equals: "Dellamed", mode: "insensitive" } },
      project: { name: { contains: "AMS", mode: "insensitive" } },
    },
    select: { id: true, description: true, status: true, totalAmountCents: true },
  });
  console.log("dellamed+ams receivables", byClientProject);

  const ids = new Set([
    ...orphans.map((r) => r.id),
    ...amsReceivables.map((r) => r.id),
    ...byClientProject.map((r) => r.id),
  ]);
  for (const id of ids) {
    await dispose(id, admin.id);
  }
  console.log("done", ids.size);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
