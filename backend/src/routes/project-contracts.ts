import { Request, Router } from "express";
import { existsSync } from "fs";
import { normalize, sep } from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../lib/auth.js";
import { requireFeature } from "../lib/authorizeFeature.js";
import { ensureFinanceDefaults } from "../lib/financeConfigHelpers.js";
import { userCanAccessProject } from "../lib/projectVisibility.js";
import { errorSummary } from "../lib/devLog.js";
import { getUploadsRoot, resolveUploadsPublicPath } from "../lib/uploadsRoot.js";
import { TICKET_ATTACHMENT_MAX_BYTES, ticketAttachmentMaxSizeError } from "../lib/ticketAttachmentLimits.js";
import {
  buildContractHistoryEntries,
  CONTRACT_FIELD_LABELS,
  parseProjectContractWriteBody,
} from "../lib/projectContractHelpers.js";

export const projectContractsRouter = Router();
projectContractsRouter.use(authMiddleware);

const FEATURE = "financeiro.projetos.contratos" as const;

type AuthUser = { id: string; tenantId: string; role: string };

const uploadsDir = join(getUploadsRoot(), "project-contracts");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch((e) =>
    console.error("[project-contracts] mkdir uploads", errorSummary(e)),
  );
}

function mapContractRow(row: {
  id: string;
  projectId: string;
  title: string;
  contractTypeId: string | null;
  vigencyStart: Date | null;
  vigencyEnd: Date | null;
  slaDays: number | null;
  readjustmentMonths: number | null;
  createdAt: Date;
  updatedAt: Date;
  contractType: { id: string; name: string } | null;
  _count: { attachments: number; history: number };
}) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    contractTypeId: row.contractTypeId,
    contractTypeName: row.contractType?.name ?? null,
    vigencyStart: row.vigencyStart,
    vigencyEnd: row.vigencyEnd,
    slaDays: row.slaDays,
    readjustmentMonths: row.readjustmentMonths,
    attachmentsCount: row._count.attachments,
    historyCount: row._count.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertProjectAccess(user: AuthUser, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { tenantId: user.tenantId } },
    select: { id: true },
  });
  if (!project) return false;
  return userCanAccessProject(prisma, user, projectId);
}

async function getContractTypeNames(tenantId: string): Promise<Map<string, string>> {
  const rows = await prisma.contractType.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function validateContractTypeId(tenantId: string, contractTypeId: string | null | undefined) {
  if (!contractTypeId) return { ok: true as const };
  const ct = await prisma.contractType.findFirst({
    where: { id: contractTypeId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!ct) return { ok: false as const, error: "Tipo de contrato inválido ou inativo." };
  return { ok: true as const };
}

async function findContractForTenant(tenantId: string, contractId: string) {
  return prisma.projectContract.findFirst({
    where: { id: contractId, tenantId },
    select: { id: true, projectId: true, title: true },
  });
}

projectContractsRouter.get("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.query.projectId ?? "").trim();
  if (!projectId) {
    res.status(400).json({ error: "projectId é obrigatório." });
    return;
  }
  if (!(await assertProjectAccess(user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);
  const rows = await prisma.projectContract.findMany({
    where: { tenantId: user.tenantId, projectId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      contractType: { select: { id: true, name: true } },
      _count: { select: { attachments: true, history: true } },
    },
  });
  res.json(rows.map(mapContractRow));
});

projectContractsRouter.post("/", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const projectId = String(req.body?.projectId ?? "").trim();
  if (!projectId) {
    res.status(400).json({ error: "projectId é obrigatório." });
    return;
  }
  if (!(await assertProjectAccess(user, projectId))) {
    res.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  const parsed = parseProjectContractWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!parsed.data.title) {
    res.status(400).json({ error: "Título do contrato é obrigatório." });
    return;
  }
  const ctCheck = await validateContractTypeId(user.tenantId, parsed.data.contractTypeId);
  if (ctCheck.ok === false) {
    res.status(400).json({ error: ctCheck.error });
    return;
  }
  await ensureFinanceDefaults(user.tenantId);
  const created = await prisma.$transaction(async (tx) => {
    const contract = await tx.projectContract.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        title: parsed.data.title,
        contractTypeId: parsed.data.contractTypeId ?? null,
        vigencyStart: parsed.data.vigencyStart ?? null,
        vigencyEnd: parsed.data.vigencyEnd ?? null,
        slaDays: parsed.data.slaDays ?? null,
        readjustmentMonths: parsed.data.readjustmentMonths ?? null,
      },
      include: {
        contractType: { select: { id: true, name: true } },
        _count: { select: { attachments: true, history: true } },
      },
    });
    await tx.projectContractHistory.create({
      data: {
        contractId: contract.id,
        userId: user.id,
        action: "CREATE",
        details: contract.title,
      },
    });
    return contract;
  });
  res.status(201).json(mapContractRow(created));
});

projectContractsRouter.get("/:id/history", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const contract = await prisma.projectContract.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, projectId: true },
  });
  if (!contract || !(await assertProjectAccess(user, contract.projectId))) {
    res.status(404).json({ error: "Contrato não encontrado." });
    return;
  }
  const rows = await prisma.projectContractHistory.findMany({
    where: { contractId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      field: row.field,
      fieldLabel: row.field ? (CONTRACT_FIELD_LABELS[row.field] ?? row.field) : null,
      oldValue: row.oldValue,
      newValue: row.newValue,
      details: row.details,
      createdAt: row.createdAt,
      user: row.user,
    })),
  );
});

projectContractsRouter.get("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const contract = await findContractForTenant(user.tenantId, id);
  if (!contract || !(await assertProjectAccess(user, contract.projectId))) {
    res.status(404).json({ error: "Contrato não encontrado." });
    return;
  }
  const rows = await prisma.projectContractAttachment.findMany({
    where: { contractId: id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows);
});

projectContractsRouter.post("/:id/attachments", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const contractId = String(req.params.id);
    const { fileName, fileData, fileType, fileSize } = req.body ?? {};

    const contract = await findContractForTenant(user.tenantId, contractId);
    if (!contract || !(await assertProjectAccess(user, contract.projectId))) {
      res.status(404).json({ error: "Contrato não encontrado." });
      return;
    }
    if (!fileName || !fileData) {
      res.status(400).json({ error: "fileName e fileData são obrigatórios." });
      return;
    }

    const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"]);
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

    const uniqueFileName = `${contractId}-${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await writeFile(join(uploadsDir, uniqueFileName), buffer);

    const mimeFromDataUrl =
      typeof fileData === "string" ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "") : "";
    const effectiveType = String(fileType || mimeFromDataUrl || "application/octet-stream");

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.projectContractAttachment.create({
        data: {
          contractId,
          userId: user.id,
          filename: String(fileName),
          fileUrl: `/uploads/project-contracts/${uniqueFileName}`,
          fileType: effectiveType,
          fileSize: fileSize || buffer.length,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await tx.projectContractHistory.create({
        data: {
          contractId,
          userId: user.id,
          action: "ATTACHMENT_ADDED",
          newValue: String(fileName),
          details: `Anexo "${String(fileName)}" adicionado`,
        },
      });
      return att;
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("[project-contracts] upload attachment", errorSummary(error));
    res.status(500).json({ error: "Erro ao fazer upload do anexo." });
  }
});

projectContractsRouter.get("/:id/attachments/:attachmentId/file", requireFeature(FEATURE), async (req, res) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const contractId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);
    const attachment = await prisma.projectContractAttachment.findFirst({
      where: {
        id: attachmentId,
        contractId,
        contract: { tenantId: user.tenantId },
      },
      select: { id: true, fileUrl: true, filename: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado." });
      return;
    }
    const abs = resolveUploadsPublicPath(attachment.fileUrl);
    const contractsRoot = normalize(join(getUploadsRoot(), "project-contracts")) + sep;
    if (!abs || !(normalize(abs) + sep).startsWith(contractsRoot)) {
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
    console.error("[project-contracts] download attachment", errorSummary(error));
    res.status(500).json({ error: "Erro ao baixar anexo." });
  }
});

projectContractsRouter.delete("/:id/attachments/:attachmentId", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const contractId = String(req.params.id);
  const attachmentId = String(req.params.attachmentId);
  const attachment = await prisma.projectContractAttachment.findFirst({
    where: {
      id: attachmentId,
      contractId,
      contract: { tenantId: user.tenantId },
    },
  });
  if (!attachment) {
    res.status(404).json({ error: "Anexo não encontrado." });
    return;
  }
  const abs = resolveUploadsPublicPath(attachment.fileUrl);
  if (abs) {
    try {
      await unlink(abs);
    } catch {
      /* ignore */
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.projectContractAttachment.delete({ where: { id: attachmentId } });
    await tx.projectContractHistory.create({
      data: {
        contractId,
        userId: user.id,
        action: "ATTACHMENT_REMOVED",
        oldValue: attachment.filename,
        details: `Anexo "${attachment.filename}" removido`,
      },
    });
  });
  res.status(204).end();
});

projectContractsRouter.patch("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectContract.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing || !(await assertProjectAccess(user, existing.projectId))) {
    res.status(404).json({ error: "Contrato não encontrado." });
    return;
  }
  const parsed = parseProjectContractWriteBody(req.body);
  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar." });
    return;
  }
  const ctCheck = await validateContractTypeId(user.tenantId, parsed.data.contractTypeId);
  if (ctCheck.ok === false) {
    res.status(400).json({ error: ctCheck.error });
    return;
  }
  const contractTypeNames = await getContractTypeNames(user.tenantId);
  const historyEntries = buildContractHistoryEntries(existing, parsed.data, contractTypeNames);
  const updated = await prisma.$transaction(async (tx) => {
    const contract = await tx.projectContract.update({
      where: { id },
      data: parsed.data,
      include: {
        contractType: { select: { id: true, name: true } },
        _count: { select: { attachments: true, history: true } },
      },
    });
    for (const entry of historyEntries) {
      await tx.projectContractHistory.create({
        data: {
          contractId: id,
          userId: user.id,
          action: "UPDATE",
          field: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
        },
      });
    }
    return contract;
  });
  res.json(mapContractRow(updated));
});

projectContractsRouter.delete("/:id", requireFeature(FEATURE), async (req, res) => {
  const user = (req as Request & { user: AuthUser }).user;
  const id = String(req.params.id);
  const existing = await prisma.projectContract.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, projectId: true, title: true, isActive: true },
  });
  if (!existing || !(await assertProjectAccess(user, existing.projectId))) {
    res.status(404).json({ error: "Contrato não encontrado." });
    return;
  }
  if (!existing.isActive) {
    res.status(204).end();
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.projectContract.update({
      where: { id },
      data: { isActive: false },
    });
    await tx.projectContractHistory.create({
      data: {
        contractId: id,
        userId: user.id,
        action: "CANCEL",
        field: "isActive",
        oldValue: "true",
        newValue: "false",
        details: `Contrato inativado: ${existing.title}`,
      },
    });
  });
  res.status(204).end();
});
