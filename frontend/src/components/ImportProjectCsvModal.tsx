"use client";

import { useCallback, useRef, useState } from "react";
import { X, Upload, Download, FileSpreadsheet, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  FormModalSection,
  formModalBackdropClass,
  formModalPanelWideClass,
  formModalLabelClass,
} from "@/components/FormModalPrimitives";

type ImportProjectCsvModalProps = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onImported: () => void;
};

/** UTF-8 com BOM para Excel PT-BR; separador `;`. Cabeçalhos alinhados ao parser do backend. */
const CSV_MODEL_CONTENT = [
  "Identificador do tópico;Nome do tópico;Orçado horas;Nome da tarefa;Membros;Horas;Prioridade;Data de início;Data de entrega;Descrição",
  "TP-01;Módulo financeiro;40;Conciliar extrato;Maria Silva;8;alta;01/05/2026;30/06/2026;Exemplo: texto livre (opcional)",
  "TP-01;Módulo financeiro;;Segunda tarefa do mesmo tópico;;4;baixa;;30/06/2026;",
  "TP-02;Módulo RH;;Onboarding checklist;João Santos;2;media;10/06/2026;15/07/2026;",
].join("\n");

const COLUMN_LEGEND: Array<{
  coluna: string;
  obrigatorio: string;
  exemplo: string;
  dica?: string;
}> = [
  {
    coluna: "Identificador do tópico",
    obrigatorio: "Sim",
    exemplo: "TP-01",
    dica: "Agrupa linhas do mesmo tópico. Letras, números, ponto, hífen e sublinhado.",
  },
  {
    coluna: "Nome do tópico",
    obrigatorio: "Sim",
    exemplo: "Módulo financeiro",
    dica: "Único no projeto e no arquivo. Letras, números e espaços.",
  },
  {
    coluna: "Orçado horas",
    obrigatorio: "Não",
    exemplo: "40",
    dica: "Horas totais estimadas do tópico (número).",
  },
  {
    coluna: "Nome da tarefa",
    obrigatorio: "Sim",
    exemplo: "Conciliar extrato",
  },
  {
    coluna: "Membros",
    obrigatorio: "Não",
    exemplo: "Maria Silva; João Santos",
    dica: "Nome exatamente como no cadastro. Vários: separar com ; ou |.",
  },
  {
    coluna: "Horas",
    obrigatorio: "Não",
    exemplo: "8 ou 7,5",
    dica: "Estimativa da tarefa (número; vírgula ou ponto decimal).",
  },
  {
    coluna: "Prioridade",
    obrigatorio: "AMS: sim",
    exemplo: "baixa, média, alta, urgente",
    dica: "Em projeto AMS a prioridade é obrigatória em cada linha.",
  },
  {
    coluna: "Data de início",
    obrigatorio: "Não",
    exemplo: "01/05/2026 ou 2026-05-01",
  },
  {
    coluna: "Data de entrega",
    obrigatorio: "Sim",
    exemplo: "30/06/2026",
  },
  {
    coluna: "Descrição",
    obrigatorio: "Não",
    exemplo: "Detalhes da entrega…",
    dica: "Texto longo; use aspas no CSV se tiver ponto e vírgula dentro do texto.",
  },
];

function downloadModeloCsv() {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + CSV_MODEL_CONTENT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-topicos-tarefas.csv";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImportProjectCsvModal({ projectId, projectName, onClose, onImported }: ImportProjectCsvModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const onDownloadModelo = useCallback(() => {
    downloadModeloCsv();
  }, []);

  const pickFiles = (list: FileList | null) => {
    const f = list?.[0];
    if (f && (f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv" || f.type === "application/vnd.ms-excel")) {
      setFile(f);
      setError("");
      return;
    }
    if (f) setError("Use um arquivo .csv.");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Selecione ou arraste um arquivo CSV.");
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
            .slice(0, 14)
            .map((x: { line?: number; message?: string }) => `Linha ${x.line ?? "?"}: ${x.message ?? ""}`)
            .join("\n");
          setError(data.errors.length > 14 ? `${lines}\n…` : lines);
        } else {
          setError(data?.error ?? "Erro ao enviar o CSV.");
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
        className={
          formModalPanelWideClass +
          " animate-in zoom-in-95 duration-200 max-h-[min(94vh,900px)] ring-1 ring-[color:var(--border)]/60"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative shrink-0 overflow-hidden border-b px-6 md:px-8 pt-6 pb-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              background:
                "radial-gradient(900px 220px at 12% -20%, rgba(92,0,225,0.55), transparent 55%), radial-gradient(700px 200px at 88% 0%, rgba(87,66,118,0.45), transparent 50%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center border shadow-md shrink-0"
                style={{
                  borderColor: "rgba(92, 0, 225, 0.35)",
                  background: "linear-gradient(135deg, rgba(92, 0, 225, 0.22), rgba(87, 66, 118, 0.18))",
                  boxShadow: "0 18px 40px rgba(92, 0, 225, 0.12)",
                }}
              >
                <FileSpreadsheet className="h-6 w-6" style={{ color: "var(--primary)" }} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[color:var(--foreground)]">
                    Importar tópicos e tarefas
                  </h2>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      borderColor: "rgba(92, 0, 225, 0.28)",
                      background: "rgba(92, 0, 225, 0.10)",
                      color: "var(--foreground)",
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                    CSV
                  </span>
                </div>
                <p className="text-sm text-[color:var(--muted-foreground)] leading-relaxed">
                  Projeto: <span className="font-semibold text-[color:var(--foreground)]">{projectName}</span>
                </p>
                <p className="text-xs text-[color:var(--muted-foreground)] leading-relaxed max-w-2xl">
                  Envie um arquivo com cabeçalho na primeira linha. O sistema aceita separador{" "}
                  <strong className="text-[color:var(--foreground)]">;</strong> ou{" "}
                  <strong className="text-[color:var(--foreground)]">,</strong> (detecção automática).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl border transition hover:opacity-90 shrink-0"
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

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 bg-[color:var(--background)]" noValidate>
          {error && (
            <div className="px-6 md:px-8 pt-4 shrink-0">
              <div
                className="rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap shadow-sm"
                style={{
                  borderColor: "rgba(239,68,68,0.35)",
                  background: "linear-gradient(180deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06))",
                  color: "var(--foreground)",
                }}
              >
                <span className="font-semibold">Não foi possível importar:</span>{" "}
                <span className="text-[color:var(--muted-foreground)]">{error}</span>
              </div>
            </div>
          )}

          <div className="px-6 md:px-8 py-6 space-y-6 flex-1 overflow-y-auto min-h-0">
            <FormModalSection
              title="Modelo pronto para preencher"
              description="Baixe o arquivo com todas as colunas e linhas de exemplo. Substitua pelos dados reais e envie."
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={onDownloadModelo}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition hover:opacity-95 shadow-sm"
                  style={{
                    borderColor: "rgba(92, 0, 225, 0.35)",
                    background: "linear-gradient(135deg, rgba(92, 0, 225, 0.14), rgba(87, 66, 118, 0.10))",
                    color: "var(--foreground)",
                  }}
                >
                  <Download className="h-4 w-4" style={{ color: "var(--primary)" }} />
                  Baixar modelo CSV
                </button>
                <p className="text-xs text-[color:var(--muted-foreground)] leading-relaxed flex-1">
                  O arquivo já inclui <strong className="text-[color:var(--foreground)]">UTF-8 com BOM</strong> para o
                  Excel reconhecer acentos corretamente.
                </p>
              </div>
            </FormModalSection>

            <FormModalSection title="Legenda das colunas" description="Use exatamente estes títulos na primeira linha do seu CSV (como no modelo).">
              <div className="overflow-x-auto rounded-xl border border-[color:var(--border)]/90 bg-[color:var(--surface)]/40">
                <table className="min-w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface)]/70">
                      <th className="px-3 py-2.5 font-semibold text-[color:var(--foreground)]">Coluna</th>
                      <th className="px-3 py-2.5 font-semibold text-[color:var(--foreground)] whitespace-nowrap">
                        Obrigatório
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-[color:var(--foreground)]">Exemplo</th>
                      <th className="px-3 py-2.5 font-semibold text-[color:var(--muted-foreground)] hidden md:table-cell">
                        Observação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMN_LEGEND.map((row) => (
                      <tr
                        key={row.coluna}
                        className="border-b border-[color:var(--border)]/70 last:border-0 hover:bg-[color:var(--surface)]/55 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-medium text-[color:var(--foreground)] whitespace-nowrap">
                          {row.coluna}
                        </td>
                        <td className="px-3 py-2.5 text-[color:var(--muted-foreground)] whitespace-nowrap">
                          {row.obrigatorio}
                        </td>
                        <td className="px-3 py-2.5 text-[color:var(--foreground)]">
                          <code className="rounded-md bg-[color:var(--background)]/80 px-1.5 py-0.5 text-[11px] md:text-xs border border-[color:var(--border)]/80">
                            {row.exemplo}
                          </code>
                        </td>
                        <td className="px-3 py-2.5 text-[color:var(--muted-foreground)] hidden md:table-cell">
                          {row.dica ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormModalSection>

            <FormModalSection title="Seu arquivo" description="Arraste o CSV para a área abaixo ou clique para escolher.">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => pickFiles(e.target.files)}
              />
              <label className={formModalLabelClass}>Arquivo selecionado</label>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFiles(e.dataTransfer.files);
                }}
                className={
                  "group w-full rounded-2xl border-2 border-dashed px-5 py-10 text-center transition-all " +
                  (dragOver
                    ? "scale-[1.01] shadow-md"
                    : "hover:border-[color:var(--primary)]/45 hover:bg-[color:var(--surface)]/40")
                }
                style={{
                  borderColor: dragOver ? "rgba(92, 0, 225, 0.55)" : "var(--border)",
                  background: dragOver ? "rgba(92, 0, 225, 0.08)" : "rgba(0,0,0,0.02)",
                }}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm mb-3 transition group-hover:scale-105">
                  <Upload className="h-5 w-5" style={{ color: "var(--primary)" }} />
                </div>
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  {file ? file.name : "Arraste o CSV aqui ou clique para selecionar"}
                </p>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : "Máximo recomendado: 5 MB"}
                </p>
              </button>
              {file && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] underline-offset-2 hover:underline"
                    onClick={() => {
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    Remover arquivo
                  </button>
                </div>
              )}
            </FormModalSection>
          </div>

          <div
            className="shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-6 md:px-8 py-4 border-t bg-[color:var(--surface)]/90 backdrop-blur-xl"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border text-sm font-semibold transition hover:opacity-90"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !file}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md transition hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, var(--primary), rgba(92, 0, 225, 0.92))",
                color: "var(--primary-foreground)",
              }}
            >
              {saving ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
