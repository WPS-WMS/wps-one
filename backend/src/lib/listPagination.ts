/** Paginação limit/offset alinhada ao padrão de tickets (cap 500). */

export type ListPagination = {
  limit: number;
  offset: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function parseListPagination(
  rawLimit: unknown,
  rawOffset: unknown,
  opts?: { defaultLimit?: number; maxLimit?: number },
): ListPagination {
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = opts?.maxLimit ?? MAX_LIMIT;
  const n = parseInt(String(rawLimit ?? defaultLimit), 10);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(maxLimit, n) : defaultLimit;
  const off = parseInt(String(rawOffset ?? "0"), 10);
  const offset = Number.isFinite(off) && off > 0 ? off : 0;
  return { limit, offset };
}

export function paginatedJson<T>(
  items: T[],
  total: number,
  pagination: ListPagination,
): PaginatedResponse<T> {
  return {
    items,
    total,
    limit: pagination.limit,
    offset: pagination.offset,
  };
}
