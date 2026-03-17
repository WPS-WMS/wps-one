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

export type UserRole = "ADMIN" | "GESTOR_PROJETOS" | "CONSULTOR" | "CLIENTE";

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

const rawSecret = process.env.JWT_SECRET || "dev-secret-change-in-production";

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-in-production")) {
  // Em produção, é obrigatório configurar um JWT_SECRET forte via variável de ambiente.
  // Não lançamos erro aqui para não quebrar o boot em ambientes parcialmente configurados,
  // mas registramos um alerta claro no log.
  console.warn(
    '[SECURITY] JWT_SECRET não configurado corretamente em produção. Defina uma variável de ambiente JWT_SECRET com um valor forte e secreto.'
  );
}

const secret = rawSecret;

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
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
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
