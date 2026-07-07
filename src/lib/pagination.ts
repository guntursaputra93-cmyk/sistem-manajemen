export const PAGE_SIZE = 20;

export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function offsetFor(page: number, pageSize = PAGE_SIZE): number {
  return (page - 1) * pageSize;
}

export function totalPages(totalCount: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
