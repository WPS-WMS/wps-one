export type PayeeProfessional = {
  id: string;
  name: string;
  linkedSupplierId?: string | null;
  linkedSupplierIds?: string[];
};

export function linkedSupplierIdsOf(user?: PayeeProfessional | null): string[] {
  if (!user) return [];
  if (user.linkedSupplierIds && user.linkedSupplierIds.length > 0) {
    return [...new Set(user.linkedSupplierIds.filter(Boolean))];
  }
  return user.linkedSupplierId ? [user.linkedSupplierId] : [];
}

export function supplierIdAfterProfessionalChange(
  currentSupplierId: string,
  prevLinkedIds: string[],
  nextLinkedIds: string[],
): string {
  if (nextLinkedIds.length === 1) return nextLinkedIds[0]!;
  if (currentSupplierId && nextLinkedIds.includes(currentSupplierId)) return currentSupplierId;
  if (currentSupplierId && prevLinkedIds.includes(currentSupplierId)) return "";
  if (currentSupplierId && nextLinkedIds.length === 0) return currentSupplierId;
  return "";
}

export function supplierSelectOptions(
  suppliers: Array<{ id: string; nomeApelido: string }>,
  linkedIds: string[],
): { value: string; label: string }[] {
  const pool =
    linkedIds.length > 0 ? suppliers.filter((s) => linkedIds.includes(s.id)) : suppliers;
  const placeholder = linkedIds.length > 1 ? "Selecione o fornecedor" : "—";
  return [
    { value: "", label: placeholder },
    ...pool.map((s) => ({ value: s.id, label: s.nomeApelido })),
  ];
}

export function missingSupplierWhenMultipleLinks(
  professional: PayeeProfessional | undefined,
  supplierId: string,
): boolean {
  return linkedSupplierIdsOf(professional).length > 1 && !supplierId;
}
