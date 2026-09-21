"use client";

import { CreditCard, Mail, MessageCircle, X } from "lucide-react";

const PURPLE = "#5c00e1";
const CONTACT_EMAIL = "contato@wpsone.com.br";
const CONTACT_WHATSAPP_E164 = "5551992108997";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SubscriptionLockedModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-locked-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: PURPLE }}
              aria-hidden
            >
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: PURPLE }}>
                Acesso pausado
              </p>
              <h2
                id="subscription-locked-title"
                className="mt-1 text-lg font-semibold text-[color:var(--foreground)]"
              >
                Seu período de uso chegou ao fim
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--muted-foreground)] transition hover:bg-black/5"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
          <p>
            O teste grátis ou a assinatura desta organização foi encerrado, então o acesso ficou
            temporariamente pausado — nada foi perdido.
          </p>
          <p>
            Para voltar a usar o WPS One, basta ativar um plano. Se você for o administrador, a gente
            te ajuda a reativar. Se não for, peça ao responsável da empresa ou fale com a gente.
          </p>

          <div
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "rgba(92,0,225,0.25)", background: "rgba(92,0,225,0.06)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
              Como reativar
            </p>
            <ul className="mt-2 space-y-1.5 text-[color:var(--foreground)]">
              <li>1. Entre em contato com a WPS One</li>
              <li>2. Escolha um plano e confirme a assinatura</li>
              <li>3. Faça login novamente — pronto</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] px-5 py-4 sm:flex-row sm:justify-end">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Reativar acesso WPS One")}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[color:var(--border)] px-4 text-sm font-medium text-[color:var(--foreground)] transition hover:bg-black/5"
          >
            <Mail className="h-4 w-4" />
            E-mail
          </a>
          <a
            href={`https://wa.me/${CONTACT_WHATSAPP_E164}?text=${encodeURIComponent("Olá! Gostaria de reativar o acesso ao WPS One.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition hover:opacity-95"
            style={{ background: PURPLE }}
          >
            <MessageCircle className="h-4 w-4" />
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
