"use client";

import { useCallback, useState } from "react";
import { FileText, Download, ExternalLink } from "lucide-react";
import { type ProjectForCard } from "@/components/ProjectCard";
import { API_BASE_URL } from "@/lib/api";

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tipoArquivoLabel(tipo: string | null | undefined): string {
  if (!tipo?.trim()) return "";
  const t = tipo.toLowerCase();
  if (t.includes("pdf")) return "PDF";
  if (t.includes("wordprocessingml") || t.includes("docx")) return "DOCX";
  return tipo;
}

function getAttachmentFullUrl(anexoUrl: string | null | undefined): string | null {
  const u = anexoUrl?.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${API_BASE_URL}${u.startsWith("/") ? u : `/${u}`}`;
}

type Props = {
  project: ProjectForCard;
};

export function ProjectPropostaComercialReadonly({ project }: Props) {
  // Preferir endpoint autenticado para proposta comercial (evita exposição direta via /uploads).
  const fullUrl =
    project.id ? `${API_BASE_URL}/api/projects/${project.id}/proposal` : getAttachmentFullUrl(project.anexoUrl);
  const displayName =
    project.anexoNomeArquivo?.trim() ||
    (project.anexoUrl?.includes("/") ? project.anexoUrl.split("/").pop() : null) ||
    "Proposta comercial";
  const hasFile = !!fullUrl;
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!fullUrl) return;
    const name = displayName || "proposta-comercial";
    setDownloading(true);
    try {
      const downloadUrl = fullUrl.includes("?") ? `${fullUrl}&download=1` : `${fullUrl}?download=1`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(fullUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }, [fullUrl, displayName]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 space-y-3 w-full">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-slate-500 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Proposta comercial</h2>
      </div>
      {!hasFile ? (
        <p className="text-sm text-slate-600">Nenhum arquivo de proposta comercial foi anexado a este projeto.</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate" title={displayName}>
              {displayName}
            </p>
            {(project.anexoTamanho != null && project.anexoTamanho > 0) || project.anexoTipo ? (
              <p className="text-xs text-slate-500 mt-0.5">
                {[tipoArquivoLabel(project.anexoTipo), formatFileSize(project.anexoTamanho ?? undefined)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={fullUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Visualizar
            </a>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {downloading ? "Baixando…" : "Baixar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
