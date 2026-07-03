import { Request, Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
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
  category: { id: string; name: string } | null;
  _count: { attachments: number };
}) {
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
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
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
  status: string;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  _count: { attachments: number; history: number };
}) {
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

async function findSupplierForTenant(tenantId: string, id: string) {
  return prisma.supplier.findFirst({
    where: { id, tenantId },
  });
}

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
      category: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
  });

  res.json(rows.map(mapSupplierListRow));
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
    select: {
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
      status: true,
      observacoes: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      _count: { select: { attachments: true, history: true } },
    },
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
      status: parsed.status ?? "ATIVO",
      observacoes: parsed.observacoes ?? null,
    },
    select: {
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
      contatoTecNome: true,
      contatoTecEmail: true,
      contatoTecCel: true,
      contatoFinCel: true,
      categoryId: true,
      status: true,
      observacoes: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      _count: { select: { attachments: true, history: true } },
    },
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

  const data = { ...parsed };
  const historyEntries = buildSupplierHistoryEntries(existing, data);

  const updated = await prisma.supplier.update({
    where: { id },
    data,
    select: {
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
      status: true,
      observacoes: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      _count: { select: { attachments: true, history: true } },
    },
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
  const user = (req as Request & { user: { tenantId: string } }).user;
  const id = String(req.params.id);
  const existing = await findSupplierForTenant(user.tenantId, id);
  if (!existing) {
    res.status(404).json({ error: "Fornecedor não encontrado." });
    return;
  }

  const attachments = await prisma.supplierAttachment.findMany({
    where: { supplierId: id },
    select: { fileUrl: true },
  });
  for (const att of attachments) {
    const filePath = resolveUploadsPublicPath(att.fileUrl);
    if (filePath && existsSync(filePath)) {
      await unlink(filePath).catch((e) => console.error("[suppliers] unlink on delete", errorSummary(e)));
    }
  }

  await prisma.supplier.delete({ where: { id } });
  res.status(204).end();
});
