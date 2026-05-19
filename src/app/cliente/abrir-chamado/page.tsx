import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AbrirChamadoForm } from "./AbrirChamadoForm";

function fmt(n: number) {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const TIPOS = [
  "Bug em PRD",
  "Melhoria",
  "Treinamento",
  "Garantia",
  "Dúvida",
];

const CRITICIDADES = ["Baixa", "Média", "Alta", "Urgente"];

export default async function AbrirChamadoPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const clientUsers = await prisma.clientUser.findMany({
    where: { userId: user.id },
    include: {
      client: {
        include: { projects: true },
      },
    },
  });

  const clients = clientUsers.map((cu) => cu.client);

  const projectIds = clients.flatMap((c) => c.projects).map((p) => p.id);
  const mesAgg = await prisma.timeEntry.aggregate({
    where: {
      projectId: { in: projectIds },
      date: { gte: monthStart, lte: monthEnd },
    },
    _sum: { totalHoras: true },
  });

  const horasConsumidas = fmt(mesAgg._sum.totalHoras ?? 0);
  const mesAno = `${now.toLocaleDateString("pt-BR", { month: "long" })}/${now.getFullYear()}`;

  return (
    <div className="flex-1">
      <header className="bg-slate-800/50 border-b border-slate-700 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">
          Horas consumidas em {mesAno}: {horasConsumidas}
        </h2>
      </header>
      <main className="p-6">
        <AbrirChamadoForm
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
          }))}
          tipos={TIPOS}
          criticidades={CRITICIDADES}
        />
      </main>
    </div>
  );
}
