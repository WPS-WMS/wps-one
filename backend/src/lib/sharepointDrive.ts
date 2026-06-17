import { graphFetch } from "./microsoftGraphAuth.js";
import { errorSummary } from "./devLog.js";

export type DriveItemRef = {
  id: string;
  name: string;
  webUrl: string | null;
  eTag: string | null;
  size: number | null;
  fileMime: string | null;
  isFolder: boolean;
};

type GraphDriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  eTag?: string;
  size?: number;
  folder?: Record<string, unknown> | null;
  file?: { mimeType?: string } | null;
};

function mapDriveItem(row: GraphDriveItem): DriveItemRef {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    webUrl: row.webUrl ?? null,
    eTag: row.eTag ?? null,
    size: typeof row.size === "number" ? row.size : null,
    fileMime: row.file?.mimeType ?? null,
    isFolder: !!row.folder,
  };
}

export async function resolveSiteAndDrive(siteUrl: string, driveIdOverride?: string | null): Promise<{
  siteId: string;
  driveId: string;
}> {
  const trimmed = String(siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("URL do site SharePoint é obrigatória.");

  let siteResp: Response;
  try {
    const u = new URL(trimmed);
    const hostname = u.hostname;
    const path = u.pathname.replace(/^\/+/, "");
    siteResp = await graphFetch(`/sites/${hostname}:/${path}`);
  } catch {
    siteResp = await graphFetch(`/sites/${encodeURIComponent(trimmed)}`);
  }

  if (!siteResp.ok) {
    const text = await siteResp.text().catch(() => "");
    throw new Error(`Site SharePoint não encontrado (${siteResp.status}): ${text || siteResp.statusText}`);
  }
  const site = (await siteResp.json()) as { id?: string };
  const siteId = String(site.id ?? "");
  if (!siteId) throw new Error("Resposta do Graph sem site id.");

  if (driveIdOverride) {
    return { siteId, driveId: driveIdOverride };
  }

  const driveResp = await graphFetch(`/sites/${siteId}/drive`);
  if (!driveResp.ok) {
    const text = await driveResp.text().catch(() => "");
    throw new Error(`Drive do site não encontrado (${driveResp.status}): ${text || driveResp.statusText}`);
  }
  const drive = (await driveResp.json()) as { id?: string };
  const driveId = String(drive.id ?? "");
  if (!driveId) throw new Error("Resposta do Graph sem drive id.");
  return { siteId, driveId };
}

export async function getDriveItemByPath(driveId: string, itemPath: string): Promise<DriveItemRef | null> {
  const encoded = itemPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const resp = await graphFetch(`/drives/${encodeURIComponent(driveId)}/root:/${encoded}`);
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Erro ao ler pasta SharePoint (${resp.status}): ${text || resp.statusText}`);
  }
  return mapDriveItem((await resp.json()) as GraphDriveItem);
}

export async function ensureDriveFolderPath(driveId: string, folderPath: string): Promise<DriveItemRef> {
  const segments = folderPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    const resp = await graphFetch(`/drives/${encodeURIComponent(driveId)}/root`);
    if (!resp.ok) throw new Error("Drive root inacessível.");
    return mapDriveItem((await resp.json()) as GraphDriveItem);
  }

  let currentPath = "";
  let last: DriveItemRef | null = null;
  for (const seg of segments) {
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;
    const existing = await getDriveItemByPath(driveId, currentPath);
    if (existing) {
      last = existing;
      continue;
    }
    const parentPath = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : "";
    const createUrl = parentPath
      ? `/drives/${encodeURIComponent(driveId)}/root:/${parentPath.split("/").map(encodeURIComponent).join("/")}:/children`
      : `/drives/${encodeURIComponent(driveId)}/root/children`;

    const resp = await graphFetch(createUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: seg,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (resp.status === 409) {
      const again = await getDriveItemByPath(driveId, currentPath);
      if (again) {
        last = again;
        continue;
      }
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Erro ao criar pasta "${seg}" (${resp.status}): ${text || resp.statusText}`);
    }
    last = mapDriveItem((await resp.json()) as GraphDriveItem);
  }
  if (!last) throw new Error("Falha ao garantir caminho de pasta.");
  return last;
}

export async function createChildFolder(
  driveId: string,
  parentItemId: string,
  folderName: string,
): Promise<DriveItemRef> {
  const resp = await graphFetch(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Erro ao criar subpasta (${resp.status}): ${text || resp.statusText}`);
  }
  return mapDriveItem((await resp.json()) as GraphDriveItem);
}

export async function uploadFileToFolder(
  driveId: string,
  folderItemId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<DriveItemRef> {
  const encodedName = encodeURIComponent(fileName);
  const resp = await graphFetch(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderItemId)}:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        "content-type": contentType || "application/octet-stream",
      },
      body: buffer,
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Erro ao enviar arquivo ao SharePoint (${resp.status}): ${text || resp.statusText}`);
  }
  return mapDriveItem((await resp.json()) as GraphDriveItem);
}

export type DriveDeltaPage = {
  items: DriveItemRef[];
  deltaLink: string | null;
};

export async function listDriveFolderDelta(
  driveId: string,
  folderItemId: string,
  deltaLink?: string | null,
): Promise<DriveDeltaPage> {
  const url =
    deltaLink ??
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderItemId)}/delta`;
  const resp = await graphFetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Erro no delta SharePoint (${resp.status}): ${text || resp.statusText}`);
  }
  const data = (await resp.json()) as {
    value?: GraphDriveItem[];
    "@odata.deltaLink"?: string;
    "@odata.nextLink"?: string;
  };

  const items = (data.value ?? []).map(mapDriveItem).filter((i) => i.id);
  if (data["@odata.nextLink"]) {
    const next = await listDriveFolderDelta(driveId, folderItemId, data["@odata.nextLink"]);
    return {
      items: [...items, ...next.items],
      deltaLink: next.deltaLink,
    };
  }
  return {
    items,
    deltaLink: data["@odata.deltaLink"] ?? null,
  };
}

export async function downloadDriveItemContent(driveId: string, itemId: string): Promise<Buffer> {
  const resp = await graphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Erro ao baixar arquivo SharePoint (${resp.status}): ${text || resp.statusText}`);
  }
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
}

export function logSharePointError(context: string, err: unknown): void {
  console.error(`[SHAREPOINT] ${context}:`, errorSummary(err));
}
