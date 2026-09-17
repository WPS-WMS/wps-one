/**
 * Popula Contas a Pagar e Contas a Receber fictícias para um tenant QA.
 *
 *   npx tsx scripts/seed-qa-finance-demo.ts --tenantId=cmu2r81ct0000kf21sighb2wx
 */
import { PrismaClient } from "@prisma/client";
import { seedFinanceiroDefaultsForTenant } from "../src/lib/financeiroSeedDefaults.js";

const prisma = new PrismaClient();
const TAG = "[QA-Finance]";
const TENANT_DEFAULT = "cmu2r81ct0000kf21sighb2wx";

function arg(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length).trim() : null;
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function daysFromToday(delta: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

async function main() {
  const tenantId = arg("tenantId") || TENANT_DEFAULT;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    console.error(`${TAG} Tenant ${tenantId} não encontrado.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${TAG} Tenant: ${tenant.name} (${tenant.slug})`);

  const admin =
    (await prisma.user.findFirst({
      where: { tenantId, role: "SUPER_ADMIN", ativo: true },
      select: { id: true, name: true },
    })) ||
    (await prisma.user.findFirst({
      where: { tenantId, ativo: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }));
  if (!admin) throw new Error("Tenant sem usuário admin.");

  await seedFinanceiroDefaultsForTenant(tenantId);

  const [expenseAccounts, revenueAccounts, costCenters, clients, projects, suppliersExisting] =
    await Promise.all([
      prisma.financialAccount.findMany({
        where: { tenantId, type: "DESPESA", isActive: true },
        select: { id: true, name: true },
      }),
      prisma.financialAccount.findMany({
        where: { tenantId, type: "RECEITA", isActive: true },
        select: { id: true, name: true },
      }),
      prisma.costCenter.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.client.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: { client: { tenantId } },
        select: { id: true, name: true, clientId: true },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        where: { tenantId, status: "ATIVO" },
        select: { id: true, nomeApelido: true },
      }),
    ]);

  const accByName = (list: { id: string; name: string }[], name: string) =>
    list.find((a) => a.name === name) ?? list[0];
  const cc =
    costCenters.find((c) => c.name === "Operação SAP") ??
    costCenters.find((c) => c.name === "Administrativo") ??
    costCenters[0];
  if (!cc) throw new Error("Sem centro de custo — rode defaults financeiros.");

  const expenseCusto = accByName(expenseAccounts, "Custo")!;
  const expenseSoftware = accByName(expenseAccounts, "Software")!;
  const expenseInfra = accByName(expenseAccounts, "Infraestrutura")!;
  const expenseMarketing = accByName(expenseAccounts, "Marketing")!;
  const expenseImpostos = accByName(expenseAccounts, "Impostos")!;
  const expenseParceiros = accByName(expenseAccounts, "Parceiros")!;

  const revAms = accByName(revenueAccounts, "Receita de suporte AMS")!;
  const revTm = accByName(revenueAccounts, "Receita T&M")!;
  const revFechado = accByName(revenueAccounts, "Receita de projeto fechado")!;
  const revConsultoria = accByName(revenueAccounts, "Receita consultoria")!;

  let category = await prisma.supplierCategory.findFirst({
    where: { tenantId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    category = await prisma.supplierCategory.create({
      data: { tenantId, name: "Consultoria", isActive: true },
      select: { id: true },
    });
  }

  const supplierDefs = [
    {
      nomeApelido: `${TAG} CloudHost Brasil`,
      razaoSocial: "CloudHost Brasil Tecnologia Ltda",
      cnpjCpf: "12.345.678/0001-90",
      email: "financeiro@cloudhost.demo",
    },
    {
      nomeApelido: `${TAG} Oficina Criativa`,
      razaoSocial: "Oficina Criativa Marketing ME",
      cnpjCpf: "23.456.789/0001-01",
      email: "contato@oficinacriativa.demo",
    },
    {
      nomeApelido: `${TAG} SoftLicenças SA`,
      razaoSocial: "SoftLicenças Software S.A.",
      cnpjCpf: "34.567.890/0001-12",
      email: "billing@softlicencas.demo",
    },
    {
      nomeApelido: `${TAG} Parceiro Norte Eng`,
      razaoSocial: "Parceiro Norte Engenharia Ltda",
      cnpjCpf: "45.678.901/0001-23",
      email: "nf@parceironorte.demo",
    },
  ];

  const suppliers = [...suppliersExisting];
  for (const def of supplierDefs) {
    let s = await prisma.supplier.findFirst({
      where: { tenantId, nomeApelido: def.nomeApelido },
      select: { id: true, nomeApelido: true },
    });
    if (!s) {
      s = await prisma.supplier.create({
        data: {
          tenantId,
          personType: "PJ",
          nomeApelido: def.nomeApelido,
          razaoSocial: def.razaoSocial,
          cnpjCpf: def.cnpjCpf,
          email: def.email,
          categoryId: category.id,
          status: "ATIVO",
          cidade: "Curitiba",
          estado: "PR",
        },
        select: { id: true, nomeApelido: true },
      });
    }
    if (!suppliers.some((x) => x.id === s!.id)) suppliers.push(s);
  }
  console.log(`${TAG} Fornecedores: ${suppliers.length}`);

  // Remove lançamentos anteriores deste seed (idempotente)
  const oldPayables = await prisma.payable.findMany({
    where: { tenantId, notes: { startsWith: TAG } },
    select: { id: true },
  });
  if (oldPayables.length) {
    const ids = oldPayables.map((p) => p.id);
    await prisma.payableAttachment.deleteMany({ where: { payableId: { in: ids } } });
    await prisma.payableHistory.deleteMany({ where: { payableId: { in: ids } } });
    await prisma.payableAllocation.deleteMany({ where: { payableId: { in: ids } } });
    await prisma.payableInstallment.deleteMany({ where: { payableId: { in: ids } } });
    await prisma.payable.deleteMany({ where: { id: { in: ids } } });
  }
  const oldReceivables = await prisma.receivable.findMany({
    where: { tenantId, notes: { startsWith: TAG } },
    select: { id: true },
  });
  if (oldReceivables.length) {
    const ids = oldReceivables.map((r) => r.id);
    await prisma.receivableAttachment.deleteMany({ where: { receivableId: { in: ids } } });
    await prisma.receivableHistory.deleteMany({ where: { receivableId: { in: ids } } });
    await prisma.receivableAllocation.deleteMany({ where: { receivableId: { in: ids } } });
    await prisma.receivableInvoice.deleteMany({ where: { receivableId: { in: ids } } });
    await prisma.receivableInstallment.deleteMany({ where: { receivableId: { in: ids } } });
    await prisma.receivable.deleteMany({ where: { id: { in: ids } } });
  }

  type PayableSeed = {
    description: string;
    amountCents: number;
    accountId: string;
    supplierIdx: number;
    dueOffset: number;
    competence: Date;
    status: "ABERTO" | "PAGO" | "VENCIDO";
    paymentMethod: string;
    projectId?: string | null;
  };

  const projectForClient = (partial: string) =>
    projects.find((p) => {
      const c = clients.find((cl) => cl.id === p.clientId);
      return c?.name.toLowerCase().includes(partial.toLowerCase());
    }) ?? null;

  const pAtlas = projectForClient("Atlas");
  const pCosta = projectForClient("Costa Brava");
  const pPorto = projectForClient("Porto");
  const pShopping = projectForClient("Shopping");
  const pSerra = projectForClient("Serra Azul");

  const payableSeeds: PayableSeed[] = [
    {
      description: "Hospedagem cloud — produção (set/2026)",
      amountCents: 189900,
      accountId: expenseInfra.id,
      supplierIdx: 0,
      dueOffset: 12,
      competence: utcDate(2026, 9, 1),
      status: "ABERTO",
      paymentMethod: "BOLETO",
    },
    {
      description: "Campanha LinkedIn Ads — captação comercial",
      amountCents: 320000,
      accountId: expenseMarketing.id,
      supplierIdx: 1,
      dueOffset: 5,
      competence: utcDate(2026, 9, 1),
      status: "ABERTO",
      paymentMethod: "CARTAO_CREDITO",
    },
    {
      description: "Licenças Microsoft 365 — 12 usuários",
      amountCents: 248000,
      accountId: expenseSoftware.id,
      supplierIdx: 2,
      dueOffset: -3,
      competence: utcDate(2026, 8, 1),
      status: "VENCIDO",
      paymentMethod: "BOLETO",
    },
    {
      description: "Parceiro — medição obra Serra Azul (ago/2026)",
      amountCents: 450000,
      accountId: expenseParceiros.id,
      supplierIdx: 3,
      dueOffset: -18,
      competence: utcDate(2026, 8, 1),
      status: "PAGO",
      paymentMethod: "TED",
      projectId: pSerra?.id ?? null,
    },
    {
      description: "Internet dedicada escritório",
      amountCents: 49900,
      accountId: expenseInfra.id,
      supplierIdx: 0,
      dueOffset: 20,
      competence: utcDate(2026, 9, 1),
      status: "ABERTO",
      paymentMethod: "PIX",
    },
    {
      description: "Material gráfico — apresentação comercial",
      amountCents: 87500,
      accountId: expenseMarketing.id,
      supplierIdx: 1,
      dueOffset: -10,
      competence: utcDate(2026, 8, 15),
      status: "PAGO",
      paymentMethod: "PIX",
    },
    {
      description: "DAS / impostos estimados set/2026",
      amountCents: 612000,
      accountId: expenseImpostos.id,
      supplierIdx: 0,
      dueOffset: 8,
      competence: utcDate(2026, 9, 1),
      status: "ABERTO",
      paymentMethod: "BOLETO",
    },
    {
      description: "Suporte N2 parceiro — AMS Atlas",
      amountCents: 280000,
      accountId: expenseCusto.id,
      supplierIdx: 3,
      dueOffset: 15,
      competence: utcDate(2026, 9, 1),
      status: "ABERTO",
      paymentMethod: "TED",
      projectId: pAtlas?.id ?? null,
    },
  ];

  let payablesCreated = 0;
  for (const seed of payableSeeds) {
    const supplier = suppliers[seed.supplierIdx % suppliers.length]!;
    const dueDate = daysFromToday(seed.dueOffset);
    const paidAt = seed.status === "PAGO" ? daysFromToday(seed.dueOffset - 2) : null;
    const installmentStatus = seed.status === "PAGO" ? "PAGO" : seed.status === "VENCIDO" ? "VENCIDO" : "ABERTO";

    await prisma.payable.create({
      data: {
        tenantId,
        supplierId: supplier.id,
        payeeName: supplier.nomeApelido,
        financialAccountId: seed.accountId,
        description: seed.description,
        totalAmountCents: seed.amountCents,
        competenceDate: seed.competence,
        paymentMethod: seed.paymentMethod,
        kind: "MANUAL",
        status: seed.status,
        createdById: admin.id,
        notes: `${TAG} Conta a pagar demonstrativa`,
        installments: {
          create: {
            installmentNumber: 1,
            dueDate,
            amountCents: seed.amountCents,
            status: installmentStatus,
            paidAt,
          },
        },
        allocations: {
          create: {
            costCenterId: cc.id,
            projectId: seed.projectId ?? null,
            percentBps: 10000,
            amountCents: seed.amountCents,
          },
        },
        history: {
          create: {
            userId: admin.id,
            action: "CREATE",
            details: `${TAG} Seed financeiro QA`,
          },
        },
      },
    });
    payablesCreated += 1;
  }
  console.log(`${TAG} Contas a pagar: ${payablesCreated}`);

  type ReceivableSeed = {
    description: string;
    amountCents: number;
    accountId: string;
    clientId: string;
    projectId?: string | null;
    dueOffset: number;
    competence: Date;
    status: "PREVISTO" | "FATURADO" | "RECEBIDO" | "ATRASADO";
    paymentMethod: string;
    withInvoice?: boolean;
  };

  const clientByPartial = (partial: string) =>
    clients.find((c) => c.name.toLowerCase().includes(partial.toLowerCase()));

  const cAtlas = clientByPartial("Atlas");
  const cCosta = clientByPartial("Costa Brava");
  const cPorto = clientByPartial("Porto");
  const cShopping = clientByPartial("Shopping");
  const cSerra = clientByPartial("Serra Azul");

  if (!cAtlas || !cCosta || !cPorto || !cShopping || !cSerra) {
    console.warn(
      `${TAG} Alguns clientes demo não encontrados. Usando fallback nos disponíveis (${clients.length}).`,
    );
  }

  const pickClient = (preferred: typeof cAtlas, idx: number) =>
    preferred ?? clients[idx % Math.max(clients.length, 1)]!;

  const receivableSeeds: ReceivableSeed[] = [
    {
      description: "AMS — Gestão acadêmica Atlas — mensalidade set/2026",
      amountCents: 1800000,
      accountId: revAms.id,
      clientId: pickClient(cAtlas, 0).id,
      projectId: pAtlas?.id ?? null,
      dueOffset: 10,
      competence: utcDate(2026, 9, 1),
      status: "FATURADO",
      paymentMethod: "BOLETO",
      withInvoice: true,
    },
    {
      description: "T&M — Implantação PMS Costa Brava — horas ago/2026",
      amountCents: 960000,
      accountId: revTm.id,
      clientId: pickClient(cCosta, 1).id,
      projectId: pCosta?.id ?? null,
      dueOffset: -5,
      competence: utcDate(2026, 8, 1),
      status: "ATRASADO",
      paymentMethod: "PIX",
      withInvoice: true,
    },
    {
      description: "Portal do cliente Porto & Vale — marco 2 (entrega docs)",
      amountCents: 2500000,
      accountId: revFechado.id,
      clientId: pickClient(cPorto, 2).id,
      projectId: pPorto?.id ?? null,
      dueOffset: 25,
      competence: utcDate(2026, 9, 1),
      status: "PREVISTO",
      paymentMethod: "TED",
    },
    {
      description: "ERP Shopping Parque das Águas — parcela 1/3",
      amountCents: 4200000,
      accountId: revFechado.id,
      clientId: pickClient(cShopping, 3).id,
      projectId: pShopping?.id ?? null,
      dueOffset: -20,
      competence: utcDate(2026, 7, 1),
      status: "RECEBIDO",
      paymentMethod: "BOLETO",
      withInvoice: true,
    },
    {
      description: "Acompanhamento obra Serra Azul — medição set/2026",
      amountCents: 1350000,
      accountId: revConsultoria.id,
      clientId: pickClient(cSerra, 4).id,
      projectId: pSerra?.id ?? null,
      dueOffset: 7,
      competence: utcDate(2026, 9, 1),
      status: "FATURADO",
      paymentMethod: "PIX",
      withInvoice: true,
    },
    {
      description: "Consultoria — workshop go-live Costa Brava",
      amountCents: 540000,
      accountId: revConsultoria.id,
      clientId: pickClient(cCosta, 1).id,
      projectId: pCosta?.id ?? null,
      dueOffset: 18,
      competence: utcDate(2026, 9, 15),
      status: "PREVISTO",
      paymentMethod: "TED",
    },
    {
      description: "AMS Atlas — horas extras homologação boletim",
      amountCents: 720000,
      accountId: revAms.id,
      clientId: pickClient(cAtlas, 0).id,
      projectId: pAtlas?.id ?? null,
      dueOffset: -12,
      competence: utcDate(2026, 8, 1),
      status: "RECEBIDO",
      paymentMethod: "PIX",
      withInvoice: true,
    },
    {
      description: "ERP Shopping — parcela 2/3 (contratos e faturamento)",
      amountCents: 4200000,
      accountId: revFechado.id,
      clientId: pickClient(cShopping, 3).id,
      projectId: pShopping?.id ?? null,
      dueOffset: 30,
      competence: utcDate(2026, 9, 1),
      status: "PREVISTO",
      paymentMethod: "BOLETO",
    },
  ];

  let receivablesCreated = 0;
  for (let i = 0; i < receivableSeeds.length; i++) {
    const seed = receivableSeeds[i]!;
    const dueDate = daysFromToday(seed.dueOffset);
    const receivedAt = seed.status === "RECEBIDO" ? daysFromToday(seed.dueOffset - 3) : null;
    const installmentStatus =
      seed.status === "RECEBIDO"
        ? "RECEBIDO"
        : seed.status === "ATRASADO"
          ? "ATRASADO"
          : seed.status === "FATURADO"
            ? "FATURADO"
            : "PREVISTO";

    const net = Math.round(seed.amountCents * 0.94);
    const tax = seed.amountCents - net;

    const created = await prisma.receivable.create({
      data: {
        tenantId,
        clientId: seed.clientId,
        projectId: seed.projectId ?? null,
        financialAccountId: seed.accountId,
        description: seed.description,
        totalAmountCents: seed.amountCents,
        netAmountCents: seed.withInvoice ? net : seed.amountCents,
        taxAmountCents: seed.withInvoice ? tax : 0,
        competenceDate: seed.competence,
        paymentMethod: seed.paymentMethod,
        kind: "MANUAL",
        status: seed.status,
        createdById: admin.id,
        notes: `${TAG} Conta a receber demonstrativa`,
        contractTitle: `DEMO-${2026}-${String(i + 1).padStart(2, "0")}`,
        installments: {
          create: {
            installmentNumber: 1,
            dueDate,
            amountCents: seed.amountCents,
            status: installmentStatus,
            receivedAt,
          },
        },
        allocations: {
          create: {
            costCenterId: cc.id,
            projectId: seed.projectId ?? null,
            percentBps: 10000,
            amountCents: seed.amountCents,
          },
        },
        history: {
          create: {
            userId: admin.id,
            action: "CREATE",
            details: `${TAG} Seed financeiro QA`,
          },
        },
        ...(seed.withInvoice
          ? {
              invoice: {
                create: {
                  nfNumber: String(1000 + i),
                  nfSeries: "1",
                  emissionDate: daysFromToday(seed.dueOffset - 15),
                  grossAmountCents: seed.amountCents,
                  netAmountCents: net,
                  taxAmountCents: tax,
                  retentionAmountCents: 0,
                },
              },
            }
          : {}),
      },
    });
    void created;
    receivablesCreated += 1;
  }
  console.log(`${TAG} Contas a receber: ${receivablesCreated}`);
  console.log(`${TAG} Concluído.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
