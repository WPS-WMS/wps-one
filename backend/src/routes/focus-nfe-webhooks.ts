import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { upsertNfseEmissionAttempt } from "../lib/focusNfeEmissionAttempts.js";
import { getFocusNfeConfig, syncFocusNfseStatus } from "../lib/focusNfeService.js";

/**
 * Webhooks Focus NFe — sem JWT (autenticação via segredo do gatilho).
 * URL: POST /api/webhooks/focus-nfe/nfsen/:tenantId
 */
export const focusNfeWebhooksRouter = Router();

focusNfeWebhooksRouter.post("/nfsen/:tenantId", async (req, res) => {
  const tenantId = String(req.params.tenantId || "").trim();
  if (!tenantId) {
    res.status(400).json({ error: "tenantId obrigatório." });
    return;
  }

  const config = await getFocusNfeConfig(tenantId);
  if (!config?.webhookSecret) {
    res.status(401).json({ error: "Webhook não configurado." });
    return;
  }

  const headerCustom = String(req.header("X-Focus-Nfe-Token") ?? "").trim();
  const headerAuth = String(req.header("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const provided = headerCustom || headerAuth;
  if (!provided || provided !== config.webhookSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const ref = String(body.ref ?? "").trim();
  if (!ref) {
    res.status(400).json({ error: "Payload sem ref." });
    return;
  }

  // Responde rápido; processamento síncrono curto (sync Focus + update local).
  const installment = await prisma.receivableInstallment.findFirst({
    where: { focusNfeRef: ref, receivable: { tenantId } },
    select: {
      id: true,
      receivableId: true,
      focusNfeRef: true,
    },
  });
  if (!installment?.focusNfeRef) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const attempt = await prisma.receivableNfseEmissionAttempt.findUnique({
    where: { tenantId_focusNfeRef: { tenantId, focusNfeRef: ref } },
    select: { createdById: true },
  });
  const receivable = await prisma.receivable.findFirst({
    where: { id: installment.receivableId, tenantId },
    select: { createdById: true },
  });
  const userId = attempt?.createdById || receivable?.createdById;
  if (!userId) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const synced = await syncFocusNfseStatus({
    tenantId,
    userId,
    receivableId: installment.receivableId,
    installmentId: installment.id,
  });

  if (synced.ok) {
    await upsertNfseEmissionAttempt({
      tenantId,
      receivableId: installment.receivableId,
      installmentId: installment.id,
      focusNfeRef: ref,
      environment: config.environment,
      status: synced.focusNfeStatus ?? String(body.status ?? "processando_autorizacao"),
      source: "WEBHOOK",
      createdById: userId,
      nfNumber: synced.nfNumber,
      focusNfeUrl: synced.focusNfeUrl,
      focusNfeDanfseUrl: synced.focusNfeDanfseUrl,
      errorMessage: synced.focusNfeError,
    });
  }

  res.status(200).json({ ok: true });
});
