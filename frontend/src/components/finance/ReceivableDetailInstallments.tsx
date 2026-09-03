"use client";

import type { ReactNode } from "react";
import { Ban, Banknote, ChevronDown, Eye, Layers, Loader2, Pencil, X } from "lucide-react";
import { formatarData, formatarMoeda } from "@/lib/brFormatters";

export type DetailInstallmentLike = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  competenceDate?: string | null;
  amountCents: number;
  status: string;
  receivedAt: string | null;
  nfNumber?: string | null;
  focusNfeRef?: string | null;
  focusNfeStatus?: string | null;
  focusNfeUrl?: string | null;
  focusNfeDanfseUrl?: string | null;
  hasInternalDocument?: boolean;
  billingDocumentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null;
  description?: string | null;
  receivableId?: string | null;
  billingGroupId?: string | null;
  billingGroupDescription?: string | null;
  milestone?: string | null;
  measurementId?: string | null;
  measurementTitle?: string | null;
  measurementIndex?: number | null;
  localInstallmentNumber?: number | null;
};

type MeasurementGroup = {
  key: string;
  title: string;
  measurementIndex: number | null;
  installments: DetailInstallmentLike[];
  totalCents: number;
};

export type MeasurementGroupMeta = {
  measurementId: string;
  measurementTitle: string;
  measurementIndex: number;
};

export function buildMeasurementGroups(
  installments: DetailInstallmentLike[],
  measurementGroups?: MeasurementGroupMeta[] | null,
): MeasurementGroup[] {
  if (measurementGroups && measurementGroups.length > 0) {
    const byId = new Map<string, DetailInstallmentLike[]>();
    for (const inst of installments) {
      const key = inst.measurementId || "sem-medicao";
      const list = byId.get(key) ?? [];
      list.push(inst);
      byId.set(key, list);
    }
    const groups: MeasurementGroup[] = measurementGroups.map((meta) => {
      const rows = (byId.get(meta.measurementId) ?? []).sort(
        (a, b) =>
          (a.localInstallmentNumber ?? a.installmentNumber) -
          (b.localInstallmentNumber ?? b.installmentNumber),
      );
      return {
        key: meta.measurementId,
        title: meta.measurementTitle,
        measurementIndex: meta.measurementIndex,
        installments: rows,
        totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
      };
    });
    const leftovers = byId.get("sem-medicao");
    if (leftovers?.length) {
      groups.push({
        key: "sem-medicao",
        title: "Outras parcelas",
        measurementIndex: null,
        installments: leftovers,
        totalCents: leftovers.reduce((sum, row) => sum + row.amountCents, 0),
      });
    }
    return groups;
  }

  const order: string[] = [];
  const byKey = new Map<string, MeasurementGroup>();
  for (const inst of installments) {
    const key =
      inst.measurementId ||
      (inst.measurementIndex != null ? `idx-${inst.measurementIndex}` : null) ||
      "sem-medicao";
    let group = byKey.get(key);
    if (!group) {
      const index = inst.measurementIndex ?? null;
      const rawTitle = (inst.measurementTitle ?? "").trim();
      group = {
        key,
        title:
          rawTitle ||
          (index != null ? `Medição ${index}` : key === "sem-medicao" ? "Outras parcelas" : "Medição"),
        measurementIndex: index,
        installments: [],
        totalCents: 0,
      };
      byKey.set(key, group);
      order.push(key);
    }
    group.installments.push(inst);
    group.totalCents += inst.amountCents;
  }
  return order.map((key) => {
    const group = byKey.get(key)!;
    group.installments.sort(
      (a, b) =>
        (a.localInstallmentNumber ?? a.installmentNumber) -
        (b.localInstallmentNumber ?? b.installmentNumber),
    );
    return group;
  });
}

/** @deprecated Prefer buildMeasurementGroups */
export function groupInstallmentsByMeasurement(
  installments: DetailInstallmentLike[],
): MeasurementGroup[] {
  return buildMeasurementGroups(installments);
}

function focusNoteViewUrl(danfse?: string | null, xml?: string | null): string | null {
  const url = (danfse ?? "").trim() || (xml ?? "").trim();
  return url || null;
}

function receivedAtIso(receivedAt: string | null): string | null {
  if (typeof receivedAt === "string") return receivedAt.slice(0, 10);
  if (receivedAt) return new Date(receivedAt).toISOString().slice(0, 10);
  return null;
}

type StatusBadgeFn = (props: {
  status: string;
  nfNumber?: string | null;
  paid?: boolean;
}) => ReactNode;

type Props = {
  installments: DetailInstallmentLike[];
  layout: "measurement" | "milestone" | "default";
  isGroup: boolean;
  detailStatus: string;
  detailId: string;
  detailBillingDocumentType?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null;
  measurementGroups?: MeasurementGroupMeta[] | null;
  cancellingFocusId: string | null;
  expandedMeasurements: Set<string>;
  onToggleMeasurement: (key: string) => void;
  StatusBadge: StatusBadgeFn;
  internalDocumentViewTitle: (
    type?: "NOTA_FISCAL" | "NOTA_DEBITO" | "INVOICE" | null,
  ) => string;
  onOpenGroup: (billingGroupId: string, description: string) => void;
  onEditGroupInstallment: (inst: DetailInstallmentLike) => void;
  onOpenInternal: (inst: DetailInstallmentLike) => void;
  onOpenFocusNote: (url: string) => void;
  onCancelFocus: (inst: DetailInstallmentLike) => void;
  onCancelInternal: (inst: DetailInstallmentLike) => void;
  onCancelInstallment: (inst: DetailInstallmentLike) => void;
  onReceive: (inst: DetailInstallmentLike) => void;
};

export function ReceivableDetailInstallments(props: Props) {
  const {
    installments,
    layout,
    isGroup,
    detailStatus,
    detailId,
    detailBillingDocumentType,
    measurementGroups,
    cancellingFocusId,
    expandedMeasurements,
    onToggleMeasurement,
    StatusBadge,
    internalDocumentViewTitle,
    onOpenGroup,
    onEditGroupInstallment,
    onOpenInternal,
    onOpenFocusNote,
    onCancelFocus,
    onCancelInternal,
    onCancelInstallment,
    onReceive,
  } = props;

  const showMilestone = !isGroup && layout === "milestone";
  const showRevenueDates = !isGroup && (layout === "milestone" || layout === "measurement");
  const useLocalParcel = !isGroup && layout === "measurement";

  function renderRow(inst: DetailInstallmentLike) {
    const viewUrl = focusNoteViewUrl(inst.focusNfeDanfseUrl, inst.focusNfeUrl);
    const canCancelInst =
      !!inst.focusNfeRef &&
      (inst.focusNfeStatus === "autorizado" ||
        (!!inst.nfNumber && inst.focusNfeStatus !== "cancelado")) &&
      inst.status !== "RECEBIDO" &&
      inst.status !== "CANCELADO" &&
      detailStatus !== "CANCELADO";
    const groupedElsewhere = Boolean(inst.billingGroupId && !isGroup);
    const canReceiveInst =
      !groupedElsewhere &&
      (inst.status === "FATURADO" || !!inst.nfNumber) &&
      inst.status !== "RECEBIDO" &&
      inst.status !== "CANCELADO";
    const canCancelInstSafe = canCancelInst && !groupedElsewhere;
    const hasInternalDoc = Boolean(inst.hasInternalDocument);
    const canCancelInternal =
      hasInternalDoc &&
      !groupedElsewhere &&
      inst.status !== "RECEBIDO" &&
      inst.status !== "CANCELADO" &&
      inst.focusNfeStatus !== "autorizado";
    const parcelNumber = useLocalParcel
      ? (inst.localInstallmentNumber ?? inst.installmentNumber)
      : inst.installmentNumber;

    return (
      <tr key={inst.id} className="border-t" style={{ borderColor: "var(--border)" }}>
        {showMilestone ? (
          <td className="py-2 pr-3 max-w-[200px] truncate" title={inst.milestone || undefined}>
            {inst.milestone?.trim() || "—"}
          </td>
        ) : null}
        <td className={`py-2 pr-3 ${useLocalParcel || showMilestone ? "text-center" : ""}`}>
          {parcelNumber}
        </td>
        {isGroup ? (
          <td className="py-2 pr-3 max-w-[220px] truncate" title={inst.description || undefined}>
            {inst.description || "—"}
          </td>
        ) : null}
        {showRevenueDates ? (
          <td className="py-2 pr-3">{formatarData(inst.competenceDate ?? null)}</td>
        ) : null}
        <td className="py-2 pr-3">{formatarData(inst.dueDate)}</td>
        <td className="py-2 pr-3">{formatarData(receivedAtIso(inst.receivedAt))}</td>
        <td className="py-2 pr-3 text-right">{formatarMoeda(inst.amountCents / 100)}</td>
        <td className="py-2 pr-3">
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={inst.status} nfNumber={inst.nfNumber} paid={inst.status === "RECEBIDO"} />
            {inst.focusNfeStatus === "cancelado" && (
              <span className="text-[10px] text-red-700">NF cancelada</span>
            )}
            {groupedElsewhere && inst.billingGroupId ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-violet-600/15 px-2 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-600/25"
                onClick={() =>
                  onOpenGroup(inst.billingGroupId!, inst.billingGroupDescription || "Grupo")
                }
              >
                <Layers className="h-3 w-3" aria-hidden />
                {inst.billingGroupDescription || "Grupo"}
              </button>
            ) : null}
          </div>
        </td>
        <td className="py-2">
          <div className="inline-flex items-center gap-0.5">
            {isGroup && inst.status !== "RECEBIDO" && inst.status !== "CANCELADO" && (
              <button
                type="button"
                className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                title="Editar"
                aria-label="Editar"
                onClick={() => onEditGroupInstallment(inst)}
              >
                <Pencil className="h-4 w-4 text-[color:var(--muted-foreground)]" />
              </button>
            )}
            {hasInternalDoc && (
              <button
                type="button"
                onClick={() => onOpenInternal(inst)}
                className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                title={internalDocumentViewTitle(inst.billingDocumentType ?? detailBillingDocumentType)}
                aria-label={internalDocumentViewTitle(
                  inst.billingDocumentType ?? detailBillingDocumentType,
                )}
              >
                <Eye className="h-4 w-4 text-[color:var(--primary)]" />
              </button>
            )}
            {viewUrl && (
              <button
                type="button"
                onClick={() => onOpenFocusNote(viewUrl)}
                className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                title={
                  inst.focusNfeStatus === "cancelado"
                    ? "Visualizar nota cancelada"
                    : "Visualizar nota"
                }
                aria-label={
                  inst.focusNfeStatus === "cancelado"
                    ? "Visualizar nota cancelada"
                    : "Visualizar nota"
                }
              >
                <Eye className="h-4 w-4 text-[color:var(--primary)]" />
              </button>
            )}
            {canCancelInstSafe && (
              <button
                type="button"
                disabled={cancellingFocusId === inst.id}
                onClick={() => onCancelFocus(inst)}
                className="inline-flex rounded-md p-1.5 hover:bg-black/5 disabled:opacity-50"
                title="Cancelar nota"
                aria-label="Cancelar nota"
              >
                {cancellingFocusId === inst.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                ) : (
                  <Ban className="h-4 w-4 text-red-600" />
                )}
              </button>
            )}
            {!canCancelInstSafe && canCancelInternal && (
              <button
                type="button"
                onClick={() => onCancelInternal(inst)}
                className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                title="Cancelar documento"
                aria-label="Cancelar documento"
              >
                <Ban className="h-4 w-4 text-red-600" />
              </button>
            )}
            {inst.status !== "RECEBIDO" &&
              inst.status !== "CANCELADO" &&
              !groupedElsewhere &&
              installments.filter(
                (i) =>
                  (i.receivableId ?? detailId) === (inst.receivableId ?? detailId) &&
                  i.status !== "CANCELADO",
              ).length > 1 && (
                <button
                  type="button"
                  onClick={() => onCancelInstallment(inst)}
                  className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                  title="Cancelar parcela"
                  aria-label="Cancelar parcela"
                >
                  <X className="h-4 w-4 text-red-600" />
                </button>
              )}
            {canReceiveInst && (
              <button
                type="button"
                onClick={() => onReceive(inst)}
                className="inline-flex rounded-md p-1.5 hover:bg-black/5"
                title="Receber pagamento"
                aria-label="Receber pagamento"
              >
                <Banknote className="h-4 w-4 text-[color:var(--primary)]" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  function renderTableHead() {
    return (
      <thead>
        <tr className="text-left text-[color:var(--muted-foreground)]">
          {showMilestone ? <th className="py-1 pr-3">Marco</th> : null}
          <th className={`py-1 pr-3 ${useLocalParcel || showMilestone ? "text-center" : ""}`}>
            {showRevenueDates || isGroup ? "Parcela" : "#"}
          </th>
          {isGroup ? <th className="py-1 pr-3">Descrição</th> : null}
          {showRevenueDates ? <th className="py-1 pr-3">Data</th> : null}
          <th className="py-1 pr-3">{showRevenueDates ? "Prev. pagamento" : "Vencimento"}</th>
          <th className="py-1 pr-3">Recebimento</th>
          <th className="py-1 pr-3 text-right">Valor</th>
          <th className="py-1 pr-3">Status</th>
          <th className="py-1">Ações</th>
        </tr>
      </thead>
    );
  }

  if (!isGroup && layout === "measurement") {
    const groups = buildMeasurementGroups(installments, measurementGroups);
    if (groups.length > 0) {
      return (
        <div className="mt-2 space-y-2">
          {groups.map((group) => {
            const expanded = expandedMeasurements.has(group.key);
            return (
              <div
                key={group.key}
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => onToggleMeasurement(group.key)}
                  className={`flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    expanded ? "border-b bg-black/[0.02]" : "hover:bg-black/[0.02]"
                  }`}
                  style={expanded ? { borderColor: "var(--border)" } : undefined}
                  aria-expanded={expanded}
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[color:var(--muted-foreground)] transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--foreground)]">
                    {group.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-[color:var(--muted-foreground)]">
                    {group.installments.length} parcela
                    {group.installments.length === 1 ? "" : "s"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--foreground)]">
                    {formatarMoeda(group.totalCents / 100)}
                  </span>
                </button>
                {expanded ? (
                  <div className="overflow-x-auto p-2">
                    {group.installments.length > 0 ? (
                      <table className="min-w-full text-xs">
                        {renderTableHead()}
                        <tbody>{group.installments.map((inst) => renderRow(inst))}</tbody>
                      </table>
                    ) : (
                      <p className="px-2 py-3 text-xs text-[color:var(--muted-foreground)]">
                        Nenhuma parcela nesta conta a receber para esta medição.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }
  }

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full text-xs">
        {renderTableHead()}
        <tbody>{installments.map((inst) => renderRow(inst))}</tbody>
      </table>
    </div>
  );
}
