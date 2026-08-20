interface PhotoPaginationProps {
  page: number;
  totalItems: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

export const PHOTO_PAGE_SIZE = 15;

export default function PhotoPagination({
  page,
  totalItems,
  pageSize = PHOTO_PAGE_SIZE,
  onChange,
}: PhotoPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <nav className="photo-pagination" aria-label="Paginação das fotos">
      <button
        type="button"
        className="ghost-button"
        onClick={() => onChange(safePage - 1)}
        disabled={safePage <= 1}
      >
        Anterior
      </button>
      <p>
        {from}–{to} de {totalItems} · página {safePage} de {totalPages}
      </p>
      <button
        type="button"
        className="ghost-button"
        onClick={() => onChange(safePage + 1)}
        disabled={safePage >= totalPages}
      >
        Próxima
      </button>
    </nav>
  );
}

export function slicePhotoPage<T>(items: T[], page: number, pageSize = PHOTO_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + pageSize),
  };
}
