/**
 * Cria ou atualiza um usuário com perfil PLATFORM_ADMIN (painel /platform).
 *
 * Uso:
 *   npx tsx scripts/create-platform-admin.ts
 *   npx tsx scripts/create-platform-admin.ts --email admin.plataforma@wps.com --password 'SenhaForte!' --tenant-slug wps-consult
 *
 * Defaults: email platform@wps.com / senha Platform@2026! / tenant wps-consult (ou o primeiro existente)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const email = String(argValue("--email") || "platform@wps.com").trim().toLowerCase();
  const password = String(argValue("--password") || "Platform@2026!");
  const name = String(argValue("--name") || "Admin Plataforma WPS").trim();
  const tenantSlug = String(argValue("--tenant-slug") || "wps-consult").trim().toLowerCase();

  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  }
  if (!tenant) {
    throw new Error("Nenhum tenant encontrado. Crie um tenant antes (signup ou seed).");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role: "PLATFORM_ADMIN",
        tenantId: tenant.id,
        passwordHash,
        mustChangePassword: false,
        ativo: true,
        cargo: "Admin da plataforma",
      },
    });
    console.log("Usuário atualizado para PLATFORM_ADMIN:");
    console.log(`  id: ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`  senha: (redefinida)`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "PLATFORM_ADMIN",
      tenantId: tenant.id,
      cargo: "Admin da plataforma",
      mustChangePassword: false,
      ativo: true,
      cargaHorariaSemanal: 40,
    },
  });

  console.log("Usuário PLATFORM_ADMIN criado:");
  console.log(`  id: ${user.id}`);
  console.log(`  email: ${email}`);
  console.log(`  senha: ${password}`);
  console.log(`  tenant: ${tenant.name} (${tenant.slug})`);
  console.log("Login redireciona para /platform");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
