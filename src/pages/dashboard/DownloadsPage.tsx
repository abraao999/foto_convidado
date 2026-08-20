import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import PhotoPagination, {
  slicePhotoPage,
} from '../../components/PhotoPagination';
import type { GalleryInfo } from '../../types/gallery';
import type { PhotoInfo } from '../../types/photo';

export default function DownloadsPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );

  const pagedPhotos = useMemo(
    () => slicePhotoPage(photos, page),
    [photos, page]
  );

  useEffect(() => {
    api
      .getGalleries()
      .then((result) => {
        const available = result.galleries.filter(
          (gallery) => gallery.status !== 'ARCHIVED'
        );
        setGalleries(result.galleries);
        setGalleryId(available[0]?.id ?? '');
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar as galerias.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!galleryId) {
      setPhotos([]);
      setSelected({});
      setPage(1);
      return;
    }
    setLoading(true);
    setError(null);
    setPage(1);
    api
      .getGalleryPhotos(galleryId)
      .then((result) => {
        setPhotos(result.photos);
        setSelected({});
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar as fotos.'
        )
      )
      .finally(() => setLoading(false));
  }, [galleryId]);

  useEffect(() => {
    if (page !== pagedPhotos.page) setPage(pagedPhotos.page);
  }, [page, pagedPhotos.page]);

  const pageSelectedCount = useMemo(
    () => pagedPhotos.items.filter((photo) => selected[photo.id]).length,
    [pagedPhotos.items, selected]
  );

  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selected[photo.id]),
    [photos, selected]
  );

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAllOnPage() {
    const allSelected =
      pagedPhotos.items.length > 0 &&
      pageSelectedCount === pagedPhotos.items.length;
    setSelected((current) => {
      const next = { ...current };
      for (const photo of pagedPhotos.items) {
        if (allSelected) delete next[photo.id];
        else next[photo.id] = true;
      }
      return next;
    });
  }

  function downloadSelected() {
    selectedPhotos.forEach((photo, index) => {
      window.setTimeout(() => {
        const link = document.createElement('a');
        link.href = `/api/photos/${photo.id}/content?download=1`;
        link.download = photo.fileName;
        link.click();
      }, index * 400);
    });
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Privado</p>
          <h1>Download</h1>
          <p className="auth-muted">
            Baixe as fotos do seu evento. Esta área é exclusiva do dono da
            galeria.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}

      {loading && photos.length === 0 ? (
        <p className="auth-muted">Carregando…</p>
      ) : activeGalleries.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhuma galeria disponível</h2>
          <p>Crie e publique um evento para receber fotos dos convidados.</p>
          <Link to="/eventos" className="send-button compact-button">
            Ir para eventos
          </Link>
        </section>
      ) : (
        <>
          <section className="photo-toolbar">
            <label>
              Galeria
              <select
                value={galleryId}
                onChange={(event) => setGalleryId(event.target.value)}
              >
                {activeGalleries.map((gallery) => (
                  <option value={gallery.id} key={gallery.id}>
                    {gallery.title}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {photos.length === 0 ? (
            <section className="empty-state">
              <p>Nenhuma foto enviada para esta galeria.</p>
            </section>
          ) : (
            <>
              <div className="public-actions owner-download-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={toggleAllOnPage}
                >
                  {pageSelectedCount === pagedPhotos.items.length
                    ? 'Limpar página'
                    : 'Selecionar página'}
                </button>
                <button
                  type="button"
                  className="send-button compact-button"
                  onClick={downloadSelected}
                  disabled={selectedPhotos.length === 0}
                >
                  Baixar {selectedPhotos.length || ''} selecionada(s)
                </button>
              </div>
              <section className="public-photo-grid owner-photo-grid">
                {pagedPhotos.items.map((photo) => (
                  <label
                    className={`public-photo selectable ${
                      selected[photo.id] ? 'checked' : ''
                    }`}
                    key={photo.id}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selected[photo.id])}
                      onChange={() => toggle(photo.id)}
                    />
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.fileName}
                      loading="lazy"
                    />
                  </label>
                ))}
              </section>
              <PhotoPagination
                page={pagedPhotos.page}
                totalItems={photos.length}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
