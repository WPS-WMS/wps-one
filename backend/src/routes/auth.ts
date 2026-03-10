import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyPassword, signToken } from "../lib/auth.js";
import crypto from "crypto";

export const authRouter = Router();

type RateLimitState = {
  count: number;
  resetAt: number;
};

const loginRateLimitStore = new Map<string, RateLimitState>();
const forgotRateLimitStore = new Map<string, RateLimitState>();

function checkRateLimit(store: Map<string, RateLimitState>, key: string, windowMs: number, max: number) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= max) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  store.set(key, current);
  return { allowed: true };
}

function debugLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    debugLog("[AUTH] Login attempt");
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const rateKey = `login:${ip}`;
    const rate = checkRateLimit(loginRateLimitStore, rateKey, 15 * 60 * 1000, 30); // 30 tentativas / 15min
    if (!rate.allowed) {
      res
        .status(429)
        .json({ error: "Muitas tentativas de login. Tente novamente em alguns minutos." });
      return;
    }

    if (!email || !password) {
      debugLog("[AUTH] Missing email or password");
      res.status(400).json({ error: "E-mail e senha são obrigatórios" });
      return;
    }
    const user = await prisma.user.findFirst({
      where: { email: String(email).trim().toLowerCase(), ativo: true },
    });
    if (!user) {
      debugLog("[AUTH] User not found");
      res.status(401).json({ error: "E-mail ou senha inválidos" });
      return;
    }
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      debugLog("[AUTH] Invalid password");
      res.status(401).json({ error: "E-mail ou senha inválidos" });
      return;
    }
    debugLog("[AUTH] Login successful");
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "ADMIN" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE",
      tenantId: user.tenantId,
    });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        mustChangePassword: user.mustChangePassword ?? true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// Para verificar token (frontend chama para validar sessão)
authRouter.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const { verifyToken } = await import("../lib/auth.js");
  const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Token inválido" });
      return;
    }
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      cargo: true,
      cargaHorariaSemanal: true,
      limiteHorasDiarias: true,
      limiteHorasPorDia: true,
      permitirMaisHoras: true,
      permitirFimDeSemana: true,
      permitirOutroPeriodo: true,
      diasPermitidos: true,
      mustChangePassword: true,
    },
  });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(user);
});

// Endpoint para iniciar fluxo de recuperação de senha.
// Gera um token de reset e (em produção) enviaria um e-mail ao usuário.
authRouter.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const rateKey = `forgot:${ip}`;
    const rate = checkRateLimit(forgotRateLimitStore, rateKey, 60 * 60 * 1000, 10); // 10 pedidos / hora
    if (!rate.allowed) {
      res
        .status(429)
        .json({ error: "Muitas tentativas de recuperação de senha. Tente novamente mais tarde." });
      return;
    }
    if (!email) {
      res.status(400).json({ error: "E-mail é obrigatório" });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    // Mesmo que o usuário não exista, retornamos sucesso para não expor usuários válidos.
    if (!user) {
      res.json({
        ok: true,
        message:
          "Se o e-mail existir em nossa base, você receberá instruções para criar uma nova senha.",
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    const token = crypto.randomUUID();

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        used: false,
      },
    });

    // Aqui, em produção, integrar com serviço de e-mail (SendGrid, SES, etc)
    // Ex.: enviar link: `${process.env.APP_URL}/reset-password?token=${token}`
    if (process.env.NODE_ENV !== "production") {
      console.log("[AUTH] Password reset token generated for", normalizedEmail, "token:", token);
    }

    res.json({
      ok: true,
      message:
        "Se o e-mail existir em nossa base, você receberá instruções para criar uma nova senha.",
    });
  } catch (err) {
    console.error("[AUTH] forgot-password error", err);
    res.status(500).json({ error: "Erro ao iniciar recuperação de senha" });
  }
});
