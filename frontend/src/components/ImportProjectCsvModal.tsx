"use client";

import { useRef, useState } from "react";
import { X, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  FormModalSection,
  formModalBackdropClass,
  formModalPanelNarrowClass,
  formModalInputClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ImportProjectCsvModalProps = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onImported: () => void;
};

export function ImportProjectCsvModal({ projectId, projectName, onClose, onImported }: ImportProjectCsvModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Selecione um arquivo CSV.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/api/projects/${projectId}/tickets-import-csv`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(data?.errors)) {
          const lines = data.errors
            .slice(0, 12)
            .map((x: { line?: number; message?: string }) => `Linha ${x.line ?? "?"}: ${x.message ?? ""}`)
            .join("\n");
          setError(data.errors.length > 12 ? `${lines}\n…` : lines);
        } else {
          setError(data?.error ?? "Erro ao importar CSV.");
        }
        return;
      }
      onImported();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={formModalBackdropClass + " animate-in fade-in duration-200"} onClick={onClose}>
      <div
        className={formModalPanelNarrowClass + " animate-in zoom-in-95 duration-200 max-w-lg"}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 px-6 md:px-8 pt-5 pb-4 border-b bg-[color:var(--surface)]/92 backdrop-blur-xl"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0"
                style={{
                  borderColor: "rgba(92, 0, 225, 0.35)",
                  background: "linear-gradient(135deg, rgba(92, 0, 225, 0.18), rgba(87, 66, 118, 0.18))",
                  boxShadow: "0 12px 26px rgba(92, 0, 225, 0.10)",
                }}
              >
                <Upload className="h-5 w-5" style={{ color: "var(--primary)" }} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-[color:var(--foreground)]">Importar CSV</h2>
                <p className="text-xs md:text-sm text-[color:var(--muted-foreground)] mt-0.5 line-clamp-2">
                  Projeto: {projectName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border transition hover:opacity-90 shrink-0"
              style={{
                borderColor: "var(--border)",
                background: "rgba(0,0,0,0.06)",
                color: "var(--muted-foreground)",
              }}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col bg-[color:var(--background)] min-h-0" noValidate>
          {error && (
            <div className="px-6 md:px-8 pt-4 shrink-0">
              <div
                className="rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap"
                style={{
                  borderColor: "rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.10)",
                  color: "var(--foreground)",
                }}
              >
                <span className="font-semibold">Atenção:</span>{" "}
                <span className="text-[color:var(--muted-foreground)]">{error}</span>
              </div>
            </div>
          )}

          <div className="px-6 md:px-8 py-6 space-y-6 flex-1 overflow-y-auto">
            <FormModalSection title="Arquivo">
              <div>
                <label className={formModalLabelClass}>CSV (UTF-8)</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className={formModalInputClass(false)}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </FormModalSection>

            <FormModalSection title="Colunas esperadas (cabeçalho na 1ª linha)">
              <ul className="text-xs text-[color:var(--muted-foreground)] space-y-1.5 list-disc pl-4">
                <li>
                  <strong className="text-[color:var(--foreground)]">Identificador do tópico</strong> (ex.: TP-01) —
                  obrigatório; agrupa as linhas do mesmo tópico.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Nome do tópico</strong> — obrigatório, único no
                  projeto e no arquivo (letras, números e espaços).
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Orçado horas</strong> (tópico) — opcional,
                  número.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Nome da tarefa</strong> — obrigatório.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Membros</strong> — opcional; nome exatamente como
                  no cadastro; vários separados por <code className="text-[11px]">;</code> ou <code className="text-[11px]">|</code>.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Horas</strong> (tarefa) — opcional, número.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Prioridade</strong> — opcional (obrigatória em
                  projeto AMS): baixa, média, alta, urgente.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Data de início</strong> — opcional (DD/MM/AAAA ou
                  AAAA-MM-DD).
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Data de entrega</strong> — obrigatória.
                </li>
                <li>
                  <strong className="text-[color:var(--foreground)]">Descrição</strong> — opcional (texto longo).
                </li>
              </ul>
              <p className="text-[11px] text-[color:var(--muted-foreground)] mt-3">
                Separador: ponto e vírgula (;) ou vírgula (,). Use aspas duplas se o texto tiver separador dentro do
                campo.
              </p>
            </FormModalSection>
          </div>

          <div
            className="sticky bottom-0 flex justify-end gap-2 px-6 md:px-8 py-4 border-t bg-[color:var(--surface)]/92 backdrop-blur-xl"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border text-sm font-medium transition hover:opacity-90"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[color:var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {saving ? "Importando…" : "Importar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
