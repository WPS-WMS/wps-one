"use client";

import { useRef, useState } from "react";
import type { ApontamentoViolationRule } from "@/lib/apontamentoViolacao";
import { getViolationRuleLabel } from "@/lib/apontamentoViolacao";
import { getApprovalRulesSummary } from "@/lib/submitPermissionRequests";

export type TimeEntryPermissionPayload = {
  date: string;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  totalHoras: number;
  description?: string;
  projectId: string;
  ticketId?: string;
  activityId?: string;
  /** Edição acima do limite: ao aprovar, atualiza este apontamento em vez de criar outro. */
  replacesTimeEntryId?: string;
};

type TimeEntryPermissionModalProps = {
  payload: TimeEntryPermissionPayload;
  violationRules?: ApontamentoViolationRule[];
  onClose: () => void;
  onSent: () => void;
  onSubmitRequest: (payload: TimeEntryPermissionPayload & { justification: string }) => Promise<boolean>;
};

export function TimeEntryPermissionModal({
  payload,
  violationRules = [],
  onClose,
  onSent,
  onSubmitRequest,
}: TimeEntryPermissionModalProps) {
  const [justification, setJustification] = useState("");
  const [sending, setSending] = useState(false);
  // Evita double-click rápido disparar múltiplos POSTs antes do React re-renderizar.
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const overlayPointerDownRef = useRef(false);

  async function handleSend() {
    if (sendingRef.current) return;
    const j = justification.trim();
    if (!j) {
      setError("Informe a justificativa para enviar a solicitação.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const ok = await onSubmitRequest({ ...payload, justification: j });
      if (ok) {
        onSent();
      } else {
        setError("Não foi possível enviar a solicitação. Verifique as regras do apontamento para esta data.");
      }
    } catch (e: any) {
      const msg = typeof e?.message === "string" && e.message.trim() ? e.message : "Erro ao enviar. Tente novamente.";
      setError(msg);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
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
        className="bg-white rounded-2xl border border-blue-100 w-full max-w-md shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Enviar para aprovação</h3>
        <p className="text-sm text-gray-600 mb-4">
          {violationRules.length > 0 ? (
            <>
              Este apontamento precisa de aprovação por{" "}
              <strong>{getApprovalRulesSummary(violationRules)}</strong>.
              {violationRules.length > 1
                ? " Será criada uma solicitação para cada regra."
                : null}{" "}
              Informe a justificativa para o gestor ou administrador.
            </>
          ) : (
            <>
              Você não tem permissão para registrar este apontamento diretamente.
              Deseja enviar uma solicitação para o administrador aprovar?
            </>
          )}
        </p>
        {violationRules.length > 1 && (
          <ul className="text-xs text-gray-500 mb-3 list-disc pl-5 space-y-1">
            {violationRules.map((rule) => (
              <li key={rule}>{getViolationRuleLabel(rule)}</li>
            ))}
          </ul>
        )}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Justificativa <span className="text-red-500">*</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => {
              setJustification(e.target.value);
              setError("");
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[80px] resize-y"
            placeholder="Explique o motivo do apontamento fora do horário..."
            maxLength={500}
            rows={3}
          />
        </div>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar solicitação"}
          </button>
        </div>
      </div>
    </div>
  );
}
