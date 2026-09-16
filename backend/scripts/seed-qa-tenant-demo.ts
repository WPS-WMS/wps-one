/**
 * Popula um tenant QA com clientes, usuários, projetos, tópicos, tarefas e apontamentos.
 *
 *   npx tsx scripts/seed-qa-tenant-demo.ts --tenantId=cmu2r81ct0000kf21sighb2wx
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TAG = "[QA-Seed]";

function arg(name: string): string | null {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length).trim() : null;
}

function utcAt(d: Date, hour = 12): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
}

/** Segunda a sexta da semana civil anterior (UTC). */
function lastWeekdays(): Date[] {
  const today = new Date();
  const day = today.getUTCDay(); // 0=dom
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  thisMonday.setUTCHours(12, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(lastMonday);
    d.setUTCDate(lastMonday.getUTCDate() + i);
    return utcAt(d);
  });
}

function topicCode(): string {
  return `tp_${randomBytes(10).toString("hex")}`;
}

async function nextTaskCode(tenantId: string): Promise<() => string> {
  const rows = await prisma.ticket.findMany({
    where: {
      type: { not: "SUBPROJETO" },
      project: { client: { tenantId } },
    },
    select: { code: true },
  });
  let max = 99999;
  for (const r of rows) {
    const n = Number(String(r.code).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  let current = Math.max(max, 99999);
  return () => {
    current += 1;
    return String(current);
  };
}

async function nextPermissionCode(tenantId: string): Promise<{ seq: number; code: string }> {
  const row = await prisma.tenantCounter.upsert({
    where: { tenantId_key: { tenantId, key: "timeEntryPermissionRequest" } },
    create: { tenantId, key: "timeEntryPermissionRequest", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  const seq = row.value;
  return { seq, code: `PERM-${String(seq).padStart(6, "0")}` };
}

async function main() {
  const tenantId = arg("tenantId") || "cmu2r81ct0000kf21sighb2wx";
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    const all = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true }, take: 20 });
    console.error(`Tenant ${tenantId} não encontrado nesta DATABASE_URL.`);
    console.error("Tenants visíveis:");
    for (const t of all) console.error(`  ${t.id} | ${t.slug} | ${t.name}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} Tenant: ${tenant.name} (${tenant.slug})`);

  const admin =
    (await prisma.user.findFirst({
      where: { tenantId, role: "SUPER_ADMIN", ativo: true },
      select: { id: true, email: true, name: true },
    })) ||
    (await prisma.user.findFirst({
      where: { tenantId, ativo: true },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "asc" },
    }));
  if (!admin) throw new Error("Tenant sem usuários base (admin).");

  const passwordHash = await bcrypt.hash("Demo@123456", 10);
  const userDefs = [
    { name: "Ana Souza", role: "CONSULTOR", email: `ana.souza.${tenant.slug}@demo.wpsone.local` },
    { name: "Bruno Lima", role: "CONSULTOR", email: `bruno.lima.${tenant.slug}@demo.wpsone.local` },
    { name: "Carla Mendes", role: "CONSULTOR", email: `carla.mendes.${tenant.slug}@demo.wpsone.local` },
    { name: "Diego Alves", role: "CONSULTOR", email: `diego.alves.${tenant.slug}@demo.wpsone.local` },
    { name: "Elena Rocha", role: "GESTOR_PROJETOS", email: `elena.rocha.${tenant.slug}@demo.wpsone.local` },
    { name: "Felipe Nunes", role: "CONSULTOR", email: `felipe.nunes.${tenant.slug}@demo.wpsone.local` },
    { name: "Gabriela Dias", role: "CONSULTOR_ONDEMAND", email: `gabriela.dias.${tenant.slug}@demo.wpsone.local` },
    { name: "Hugo Martins", role: "CONSULTOR", email: `hugo.martins.${tenant.slug}@demo.wpsone.local` },
  ];

  const users = [];
  for (const def of userDefs) {
    const existing = await prisma.user.findUnique({ where: { email: def.email } });
    if (existing) {
      if (existing.tenantId !== tenantId) {
        throw new Error(`E-mail ${def.email} já existe em outro tenant.`);
      }
      users.push(existing);
      continue;
    }
    const u = await prisma.user.create({
      data: {
        email: def.email,
        name: def.name,
        passwordHash,
        role: def.role,
        tenantId,
        cargo: def.role === "GESTOR_PROJETOS" ? "Gestor de Projetos" : "Consultor",
        cargaHorariaSemanal: 40,
        limiteHorasDiarias: 8,
        permitirMaisHoras: false,
        permitirFimDeSemana: false,
        permitirOutroPeriodo: false,
        violacaoApontamentoModo: "ENVIAR_APROVACAO",
        diasPermitidos: '["seg","ter","qua","qui","sex"]',
        mustChangePassword: false,
        ativo: true,
      },
    });
    users.push(u);
  }
  console.log(`${TAG} Usuários: ${users.length} (senha Demo@123456)`);

  const clientNames = [
    `${TAG} Cliente Aurora`,
    `${TAG} Cliente Horizon`,
    `${TAG} Cliente Nexus`,
    `${TAG} Cliente Vertex`,
  ];
  const clients = [];
  for (const name of clientNames) {
    let c = await prisma.client.findFirst({ where: { tenantId, name } });
    if (!c) c = await prisma.client.create({ data: { tenantId, name } });
    clients.push(c);
  }
  console.log(`${TAG} Clientes: ${clients.length}`);

  let activity = await prisma.activity.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
  });
  if (!activity) {
    activity = await prisma.activity.create({
      data: { tenantId, name: "Desenvolvimento", isActive: true },
    });
  }

  const projectNames = [
    `${TAG} AMS Operação`,
    `${TAG} Implantação ERP`,
    `${TAG} Portal Cliente`,
    `${TAG} Integração WMS`,
    `${TAG} Sustentação N2`,
  ];
  const taskCounts = [12, 8, 7, 6, 5];
  const tipos = ["AMS", "FIXED_PRICE", "INTERNO", "TIME_MATERIAL", "AMS"] as const;

  const projects = [];
  for (let i = 0; i < projectNames.length; i++) {
    const name = projectNames[i]!;
    let p = await prisma.project.findFirst({
      where: { name, clientId: clients[i % clients.length]!.id },
    });
    if (!p) {
      p = await prisma.project.create({
        data: {
          name,
          description: `Projeto gerado para popular QA — ${name}`,
          clientId: clients[i % clients.length]!.id,
          createdById: admin.id,
          tipoProjeto: tipos[i],
          operacaoAtivo: tipos[i] === "AMS",
          statusInicial: "EM_ANDAMENTO",
          dataInicio: utcAt(new Date(Date.now() - 40 * 86400000)),
          dataFimPrevista: utcAt(new Date(Date.now() + 50 * 86400000)),
          totalHorasPlanejadas: 160,
        },
      });
    }
    for (const u of [admin, ...users]) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: p.id, userId: u.id } },
        update: {},
        create: { projectId: p.id, userId: u.id },
      });
    }
    projects.push(p);
  }
  console.log(`${TAG} Projetos: ${projects.length}`);

  const nextCode = await nextTaskCode(tenantId);
  const statuses = ["ABERTO", "EXECUCAO", "EXECUCAO", "AGUARDANDO", "ENCERRADO"];
  const criticidades = ["BAIXA", "MEDIA", "MEDIA", "ALTA"];
  const types = ["Configuração", "Desenvolvimento", "Suporte", "Análise", "Teste"];

  let topicsCreated = 0;
  let tasksCreated = 0;
  const allTasks: { id: string; projectId: string }[] = [];

  for (let pi = 0; pi < projects.length; pi++) {
    const project = projects[pi]!;
    const topics = [];
    for (let t = 0; t < 2; t++) {
      const title = `${TAG} Tópico ${t + 1} — ${project.name.replace(TAG + " ", "")}`;
      let topic = await prisma.ticket.findFirst({
        where: { projectId: project.id, type: "SUBPROJETO", title },
      });
      if (!topic) {
        topic = await prisma.ticket.create({
          data: {
            code: topicCode(),
            title,
            description: "Tópico demonstrativo QA",
            type: "SUBPROJETO",
            status: "ABERTO",
            projectId: project.id,
            createdById: admin.id,
            assignedToId: users[pi % users.length]!.id,
          },
        });
        topicsCreated += 1;
      }
      topics.push(topic);
    }

    const nTasks = taskCounts[pi] ?? 5;
    for (let ti = 0; ti < nTasks; ti++) {
      const topic = topics[ti % 2]!;
      const assignee = users[(pi + ti) % users.length]!;
      const title = `${TAG} Tarefa ${ti + 1}/${nTasks} — ${project.name.replace(TAG + " ", "")}`;
      let task = await prisma.ticket.findFirst({
        where: { projectId: project.id, title, type: { not: "SUBPROJETO" } },
      });
      if (!task) {
        task = await prisma.ticket.create({
          data: {
            code: nextCode(),
            title,
            description: "Tarefa demonstrativa para QA / prints.",
            type: types[ti % types.length]!,
            status: statuses[ti % statuses.length]!,
            criticidade: criticidades[ti % criticidades.length]!,
            projectId: project.id,
            parentTicketId: topic.id,
            createdById: admin.id,
            assignedToId: assignee.id,
            dataInicio: utcAt(new Date(Date.now() - (10 + ti) * 86400000)),
            dataFimPrevista: utcAt(new Date(Date.now() + (5 + ti) * 86400000)),
            estimativaHoras: 4 + (ti % 8),
            progresso: statuses[ti % statuses.length] === "ENCERRADO" ? 100 : 15 + ti * 5,
          },
        });
        await prisma.ticketResponsible.create({
          data: { ticketId: task.id, userId: assignee.id },
        });
        tasksCreated += 1;
      }
      allTasks.push({ id: task.id, projectId: project.id });
    }
  }
  console.log(`${TAG} Tópicos novos: ${topicsCreated}; Tarefas novas: ${tasksCreated}`);

  // Limpa apontamentos/pedidos anteriores deste seed
  await prisma.timeEntryPermissionRequest.deleteMany({
    where: { tenantId, justification: { startsWith: TAG } },
  });
  await prisma.timeEntry.deleteMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      description: { startsWith: TAG },
    },
  });

  const weekDays = lastWeekdays();
  let entries = 0;
  let pendingReqs = 0;

  for (let ui = 0; ui < users.length; ui++) {
    const user = users[ui]!;
    for (let di = 0; di < weekDays.length; di++) {
      const day = weekDays[di]!;
      const task = allTasks[(ui * 5 + di) % allTasks.length]!;
      const slots =
        di === 0
          ? [{ start: "08:00", end: "12:00", hours: 4 }]
          : [
              { start: "08:30", end: "12:30", hours: 4 },
              { start: "13:30", end: "17:30", hours: 4 },
            ];
      for (const slot of slots) {
        await prisma.timeEntry.create({
          data: {
            date: day,
            horaInicio: slot.start,
            horaFim: slot.end,
            totalHoras: slot.hours,
            description: `${TAG} Apontamento semana anterior`,
            userId: user.id,
            projectId: task.projectId,
            ticketId: task.id,
            activityId: activity.id,
          },
        });
        entries += 1;
      }
    }

    // 1–2 pedidos pendentes de aprovação (acima do limite / fim de semana)
    const needApproval = ui < 5 ? 2 : 1;
    for (let p = 0; p < needApproval; p++) {
      const task = allTasks[(ui + p) % allTasks.length]!;
      const weekend = new Date(weekDays[0]!);
      weekend.setUTCDate(weekend.getUTCDate() - 2); // sábado da semana passada
      const date = p === 0 ? utcAt(weekend) : weekDays[2]!;
      const violationRule = p === 0 ? "FIM_DE_SEMANA_FERIADO" : "MAIS_HORAS";
      const { seq, code } = await nextPermissionCode(tenantId);
      await prisma.timeEntryPermissionRequest.create({
        data: {
          tenantId,
          seq,
          code,
          userId: user.id,
          status: "PENDING",
          justification: `${TAG} Preciso de aprovação do admin para este apontamento (${violationRule}).`,
          date,
          horaInicio: p === 0 ? "09:00" : "18:00",
          horaFim: p === 0 ? "13:00" : "21:00",
          totalHoras: 4,
          description: `${TAG} Apontamento aguardando aprovação`,
          projectId: task.projectId,
          ticketId: task.id,
          activityId: activity.id,
          violationRule,
        },
      });
      pendingReqs += 1;
    }
  }

  console.log(`${TAG} Apontamentos criados: ${entries}`);
  console.log(`${TAG} Pedidos PENDING: ${pendingReqs}`);
  console.log(`${TAG} Concluído. Usuários demo: senha Demo@123456`);
  console.log(`${TAG} Ex.: ${users[0]?.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
