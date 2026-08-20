import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import PhotoPagination, {
  slicePhotoPage,
} from '../../components/PhotoPagination';
import type { GalleryInfo } from '../../types/gallery';
import type { PhotoInfo } from '../../types/photo';

const MAX_ZIP_PHOTOS = 100;

export default function DownloadsPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(null);
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

  const allSelected =
    photos.length > 0 && selectedPhotos.length === photos.length;

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAllOnPage() {
    const allOnPage =
      pagedPhotos.items.length > 0 &&
      pageSelectedCount === pagedPhotos.items.length;
    setSelected((current) => {
      const next = { ...current };
      for (const photo of pagedPhotos.items) {
        if (allOnPage) delete next[photo.id];
        else next[photo.id] = true;
      }
      return next;
    });
  }

  function toggleAllInGallery() {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const photo of photos.slice(0, MAX_ZIP_PHOTOS)) {
      next[photo.id] = true;
    }
    setSelected(next);
    if (photos.length > MAX_ZIP_PHOTOS) {
      setMessage(
        `Selecionamos as primeiras ${MAX_ZIP_PHOTOS} fotos (limite do ZIP).`
      );
    }
  }

  function downloadIndividually() {
    selectedPhotos.forEach((photo, index) => {
      window.setTimeout(() => {
        const link = document.createElement('a');
        link.href = `/api/photos/${photo.id}/content?download=1`;
        link.download = photo.fileName;
        link.click();
      }, index * 400);
    });
  }

  async function downloadZip() {
    if (!galleryId || selectedPhotos.length === 0) return;
    const galleryTitle =
      activeGalleries.find((gallery) => gallery.id === galleryId)?.title ??
      'galeria';
    const suggestedName = `${galleryTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'galeria'}-fotos.zip`;

    setZipping(true);
    setError(null);
    setMessage(null);
    try {
      await api.downloadGalleryZip(
        galleryId,
        selectedPhotos.map((photo) => photo.id),
        suggestedName
      );
      setMessage(
        `Se o navegador pedir, escolha onde salvar o ZIP (${selectedPhotos.length} foto(s)).`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível gerar o ZIP.'
      );
    } finally {
      setZipping(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Privado</p>
          <h1>Download</h1>
          <p className="auth-muted">
            Baixe as fotos do seu evento em ZIP (streaming) ou individualmente.
            Esta área é exclusiva do dono da galeria.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

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
                disabled={zipping}
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
                  disabled={zipping}
                >
                  {pageSelectedCount === pagedPhotos.items.length
                    ? 'Limpar página'
                    : 'Selecionar página'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={toggleAllInGallery}
                  disabled={zipping}
                >
                  {allSelected ? 'Limpar tudo' : 'Selecionar todas'}
                </button>
                <button
                  type="button"
                  className={`send-button compact-button ${
                    zipping ? 'is-progress' : ''
                  }`}
                  onClick={downloadZip}
                  disabled={zipping || selectedPhotos.length === 0}
                  aria-busy={zipping}
                >
                  {zipping ? (
                    <>
                      <span className="send-button-fill" style={{ width: '100%' }} />
                      <span className="send-button-label">Gerando ZIP…</span>
                    </>
                  ) : (
                    `Baixar ZIP (${selectedPhotos.length || 0})`
                  )}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={downloadIndividually}
                  disabled={zipping || selectedPhotos.length === 0}
                >
                  Baixar individualmente
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
                      disabled={zipping}
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
