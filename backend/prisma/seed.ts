import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("123456", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "wps-consult" },
    update: {},
    create: {
      name: "WPS Consult",
      slug: "wps-consult",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: "admin@wpsconsult.com.br", tenantId: tenant.id } },
    update: {},
    create: {
      email: "admin@wpsconsult.com.br",
      name: "Administrador",
      passwordHash: hash,
      role: "ADMIN",
      tenantId: tenant.id,
      cargo: "Administrador",
      cargaHorariaSemanal: 40,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
    },
  });

  const gestor = await prisma.user.upsert({
    where: { email_tenantId: { email: "gestor@wpsconsult.com.br", tenantId: tenant.id } },
    update: {
      // Data de aniversário de exemplo (mês/dia) para o portal colaborativo em QA
      birthDate: new Date("1988-04-15T12:00:00.000Z"),
    },
    create: {
      email: "gestor@wpsconsult.com.br",
      name: "Gestor de Projetos",
      passwordHash: hash,
      role: "GESTOR_PROJETOS",
      tenantId: tenant.id,
      cargo: "Gestor de Projetos",
      cargaHorariaSemanal: 40,
      birthDate: new Date("1988-04-15T12:00:00.000Z"),
    },
  });

  const consultor = await prisma.user.upsert({
    where: { email_tenantId: { email: "andre.nunes@wpsconsult.com.br", tenantId: tenant.id } },
    update: {
      birthDate: new Date("1992-04-22T12:00:00.000Z"),
    },
    create: {
      email: "andre.nunes@wpsconsult.com.br",
      name: "André Nunes",
      passwordHash: hash,
      role: "CONSULTOR",
      tenantId: tenant.id,
      cargo: "Consultor",
      cargaHorariaSemanal: 40,
      permitirMaisHoras: false,
      permitirFimDeSemana: false,
      permitirOutroPeriodo: false,
      diasPermitidos: '["seg","ter","qua","qui","sex"]',
      birthDate: new Date("1992-04-22T12:00:00.000Z"),
    },
  });

  const cliente = await prisma.user.upsert({
    where: { email_tenantId: { email: "almir@dellamed.com.br", tenantId: tenant.id } },
    update: {},
    create: {
      email: "almir@dellamed.com.br",
      name: "Almir",
      passwordHash: hash,
      role: "CLIENTE",
      tenantId: tenant.id,
      cargo: "Gestor",
    },
  });

  let dellamed = await prisma.client.findFirst({
    where: { name: "Dellamed", tenantId: tenant.id },
  });
  if (!dellamed) dellamed = await prisma.client.create({
    data: { name: "Dellamed", tenantId: tenant.id },
  });

  let herc = await prisma.client.findFirst({
    where: { name: "HERC", tenantId: tenant.id },
  });
  if (!herc) herc = await prisma.client.create({
    data: { name: "HERC", tenantId: tenant.id },
  });

  await prisma.clientUser.upsert({
    where: { userId_clientId: { userId: cliente.id, clientId: dellamed.id } },
    update: {},
    create: { userId: cliente.id, clientId: dellamed.id },
  });

  let projetoAms = await prisma.project.findFirst({
    where: { name: "03/2024 - Projeto AMS", clientId: dellamed.id },
  });
  if (!projetoAms) {
    projetoAms = await prisma.project.create({
      data: {
        name: "03/2024 - Projeto AMS",
        clientId: dellamed.id,
        createdById: admin.id,
      },
    });
  }

  let projeto09 = await prisma.project.findFirst({
    where: { name: "PRJ 09/2026 - EF", clientId: herc.id },
  });
  if (!projeto09) {
    projeto09 = await prisma.project.create({
      data: {
        name: "PRJ 09/2026 - EF",
        clientId: herc.id,
        createdById: admin.id,
      },
    });
  }

  const atividadesNomes = [
    "Reunião com cliente",
    "Mapeamento de Processo",
    "Configuração",
    "Desenvolvimento ABAP",
    "Desenvolvimento Fiori",
    "Debug de apoio ao funcional",
    "Teste funcional",
    "Documentação de Configuração",
    "Documentação de teste funcional",
    "Especificação técnica",
    "Especificação Funcional",
    "Suporte GO LIVE",
    "Suporte em PRD",
    "Atividade de cutover",
    "Atividades de garantia",
    "Estudos (Somente IDLE)",
    "Atividades de marketing",
    "Atividades Administrativas",
    "Atividades de Gestão",
    "Plantão",
  ];
  const atividadesExistentes = await prisma.activity.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  const nomesDesejados = new Set(atividadesNomes);
  const idsParaRemover = atividadesExistentes
    .filter((a) => !nomesDesejados.has(a.name))
    .map((a) => a.id);
  if (idsParaRemover.length > 0) {
    await prisma.timeEntry.updateMany({
      where: { activityId: { in: idsParaRemover } },
      data: { activityId: null },
    });
    await prisma.activity.deleteMany({ where: { id: { in: idsParaRemover } } });
  }
  for (const nome of atividadesNomes) {
    const existe = await prisma.activity.findFirst({
      where: { name: nome, tenantId: tenant.id },
    });
    if (!existe) await prisma.activity.create({ data: { name: nome, tenantId: tenant.id } });
  }

  const t338 = await prisma.ticket.findFirst({
    where: { code: "338", projectId: projetoAms.id },
  });
  if (!t338) {
    await prisma.ticket.create({
      data: {
        code: "338",
        title: "DELLAMED - PRJ AMS - Configurar depósito MM",
        type: "Configuração",
        status: "EXECUCAO",
        projectId: projetoAms.id,
        assignedToId: gestor.id,
      },
    });
  }

  const t339 = await prisma.ticket.findFirst({
    where: { code: "339", projectId: projetoAms.id },
  });
  if (!t339) {
    await prisma.ticket.create({
      data: {
        code: "339",
        title: "DELLAMED - PRJ AMS - Configurar estratégia de armazenagem",
        type: "Configuração",
        status: "EXECUCAO",
        projectId: projetoAms.id,
        assignedToId: gestor.id,
      },
    });
  }

  // Portal colaborativo: seções padrão por tenant (slugs usados pelo front)
  const portalSections = [
    { slug: "noticias", title: "Notícias", order: 0 },
    { slug: "colaborador-do-mes", title: "WPSer do mês", order: 1 },
    { slug: "premios", title: "Pontos de Inspiração", order: 2 },
    { slug: "manuais", title: "Manuais e documentos", order: 3 },
  ];
  for (const ps of portalSections) {
    await prisma.portalSection.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: ps.slug } },
      create: {
        tenantId: tenant.id,
        slug: ps.slug,
        title: ps.title,
        order: ps.order,
      },
      update: { title: ps.title, order: ps.order },
    });
  }

  const t391 = await prisma.ticket.findFirst({
    where: { code: "391", projectId: projeto09.id },
  });
  if (!t391) {
    await prisma.ticket.create({
      data: {
        code: "391",
        title: "HERC - PRJ 09/2026 - EF",
        type: "Desenvolvimento",
        status: "ABERTO",
        projectId: projeto09.id,
      },
    });
  }

  console.log("Seed executado com sucesso!");
  console.log("Tenant: WPS Consult (wps-consult)");
  console.log("Usuários: admin@wpsconsult.com.br, gestor@wpsconsult.com.br, andre.nunes@wpsconsult.com.br, almir@dellamed.com.br");
  console.log("Senha: 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
