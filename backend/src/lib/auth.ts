import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type UserRole = "SUPER_ADMIN" | "ADMIN_PORTAL" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE";

/** Mesmas regras operacionais de projetos/tickets que o consultor (incl. Dashboard Daily "Todos"). */
export function isConsultantLikeRole(role: string | undefined | null): boolean {
  return role === "CONSULTOR" || role === "ADMIN_PORTAL";
}

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

const rawSecret = process.env.JWT_SECRET || "dev-secret-change-in-production";
const secret = rawSecret;

function validateJwtSecretOrThrow() {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-in-production") {
    throw new Error(
      "[SECURITY] JWT_SECRET ausente/invalidado em produção. Defina JWT_SECRET com um valor forte e secreto.",
    );
  }
  // Defesa em profundidade: tamanho mínimo para evitar segredo fraco.
  if (String(process.env.JWT_SECRET).trim().length < 32) {
    throw new Error("[SECURITY] JWT_SECRET muito curto em produção (mínimo recomendado: 32 caracteres).");
  }
}

validateJwtSecretOrThrow();

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.wps_token || null;
  const token = bearer || cookieToken;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token inválido ou expirado" });
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
      ativo: true,
      inativadoEm: true,
    },
  });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }
  if (user.ativo === false) {
    res.status(403).json({
      error: "Não autorizado. Entre em contato com o administrador.",
    });
    return;
  }
  req.user = user;
  next();
}
