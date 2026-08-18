import { randomBytes } from "crypto";
import { prisma } from "./prisma.js";
import {
  createFocusWebhook,
  deleteFocusWebhook,
  FocusNfeHttpError,
  listFocusWebhooks,
  type FocusNfeEnvironment,
} from "./focusNfeClient.js";

export type NfseAttemptSource = "EMIT" | "SYNC" | "WEBHOOK" | "CANCEL";

export function publicApiBaseUrl(): string | null {
  const raw =
    process.env.PUBLIC_API_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  const base = String(raw).trim().replace(/\/+$/, "");
  return base || null;
}

export function focusNfeWebhookUrlForTenant(tenantId: string): string | null {
  const base = publicApiBaseUrl();
  if (!base) return null;
  return `${base}/api/webhooks/focus-nfe/nfsen/${encodeURIComponent(tenantId)}`;
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export async function upsertNfseEmissionAttempt(params: {
  tenantId: string;
  receivableId: string;
  installmentId: string;
  focusNfeRef: string;
  environment: FocusNfeEnvironment;
  status: string;
  source: NfseAttemptSource;
  createdById?: string | null;
  nfNumber?: string | null;
  codigoIss?: string | null;
  focusNfeUrl?: string | null;
  focusNfeDanfseUrl?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const status = String(params.status || "processando_autorizacao").trim();
  const existing = await prisma.receivableNfseEmissionAttempt.findUnique({
    where: {
      tenantId_focusNfeRef: {
        tenantId: params.tenantId,
        focusNfeRef: params.focusNfeRef,
      },
    },
    select: { id: true, codigoIss: true },
  });

  if (existing) {
    await prisma.receivableNfseEmissionAttempt.update({
      where: { id: existing.id },
      data: {
        status,
        source: params.source,
        nfNumber: params.nfNumber !== undefined ? params.nfNumber : undefined,
        codigoIss: params.codigoIss ?? existing.codigoIss,
        focusNfeUrl: params.focusNfeUrl !== undefined ? params.focusNfeUrl : undefined,
        focusNfeDanfseUrl:
          params.focusNfeDanfseUrl !== undefined ? params.focusNfeDanfseUrl : undefined,
        errorMessage: params.errorMessage !== undefined ? params.errorMessage : undefined,
      },
    });
    return;
  }

  await prisma.receivableNfseEmissionAttempt.create({
    data: {
      tenantId: params.tenantId,
      receivableId: params.receivableId,
      installmentId: params.installmentId,
      focusNfeRef: params.focusNfeRef,
      environment: params.environment,
      status,
      source: params.source,
      createdById: params.createdById ?? null,
      nfNumber: params.nfNumber ?? null,
      codigoIss: params.codigoIss ?? null,
      focusNfeUrl: params.focusNfeUrl ?? null,
      focusNfeDanfseUrl: params.focusNfeDanfseUrl ?? null,
      errorMessage: params.errorMessage ?? null,
    },
  });
}

export async function listNfseEmissionAttempts(params: {
  tenantId: string;
  receivableId: string;
}) {
  return prisma.receivableNfseEmissionAttempt.findMany({
    where: { tenantId: params.tenantId, receivableId: params.receivableId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      installmentId: true,
      focusNfeRef: true,
      environment: true,
      status: true,
      nfNumber: true,
      codigoIss: true,
      focusNfeUrl: true,
      focusNfeDanfseUrl: true,
      errorMessage: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

type WebhookConfigSlice = {
  environment: FocusNfeEnvironment;
  tokenHomologacao: string | null;
  tokenProducao: string | null;
  cnpjPrestador: string | null;
  webhookSecret: string | null;
  webhookHookId: string | null;
  webhookHookEnvironment: string | null;
};

/**
 * Garante gatilho `nfsen` na Focus apontando para o WPS.
 */
export async function ensureFocusNfsenWebhook(params: {
  tenantId: string;
  token: string;
  config: WebhookConfigSlice;
}): Promise<
  | { ok: true; webhookUrl: string; hookId: string; created: boolean }
  | { ok: false; error: string }
> {
  const { tenantId, token, config } = params;
  const webhookUrl = focusNfeWebhookUrlForTenant(tenantId);
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "Defina PUBLIC_API_URL (URL pública do backend) para registrar o webhook na Focus.",
    };
  }

  let secret = String(config.webhookSecret ?? "").trim();
  if (!secret) {
    secret = newWebhookSecret();
    await prisma.tenantFocusNfeConfig.update({
      where: { tenantId },
      data: { webhookSecret: secret },
    });
  }

  const env = config.environment;
  const sameEnv = config.webhookHookEnvironment === env && config.webhookHookId;
  if (sameEnv && config.webhookHookId) {
    try {
      const hooks = await listFocusWebhooks({ token, environment: env });
      const found = hooks.find((h) => String(h.id) === String(config.webhookHookId));
      if (found && String(found.url ?? "") === webhookUrl && String(found.event ?? "") === "nfsen") {
        return { ok: true, webhookUrl, hookId: String(config.webhookHookId), created: false };
      }
      if (found) {
        await deleteFocusWebhook({ token, environment: env, hookId: String(config.webhookHookId) });
      }
    } catch {
      /* recria */
    }
  } else if (config.webhookHookId && config.webhookHookEnvironment) {
    try {
      const oldToken =
        config.webhookHookEnvironment === "PRODUCAO"
          ? config.tokenProducao
          : config.tokenHomologacao;
      if (oldToken) {
        await deleteFocusWebhook({
          token: oldToken,
          environment: config.webhookHookEnvironment as FocusNfeEnvironment,
          hookId: config.webhookHookId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const created = await createFocusWebhook({
      token,
      environment: env,
      event: "nfsen",
      url: webhookUrl,
      authorization: secret,
      authorizationHeader: "X-Focus-Nfe-Token",
      cnpj: config.cnpjPrestador,
    });
    const hookId = String(created.id ?? "").trim();
    if (!hookId) {
      return { ok: false, error: "Focus criou o webhook mas não retornou o id." };
    }
    await prisma.tenantFocusNfeConfig.update({
      where: { tenantId },
      data: {
        webhookSecret: secret,
        webhookHookId: hookId,
        webhookHookEnvironment: env,
      },
    });
    return { ok: true, webhookUrl, hookId, created: true };
  } catch (error) {
    if (error instanceof FocusNfeHttpError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao registrar webhook na Focus.",
    };
  }
}
