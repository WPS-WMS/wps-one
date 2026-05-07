import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Em ambientes como Render + Neon, o DB pode “dormir”/oscilar.
 * Conectamos com retry para reduzir falhas transitórias (P1001).
 */
export async function ensurePrismaConnected(options?: {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}) {
  const maxAttempts = options?.maxAttempts ?? 8;
  const initialDelayMs = options?.initialDelayMs ?? 400;
  const maxDelayMs = options?.maxDelayMs ?? 8000;

  // Se não houver env, falha cedo com mensagem mais clara (sem vazar segredo).
  const hasDbUrl = Boolean(String(process.env.DATABASE_URL || "").trim());
  if (!hasDbUrl) {
    throw new Error("DATABASE_URL não configurado (env ausente).");
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as any)?.code;
      const retryable = code === "P1001";
      const delay = Math.min(maxDelayMs, Math.round(initialDelayMs * 2 ** (attempt - 1)));

      // Log enxuto (Render) sem imprimir URLs/credenciais.
      console.error(
        `[DB] Falha ao conectar (tentativa ${attempt}/${maxAttempts})` +
          (code ? ` code=${String(code)}` : "") +
          (retryable ? ` — retry em ${delay}ms` : ""),
      );

      if (!retryable) throw err;
      if (attempt === maxAttempts) break;
      await sleep(delay);
    }
  }

  throw lastErr;
}
