import Link from "next/link";

// Generik & dipakai bersama semua tab arsip (Bagian 4/6 langkah 9) — tiap tab
// punya `pageParamName` sendiri (mis. "nd_page") supaya pindah halaman di 1 tab
// TIDAK mereset posisi halaman tab lain (pagination independen per tab).
export function Pagination({
  basePath,
  searchParams,
  pageParamName,
  currentPage,
  totalPages,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  pageParamName: string;
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(page: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) params.set(key, value);
    }
    params.set(pageParamName, String(page));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <Link
        href={hrefFor(Math.max(1, currentPage - 1))}
        aria-disabled={currentPage <= 1}
        className={currentPage <= 1 ? "text-gray-300 pointer-events-none" : "text-blue-600 hover:underline"}
      >
        &larr; Sebelumnya
      </Link>
      <span className="text-gray-500">
        Halaman {currentPage} dari {totalPages}
      </span>
      <Link
        href={hrefFor(Math.min(totalPages, currentPage + 1))}
        aria-disabled={currentPage >= totalPages}
        className={currentPage >= totalPages ? "text-gray-300 pointer-events-none" : "text-blue-600 hover:underline"}
      >
        Berikutnya &rarr;
      </Link>
    </div>
  );
}
