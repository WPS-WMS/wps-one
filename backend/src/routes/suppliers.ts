import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireAnyFeature, requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { errorSummary } from "../lib/devLog.js";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { TICKET_ATTACHMENT_MAX_BYTES, ticketAttachmentMaxSizeError } from "../lib/ticketAttachmentLimits.js";
import { existsSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join, normalize, sep } from "path";
import {
  buildSupplierHistoryEntries,
  documentValidationError,
  parseSupplierWriteBody,
  SUPPLIER_FIELD_LABELS,
  validateDocument,
} from "../lib/supplierHelpers.js";

export const suppliersRouter = Router();
suppliersRouter.use(authMiddleware);

const FEATURE = "financeiro.fornecedores" as const;
const SUPPLIER_SELECT_FEATURES = [
  "financeiro.fornecedores",
  "financeiro.contasPagar",
  "financeiro.lancamentos",
] as const;

const uploadsDir = join(getUploadsRoot(), "suppliers");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch((e) =>
    console.error("[suppliers] mkdir uploads", errorSummary(e)),
  );
}

function mapSupplierListRow(row: {
  id: string;
  personType: string;
  nomeApelido: string;
  razaoSocial: string | null;
  cnpjCpf: string;
  status: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  linkedUserId?: string | null;
  linkedUser?: { id: string; name: string; email: string } | null;
  linkedUsers?: { id: string; name: string; email: string }[];
  category: { id: string; name: string; allowMultipleUsers?: boolean } | null;
  _count: { attachments: number };
}) {
  const linkedUsers =
    row.linkedUsers ??
    (row.linkedUser ? [row.linkedUser] : []);
  return {
    id: row.id,
    personType: row.personType,
    nomeApelido: row.nomeApelido,
    razaoSocial: row.razaoSocial,
    cnpjCpf: row.cnpjCpf,
    status: row.status,
    email: row.email,
    telefone: row.telefone,
    cidade: row.cidade,
    estado: row.estado,
    linkedUserId: linkedUsers[0]?.id ?? row.linkedUserId ?? null,
    linkedUser: linkedUsers[0] ?? row.linkedUser ?? null,
    linkedUserIds: linkedUsers.map((u) => u.id),
    linkedUsers,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    categoryAllowMultipleUsers: Boolean(row.category?.allowMultipleUsers),
    attachmentsCount: row._count.attachments,
  };
}

function mapSupplierDetail(row: {
  id: string;
  personType: string;
  nomeApelido: string;
  razaoSocial: string | null;
  cnpjCpf: string;
  ie: string | null;
  ieIsento: boolean;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  email: string | null;
  telefone: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pixKey: string | null;
  contatoFinNome: string | null;
  contatoFinEmail: string | null;
  contatoFinCel: string | null;
  contatoTecNome: string | null;
  contatoTecEmail: string | null;
  contatoTecCel: string | null;
  categoryId: string | null;
  linkedUserId: string | null;
  status: string;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; allowMultipleUsers?: boolean } | null;
  linkedUser: { id: string; name: string; email: string } | null;
  userLinks?: Array<{ user: { id: string; name: string; email: string } }>;
  _count: { attachments: number; history: number };
}) {
  const linkedUsers =
    row.userLinks?.map((l) => l.user) ??
    (row.linkedUser ? [row.linkedUser] : []);
  return {
    ...mapSupplierListRow({
      id: row.id,
      personType: row.personType,
      nomeApelido: row.nomeApelido,
      razaoSocial: row.razaoSocial,
      cnpjCpf: row.cnpjCpf,
      status: row.status,
      email: row.email,
      telefone: row.telefone,
      cidade: row.cidade,
      estado: row.estado,
      linkedUserId: linkedUsers[0]?.id ?? row.linkedUserId,
      linkedUser: linkedUsers[0] ?? row.linkedUser,
      linkedUsers,
      category: row.category,
      _count: { attachments: row._count.attachments },
    }),
    ie: row.ie,
    ieIsento: row.ieIsento,
    cep: row.cep,
    endereco: row.endereco,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    contatoFinNome: row.contatoFinNome,
    contatoFinEmail: row.contatoFinEmail,
    contatoFinCel: row.contatoFinCel,
    contatoTecNome: row.contatoTecNome,
    contatoTecEmail: row.contatoTecEmail,
    contatoTecCel: row.contatoTecCel,
    banco: row.banco,
    agencia: row.agencia,
    conta: row.conta,
    pixKey: row.pixKey,
    observacoes: row.observacoes,
    historyCount: row._count.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const supplierDetailSelect = {
  id: true,
  personType: true,
  nomeApelido: true,
  razaoSocial: true,
  cnpjCpf: true,
  ie: true,
  ieIsento: true,
  cep: true,
  endereco: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  estado: true,
  email: true,
  telefone: true,
  banco: true,
  agencia: true,
  conta: true,
  pixKey: true,
  contatoFinNome: true,
  contatoFinEmail: true,
  contatoFinCel: true,
  contatoTecNome: true,
  contatoTecEmail: true,
  contatoTecCel: true,
  categoryId: true,
  linkedUserId: true,
  status: true,
  observacoes: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, allowMultipleUsers: true } },
  linkedUser: { select: { id: true, name: true, email: true } },
  userLinks: {
    orderBy: { createdAt: "asc" as const },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  _count: { select: { attachments: true, history: true } },
} as const;

async function resolveLinkedUserIds(
  tenantId: string,
  linkedUserIds: string[] | undefined,
  options: {
    categoryId: string | null | undefined;
    excludeSupplierId?: string;
  },
): Promise<
  | { ok: true; linkedUserIds: string[] | undefined; linkedUserId: string | null | undefined }
  | { ok: false; error: string }
> {
  if (linkedUserIds === undefined) {
    return { ok: true, linkedUserIds: undefined, linkedUserId: undefined };
  }

  const uniqueIds = [...new Set(linkedUserIds.map((id) => String(id).trim()).filter(Boolean))];

  let allowMultiple = false;
  if (options.categoryId) {
    const cat = await prisma.supplierCategory.findFirst({
      where: { id: options.categoryId, tenantId },
      select: { allowMultipleUsers: true },
    });
    allowMultiple = Boolean(cat?.allowMultipleUsers);
  }

  if (!allowMultiple && uniqueIds.length > 1) {
    return {
      ok: false,
      error: "Esta categoria de fornecedor não permite vincular mais de um usuário.",
    };
  }

  if (uniqueIds.length === 0) {
    return { ok: true, linkedUserIds: [], linkedUserId: null };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, tenantId, role: { not: "CLIENTE" } },
    select: { id: true },
  });
  if (users.length !== uniqueIds.length) {
    return { ok: false, error: "Um ou mais usuários vinculados são inválidos ou são clientes." };
  }

  const conflict = await prisma.supplierUserLink.findFirst({
    where: {
      userId: { in: uniqueIds },
      ...(options.excludeSupplierId ? { supplierId: { not: options.excludeSupplierId } } : {}),
    },
    select: {
      userId: true,
      supplier: { select: { nomeApelido: true } },
    },
  });
  if (conflict) {
    return {
      ok: false,
      error: `Há usuário já vinculado ao fornecedor "${conflict.supplier.nomeApelido}".`,
    };
  }

  // Também bloqueia conflito no campo legado linkedUserId.
  const legacyConflict = await prisma.supplier.findFirst({
    where: {
      tenantId,
      linkedUserId: { in: uniqueIds },
      ...(options.excludeSupplierId ? { NOT: { id: options.excludeSupplierId } } : {}),
    },
    select: { nomeApelido: true },
  });
  if (legacyConflict) {
    return {
      ok: false,
      error: `Há usuário já vinculado ao fornecedor "${legacyConflict.nomeApelido}".`,
    };
  }

  return {
    ok: true,
    linkedUserIds: uniqueIds,
    linkedUserId: uniqueIds[0] ?? null,
  };
}

async function replaceSupplierUserLinks(
  supplierId: string,
  linkedUserIds: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.supplierUserLink.deleteMany({ where: { supplierId } });
    if (linkedUserIds.length > 0) {
      await tx.supplierUserLink.createMany({
        data: linkedUserIds.map((userId) => ({ supplierId, userId })),
      });
    }
    await tx.supplier.update({
      where: { id: supplierId },
      data: { linkedUserId: linkedUserIds[0] ?? null },
    });
  });
}

async function enrichLinkedUserHistory(
  tenantId: string,
  entries: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.field !== "linkedUserId") continue;
    if (e.oldValue) ids.add(e.oldValue);
    if (e.newValue) ids.add(e.newValue);
  }
  if (ids.size === 0) return entries;
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return entries.map((e) => {
    if (e.field !== "linkedUserId") return e;
    return {
      ...e,
      oldValue: e.oldValue ? nameById.get(e.oldValue) ?? e.oldValue : null,
      newValue: e.newValue ? nameById.get(e.newValue) ?? e.newValue : null,
    };
  });
}

async function findSupplierForTenant(tenantId: string, id: string) {
  return prisma.supplier.findFirst({
    where: { id, tenantId },
  });
}

/** Dropdowns: sem CPF/CNPJ, e-mail ou telefone. */
suppliersRouter.get("/for-select", requireAnyFeature([...SUPPLIER_SELECT_FEATURES]), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);
  const rows = await prisma.supplier.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, nomeApelido: true, linkedUserId: true },
    orderBy: [{ status: "asc" }, { nomeApelido: "asc" }],
  });
  res.json(rows);
});

suppliersRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);

  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim().toUpperCase();
  const categoryId = String(req.query.categoryId ?? "").trim();

  const rows = await prisma.supplier.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status === "ATIVO" || status === "INATIVO" ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { nomeApelido: { contains: search, mode: "insensitive" } },
              { razaoSocial: { contains: search, mode: "insensitive" } },
              { cnpjCpf: { contains: search.replace(/\D/g, "") } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { nomeApelido: "asc" }],
    select: {
      id: true,
      personType: true,
      nomeApelido: true,
      razaoSocial: true,
      cnpjCpf: true,
      status: true,
      email: true,
      telefone: true,
      cidade: true,
      estado: true,
      linkedUserId: true,
      linkedUser: { select: { id: true, name: true, email: true } },
      userLinks: {
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true } } },
      },
      category: { select: { id: true, name: true, allowMultipleUsers: true } },
      _count: { select: { attachments: true } },
    },
  });

  res.json(
    rows.map((row) =>
      mapSupplierListRow({
        ...row,
        linkedUsers: row.userLinks.map((l) => l.user),
      }),
    ),
  );
});

suppliersRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const supplier = await findSupplierForTenant(user.tenantId, id);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }
  const rows = await prisma.supplierHistory.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      field: r.field,
      fieldLabel: r.field ? SUPPLIER_FIELD_LABELS[r.field] ?? r.field : null,
      oldValue: r.oldValue,
      newValue: r.newValue,
      details: r.details,
      createdAt: r.createdAt,
      user: r.user,
    })),
  );
});

suppliersRouter.get("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const supplier = await findSupplierForTenant(user.tenantId, id);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }
  const rows = await prisma.supplierAttachment.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows);
});

suppliersRouter.get("/:id/attachments/:attachmentId/file", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: { tenantId: string } }).user;
    const supplierId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);

    const attachment = await prisma.supplierAttachment.findFirst({
      where: {
        id: attachmentId,
        supplierId,
        supplier: { tenantId: user.tenantId },
      },
      select: { id: true, fileUrl: true, filename: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado." });
      return;
    }

    const abs = resolveUploadsPublicPath(attachment.fileUrl);
    const suppliersRoot = normalize(join(getUploadsRoot(), "suppliers")) + sep;
    if (!abs || !(normalize(abs) + sep).startsWith(suppliersRoot)) {
      res.status(403).json({ error: "Caminho de arquivo inválido." });
      return;
    }
    if (!existsSync(abs)) {
      res.status(404).json({ error: "Arquivo não encontrado no servidor." });
      return;
    }

    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Erro ao enviar arquivo." });
      }
    });
  } catch (error) {
    console.error("[suppliers] serve attachment", errorSummary(error));
    if (!res.headersSent) res.status(500).json({ error: "Erro ao servir anexo." });
  }
});

suppliersRouter.post("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string } }).user;
    const supplierId = String(req.params.id);
    const { fileName, fileData, fileType, fileSize } = req.body ?? {};

    const supplier = await findSupplierForTenant(user.tenantId, supplierId);
    if (!supplier) {
      res.status(404).json({ error: "Fornecedor não encontrado." });
      return;
    }

    if (!fileName || !fileData) {
      res.status(400).json({ error: "fileName e fileData são obrigatórios." });
      return;
    }

    const allowedExtensions = new Set([
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
    ]);
    const fileExtension = String(fileName).toLowerCase().substring(String(fileName).lastIndexOf("."));
    if (!allowedExtensions.has(fileExtension)) {
      res.status(400).json({ error: "Tipo de arquivo não permitido." });
      return;
    }

    const base64Data = String(fileData).replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > TICKET_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ error: ticketAttachmentMaxSizeError() });
      return;
    }

    const timestamp = Date.now();
    const sanitizedFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueFileName = `${supplierId}-${timestamp}-${sanitizedFileName}`;
    const filePath = join(uploadsDir, uniqueFileName);
    await writeFile(filePath, buffer);

    const mimeFromDataUrl =
      typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
    const effectiveType = String(fileType || mimeFromDataUrl || "application/octet-stream");

    const attachment = await prisma.supplierAttachment.create({
      data: {
        supplierId,
        userId: user.id,
        filename: String(fileName),
        fileUrl: `/uploads/suppliers/${uniqueFileName}`,
        fileType: effectiveType,
        fileSize: fileSize || buffer.length,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await prisma.supplierHistory.create({
      data: {
        supplierId,
        userId: user.id,
        action: "ATTACHMENT_ADDED",
        newValue: String(fileName),
        details: `Anexo "${String(fileName)}" adicionado`,
      },
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("[suppliers] upload attachment", errorSummary(error));
    res.status(500).json({ error: "Erro ao fazer upload do anexo." });
  }
});

suppliersRouter.delete("/:id/attachments/:attachmentId", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: { id: string; tenantId: string } }).user;
    const supplierId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);

    const attachment = await prisma.supplierAttachment.findFirst({
      where: {
        id: attachmentId,
        supplierId,
        supplier: { tenantId: user.tenantId },
      },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado." });
      return;
    }

    const filePath = resolveUploadsPublicPath(attachment.fileUrl);
    if (filePath && existsSync(filePath)) {
      await unlink(filePath).catch((e) => console.error("[suppliers] unlink", errorSummary(e)));
    }

    await prisma.supplierHistory.create({
      data: {
        supplierId,
        userId: user.id,
        action: "ATTACHMENT_DELETED",
        oldValue: attachment.filename,
        details: `Anexo "${attachment.filename}" removido`,
      },
    });

    await prisma.supplierAttachment.delete({ where: { id: attachmentId } });
    res.status(204).end();
  } catch (error) {
    console.error("[suppliers] delete attachment", errorSummary(error));
    res.status(500).json({ error: "Erro ao excluir anexo." });
  }
});

suppliersRouter.get("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const row = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId },
    select: supplierDetailSelect,
  });
  if (!row) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }
  res.json(mapSupplierDetail(row));
});

suppliersRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  await ensureFinanceDefaults(user.tenantId);

  const parsed = parseSupplierWriteBody(req.body, "create");
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const personType = parsed.personType!;
  const cnpjCpf = parsed.cnpjCpf!;
  if (!validateDocument(personType, cnpjCpf)) {
    res.status(400).json({ error: documentValidationError(personType) });
    return;
  }

  const dup = await prisma.supplier.findFirst({
    where: { tenantId: user.tenantId, cnpjCpf },
    select: { id: true },
  });
  if (dup) {
    res.status(409).json({ error: "Já existe um fornecedor com este CNPJ/CPF." });
    return;
  }

  if (parsed.categoryId) {
    const cat = await prisma.supplierCategory.findFirst({
      where: { id: parsed.categoryId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!cat) {
      res.status(400).json({ error: "Categoria não encontrada." });
      return;
    }
  }

  const linked = await resolveLinkedUserIds(user.tenantId, parsed.linkedUserIds, {
    categoryId: parsed.categoryId ?? null,
  });
  if (linked.ok === false) {
    res.status(400).json({ error: linked.error });
    return;
  }

  const created = await prisma.supplier.create({
    data: {
      tenantId: user.tenantId,
      personType,
      nomeApelido: parsed.nomeApelido!,
      razaoSocial: parsed.razaoSocial ?? null,
      cnpjCpf,
      ie: parsed.ie ?? null,
      ieIsento: parsed.ieIsento ?? false,
      cep: parsed.cep ?? null,
      endereco: parsed.endereco ?? null,
      numero: parsed.numero ?? null,
      complemento: parsed.complemento ?? null,
      bairro: parsed.bairro ?? null,
      cidade: parsed.cidade ?? null,
      estado: parsed.estado ?? null,
      email: parsed.email ?? null,
      telefone: parsed.telefone ?? null,
      banco: parsed.banco ?? null,
      agencia: parsed.agencia ?? null,
      conta: parsed.conta ?? null,
      pixKey: parsed.pixKey ?? null,
      contatoFinNome: parsed.contatoFinNome ?? null,
      contatoFinEmail: parsed.contatoFinEmail ?? null,
      contatoFinCel: parsed.contatoFinCel ?? null,
      contatoTecNome: parsed.contatoTecNome ?? null,
      contatoTecEmail: parsed.contatoTecEmail ?? null,
      contatoTecCel: parsed.contatoTecCel ?? null,
      categoryId: parsed.categoryId ?? null,
      linkedUserId: linked.linkedUserId ?? null,
      status: parsed.status ?? "ATIVO",
      observacoes: parsed.observacoes ?? null,
      ...(linked.linkedUserIds && linked.linkedUserIds.length > 0
        ? {
            userLinks: {
              create: linked.linkedUserIds.map((userId) => ({ userId })),
            },
          }
        : {}),
    },
    select: supplierDetailSelect,
  });

  await prisma.supplierHistory.create({
    data: {
      supplierId: created.id,
      userId: user.id,
      action: "CREATED",
      details: `Fornecedor "${created.nomeApelido}" cadastrado`,
    },
  });

  res.status(201).json(mapSupplierDetail(created));
});

suppliersRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await findSupplierForTenant(user.tenantId, id);
  if (!existing) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }

  const parsed = parseSupplierWriteBody(req.body, "update");
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const personType = parsed.personType ?? (existing.personType as "PJ" | "PF");
  if (parsed.cnpjCpf) {
    if (!validateDocument(personType, parsed.cnpjCpf)) {
      res.status(400).json({ error: documentValidationError(personType) });
      return;
    }
    if (parsed.cnpjCpf !== existing.cnpjCpf) {
      const dup = await prisma.supplier.findFirst({
        where: { tenantId: user.tenantId, cnpjCpf: parsed.cnpjCpf, NOT: { id } },
        select: { id: true },
      });
      if (dup) {
        res.status(409).json({ error: "Já existe um fornecedor com este CNPJ/CPF." });
        return;
      }
    }
  }

  if (parsed.categoryId) {
    const cat = await prisma.supplierCategory.findFirst({
      where: { id: parsed.categoryId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!cat) {
      res.status(400).json({ error: "Categoria não encontrada." });
      return;
    }
  }

  const nextCategoryId =
    parsed.categoryId !== undefined ? parsed.categoryId : existing.categoryId;

  // Se a categoria deixar de permitir multi usuário e não veio lista nova, bloqueia se já houver >1 vínculo.
  if (parsed.linkedUserIds === undefined && nextCategoryId) {
    const cat = await prisma.supplierCategory.findFirst({
      where: { id: nextCategoryId, tenantId: user.tenantId },
      select: { allowMultipleUsers: true },
    });
    if (cat && !cat.allowMultipleUsers) {
      const linkCount = await prisma.supplierUserLink.count({ where: { supplierId: id } });
      if (linkCount > 1) {
        res.status(400).json({
          error:
            "Esta categoria não permite multi usuário. Reduza para um único usuário vinculado antes de salvar.",
        });
        return;
      }
    }
  }

  const linked = await resolveLinkedUserIds(user.tenantId, parsed.linkedUserIds, {
    categoryId: nextCategoryId,
    excludeSupplierId: id,
  });
  if (linked.ok === false) {
    res.status(400).json({ error: linked.error });
    return;
  }

  const { linkedUserIds: _omitLinkedUserIds, ...parsedFields } = parsed;
  const data = {
    ...parsedFields,
    ...(linked.linkedUserId !== undefined ? { linkedUserId: linked.linkedUserId } : {}),
  };
  const historyEntries = await enrichLinkedUserHistory(
    user.tenantId,
    buildSupplierHistoryEntries(existing, data),
  );

  if (linked.linkedUserIds !== undefined) {
    await replaceSupplierUserLinks(id, linked.linkedUserIds);
  }

  const updated = await prisma.supplier.update({
    where: { id },
    data,
    select: supplierDetailSelect,
  });

  if (historyEntries.length > 0) {
    await prisma.supplierHistory.createMany({
      data: historyEntries.map((e) => ({
        supplierId: id,
        userId: user.id,
        action: "UPDATED",
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        details: `${SUPPLIER_FIELD_LABELS[e.field] ?? e.field} alterado`,
      })),
    });
  }

  res.json(mapSupplierDetail(updated));
});

suppliersRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: { tenantId: string; id: string } }).user;
  const id = String(req.params.id);
  const existing = await findSupplierForTenant(user.tenantId, id);
  if (!existing) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplier.update({
      where: { id },
      data: { status: "INATIVO" },
    });
    await tx.supplierHistory.create({
      data: {
        supplierId: id,
        userId: user.id,
        action: "STATUS",
        field: "status",
        oldValue: existing.status,
        newValue: "INATIVO",
        details: "Fornecedor inativado (exclusão física não permitida).",
      },
    });
  });
  res.status(204).end();
});
