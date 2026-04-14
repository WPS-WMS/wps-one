import { Request, Router } from "express";
import { authMiddleware } from "../lib/auth.js";
import { writeFile, mkdir, readdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const uploadsRouter = Router();
uploadsRouter.use(authMiddleware);

// Criar diretórios de uploads se não existirem
const uploadsDir = join(process.cwd(), "uploads", "projects");
const avatarsDir = join(process.cwd(), "uploads", "users");
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch(console.error);
}
if (!existsSync(avatarsDir)) {
  mkdir(avatarsDir, { recursive: true }).catch(console.error);
}

// Avatar default compartilhado (não consome espaço por usuário)
const defaultAvatarName = "default-avatar.svg";
const defaultAvatarPath = join(avatarsDir, defaultAvatarName);
if (!existsSync(defaultAvatarPath)) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5c00e1" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#574276" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#g)"/>
  <circle cx="64" cy="52" r="22" fill="rgba(255,255,255,0.92)"/>
  <path d="M24 118c7-22 22-34 40-34s33 12 40 34" fill="rgba(255,255,255,0.92)"/>
</svg>`;
  writeFile(defaultAvatarPath, svg, "utf8").catch(console.error);
}

uploadsRouter.post("/project-attachment", async (req, res) => {
  const user = (req as Request & { user: { id: string; tenantId: string; role: string } }).user;
  if (user.role !== "ADMIN" && user.role !== "GESTOR_PROJETOS") {
    res.status(403).json({ error: "Apenas administradores e gestores podem fazer upload de arquivos." });
    return;
  }

  try {
    const { fileName, fileData, fileType, fileSize } = req.body;

    if (!fileName || !fileData) {
      res.status(400).json({ error: "Nome do arquivo e dados do arquivo são obrigatórios" });
      return;
    }

    // Validar tipo de arquivo (apenas PDF e DOCX)
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExtensions = [".pdf", ".docx"];

    const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
    if (!allowedExtensions.includes(fileExtension)) {
      res.status(400).json({ error: "Apenas arquivos PDF e DOCX são permitidos" });
      return;
    }

    // Converter base64 para buffer
    const base64Data = String(fileData).replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Validar tamanho do arquivo (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (buffer.length > maxSize) {
      res.status(400).json({ error: "Arquivo muito grande. Tamanho máximo: 10MB" });
      return;
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueFileName = `${timestamp}-${safeName}`;
    const filePath = join(uploadsDir, uniqueFileName);

    // Salvar arquivo
    await writeFile(filePath, buffer);

    // Retornar URL/path do arquivo
    const fileUrl = `/uploads/projects/${uniqueFileName}`;

    res.json({
      fileName: fileName,
      fileUrl: fileUrl,
      fileType: fileType || (fileExtension === ".pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      fileSize: fileSize || buffer.length,
    });
  } catch (error) {
    console.error("Erro ao fazer upload:", error);
    res.status(500).json({ error: "Erro ao fazer upload do arquivo" });
  }
});

// Upload de avatar do usuário (imagem)
uploadsRouter.post("/user-avatar", async (req, res) => {
  const user = (req as Request & { user: { id: string } }).user;
  try {
    const { fileName, fileData, fileType, fileSize } = req.body;
    if (!fileName || !fileData) {
      res.status(400).json({ error: "Nome do arquivo e dados do arquivo são obrigatórios" });
      return;
    }

    const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    const ext = String(fileName).toLowerCase().substring(String(fileName).lastIndexOf("."));
    if (!allowedExtensions.has(ext)) {
      res.status(400).json({ error: "Apenas imagens são permitidas para foto de perfil." });
      return;
    }

    const base64Data = String(fileData).replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (buffer.length > maxSize) {
      res.status(400).json({ error: "Imagem muito grande. Tamanho máximo: 5MB" });
      return;
    }

    const timestamp = Date.now();

    // Sem consumir espaço: manter apenas 1 arquivo por usuário (sobrescreve + limpa antigos)
    const fixedFileName = `${user.id}${ext}`;
    const filePath = join(avatarsDir, fixedFileName);

    // Limpar arquivos antigos desse usuário (padrão antigo: `${user.id}-${timestamp}-...` e/ou `${user.id}.ext`)
    try {
      const files = await readdir(avatarsDir);
      const prefixOld = `${user.id}-`;
      const prefixFixed = `${user.id}.`;
      await Promise.all(
        files
          .filter((f) => f.startsWith(prefixOld) || f.startsWith(prefixFixed))
          .filter((f) => f !== fixedFileName)
          .map((f) => unlink(join(avatarsDir, f)).catch(() => null)),
      );
    } catch {
      // best-effort cleanup
    }

    await writeFile(filePath, buffer);

    const mimeFromDataUrl =
      typeof fileData === "string"
        ? (fileData.match(/^data:([^;]+);base64,/)?.[1] ?? "")
        : "";

    // URL estável; o cache-bust é feito no frontend usando `updatedAt` do usuário.
    const fileUrl = `/uploads/users/${fixedFileName}`;
    res.json({
      fileName,
      fileUrl,
      version: timestamp,
      fileType: fileType || mimeFromDataUrl || "image/png",
      fileSize: fileSize || buffer.length,
    });
  } catch (error) {
    console.error("Erro ao fazer upload de avatar:", error);
    res.status(500).json({ error: "Erro ao fazer upload da imagem" });
  }
});
