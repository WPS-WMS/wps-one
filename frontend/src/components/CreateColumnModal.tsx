"use client";

import { useRef, useState } from "react";

type ColumnColor = {
  id: string;
  label: string;
  bgClass: string;
};

const COLUMN_COLORS: ColumnColor[] = [
  { id: "amber", label: "Âmbar", bgClass: "bg-amber-500" },
  { id: "cyan", label: "Ciano", bgClass: "bg-cyan-500" },
  { id: "purple", label: "Roxo", bgClass: "bg-purple-500" },
  { id: "indigo", label: "Índigo", bgClass: "bg-indigo-500" },
  { id: "teal", label: "Turquesa", bgClass: "bg-teal-500" },
  { id: "rose", label: "Rosa", bgClass: "bg-rose-500" },
  { id: "orange", label: "Laranja", bgClass: "bg-orange-500" },
  { id: "red", label: "Vermelho", bgClass: "bg-red-500" },
  { id: "fuchsia", label: "Fúcsia", bgClass: "bg-fuchsia-500" },
  { id: "lime", label: "Lima", bgClass: "bg-lime-500" },
  { id: "yellow", label: "Amarelo", bgClass: "bg-yellow-400" },
];

function pickColorFromBg(bg: string | undefined): ColumnColor {
  if (!bg) return COLUMN_COLORS[0];
  const found = COLUMN_COLORS.find((c) => c.bgClass === bg);
  return found ?? COLUMN_COLORS[0];
}

type CreateColumnModalProps = {
  projectId: string;
  onClose: () => void;
  onSaved: (column: { id: string; label: string; color: string }) => void;
  /** Modo edição: mantém o mesmo `id` (status nos tickets). */
  editColumn?: { id: string; label: string; color: string };
};

export function CreateColumnModal({ projectId: _projectId, onClose, onSaved, editColumn }: CreateColumnModalProps) {
  const [label, setLabel] = useState(() => (editColumn ? editColumn.label : ""));
  const [selectedColor, setSelectedColor] = useState<ColumnColor>(() => pickColorFromBg(editColumn?.color));
  const [error, setError] = useState("");
  const overlayPointerDownRef = useRef(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    if (!label.trim()) {
      setError("O nome da coluna é obrigatório.");
      labelInputRef.current?.focus();
      return;
    }

    if (editColumn) {
      onSaved({
        id: editColumn.id,
        label: label.trim(),
        color: selectedColor.bgClass,
      });
    } else {
      const normalizedId = `CUSTOM_${label.trim().toUpperCase().replace(/\s+/g, "_")}_${Date.now()}`;
      onSaved({
        id: normalizedId,
        label: label.trim(),
        color: selectedColor.bgClass,
      });
    }
    onClose();
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1.5";
  const labelHasError = !!error;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose = overlayPointerDownRef.current && e.target === e.currentTarget;
        overlayPointerDownRef.current = false;
        if (shouldClose) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">{editColumn ? "Editar coluna" : "Nova Coluna"}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {editColumn
              ? "Altere o nome ou a cor exibidos no Kanban. As tarefas desta coluna permanecem vinculadas ao mesmo status."
              : "Adicione uma nova coluna ao Kanban."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>
          <div>
            <label className={labelClass}>Nome da coluna *</label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (error) setError("");
              }}
              ref={labelInputRef}
              className={`${inputClass} ${
                labelHasError ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""
              }`}
              placeholder="Ex: Em revisão, Aguardando aprovação..."
              autoFocus
            />
            {labelHasError && (
              <p className="mt-1 text-sm text-red-600">Campo obrigatório.</p>
            )}
          </div>
          
          <div>
            <label className={labelClass}>Cor da coluna</label>
            <div className="grid grid-cols-4 gap-3 mt-2">
              {COLUMN_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`relative h-12 rounded-lg ${color.bgClass} border-2 transition-all ${
                    selectedColor.id === color.id
                      ? "border-slate-800 ring-2 ring-slate-400 ring-offset-2"
                      : "border-slate-300 hover:border-slate-400"
                  }`}
                  title={color.label}
                >
                  {selectedColor.id === color.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-white drop-shadow-lg"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Cor selecionada: {selectedColor.label}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              {editColumn ? "Salvar alterações" : "Criar coluna"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
