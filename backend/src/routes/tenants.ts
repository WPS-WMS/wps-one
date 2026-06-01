import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken } from "../lib/auth.js";
import rateLimit from "express-rate-limit";
import { errorSummary } from "../lib/devLog.js";
import { isTenantSignupAllowed } from "../lib/deployEnv.js";

export const tenantsRouter = Router();

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de cadastro. Tente novamente em alguns minutos." },
});

/**
 * Cadastro de novo tenant (organização) com usuário admin inicial.
 * Em produção: desativado salvo `TENANT_SIGNUP_SECRET` + header `X-Tenant-Signup-Key`.
 */
tenantsRouter.post("/signup", signupLimiter, async (req, res) => {
  if (!isTenantSignupAllowed(req)) {
    res.status(404).json({ error: "Não encontrado" });
    return;
  }
  try {
    const { tenantName, tenantSlug, email, name, password } = req.body;
    if (!tenantName || !tenantSlug || !email || !name || !password) {
      res.status(400).json({
        error: "Nome da empresa, slug, e-mail, nome e senha são obrigatórios",
      });
      return;
    }
    const slug = String(tenantSlug).trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({
        error: "Slug deve conter apenas letras minúsculas, números e hífens",
      });
      return;
    }
    const emailNorm = String(email).trim().toLowerCase();

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });
    if (existingTenant) {
      res.status(400).json({ error: "Já existe uma organização com este slug" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const tenant = await prisma.tenant.create({
      data: {
        name: String(tenantName).trim(),
        slug,
      },
    });

    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        name: String(name).trim(),
        passwordHash,
        role: "SUPER_ADMIN",
        tenantId: tenant.id,
        cargo: "Administrador",
        cargaHorariaSemanal: 40,
      },
    });

    await prisma.activity.createMany({
      data: [
        { name: "Desenvolvimento", tenantId: tenant.id },
        { name: "Configuração", tenantId: tenant.id },
        { name: "Reunião", tenantId: tenant.id },
        { name: "Consultoria", tenantId: tenant.id },
      ],
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "SUPER_ADMIN",
      tenantId: user.tenantId,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    });
  } catch (err) {
    console.error("POST /api/tenants/signup error:", errorSummary(err));
    res.status(500).json({ error: "Erro ao criar organização" });
  }
});
