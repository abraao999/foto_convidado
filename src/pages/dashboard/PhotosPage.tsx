import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import PhotoPagination, {
  PHOTO_PAGE_SIZE,
} from '../../components/PhotoPagination';
import { uploadGalleryPhotos } from '../../utils/photoUpload';
import type { GalleryInfo } from '../../types/gallery';
import type { PhotoInfo } from '../../types/photo';
import { formatStorage } from '../../types/subscription';

const acceptedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export default function PhotosPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );

  useEffect(() => {
    api
      .getGalleries()
      .then((galleryResult) => {
        const available = galleryResult.galleries.filter(
          (gallery) => gallery.status !== 'ARCHIVED'
        );
        setGalleries(galleryResult.galleries);
        setGalleryId(available[0]?.id ?? '');
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Não foi possível carregar.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!galleryId) {
      setPhotos([]);
      setTotalPhotos(0);
      return;
    }
    setLoading(true);
    api
      .getGalleryPhotos(galleryId, page, PHOTO_PAGE_SIZE)
      .then((result) => {
        setPhotos(result.photos);
        setTotalPhotos(result.total);
        if (result.page !== page) setPage(result.page);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Não foi possível carregar as fotos.'
        )
      )
      .finally(() => setLoading(false));
  }, [galleryId, page]);

  function selectFiles(selected: File[]) {
    setError(null);
    setMessage(null);
    const images = selected.filter((file) =>
      acceptedTypes.includes(file.type)
    );
    if (images.length !== selected.length) {
      setError('Use apenas imagens JPG, PNG, WebP ou HEIC.');
      return;
    }
    const next = images.slice(0, 10);
    setFiles(next);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  }

  async function upload() {
    if (!galleryId || files.length === 0) return;
    setUploading(true);
    setUploadPercent(0);
    setError(null);
    setMessage(null);
    try {
      const uploaded = await uploadGalleryPhotos(galleryId, files, ({ percent }) => {
        setUploadPercent(percent);
      });
      setPage(1);
      const refreshed = await api.getGalleryPhotos(galleryId, 1, PHOTO_PAGE_SIZE);
      setPhotos(refreshed.photos);
      setTotalPhotos(refreshed.total);
      setFiles([]);
      setMessage(`${uploaded.length} foto(s) enviada(s) com sucesso.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar as fotos.'
      );
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  }

  async function removePhoto(photo: PhotoInfo) {
    if (
      !window.confirm(
        `Apagar "${photo.fileName}"? O arquivo sai do armazenamento e não pode ser recuperado.`
      )
    ) {
      return;
    }
    setDeletingId(photo.id);
    setError(null);
    setMessage(null);
    try {
      await api.deletePhoto(photo.id);
      const nextTotal = Math.max(0, totalPhotos - 1);
      const lastPage = Math.max(1, Math.ceil(nextTotal / PHOTO_PAGE_SIZE));
      const nextPage = Math.min(page, lastPage);
      if (nextPage !== page) {
        setPage(nextPage);
      } else if (galleryId) {
        const refreshed = await api.getGalleryPhotos(
          galleryId,
          nextPage,
          PHOTO_PAGE_SIZE
        );
        setPhotos(refreshed.photos);
        setTotalPhotos(refreshed.total);
      }
      setMessage('Foto excluída.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível apagar a foto.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Galeria</p>
          <h1>Fotos</h1>
          <p className="auth-muted">
            Envie e visualize as imagens de cada galeria. Só você tem acesso a
            esta página. Com o acesso expirado, o envio para, mas você ainda
            pode ver, baixar e excluir fotos até a limpeza.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {activeGalleries.length === 0 ? (
        <section className="photos-empty">
          <h2>Crie uma galeria primeiro</h2>
          <p>As fotos precisam pertencer a um evento.</p>
          <Link to="/eventos" className="send-button compact-button">
            Criar galeria
          </Link>
        </section>
      ) : (
        <>
          <section className="photo-toolbar">
            <label>
              Galeria
              <select
                value={galleryId}
                onChange={(event) => {
                  setGalleryId(event.target.value);
                  setPage(1);
                  setFiles([]);
                }}
              >
                {activeGalleries.map((gallery) => (
                  <option value={gallery.id} key={gallery.id}>
                    {gallery.title}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section
            className={`photo-dropzone ${dragging ? 'dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <span>＋</span>
            <h2>Arraste suas fotos aqui</h2>
            <p>JPG, PNG, WebP ou HEIC. Até 10 fotos e 25 MB por foto.</p>
            <label className="ghost-button photo-file-button">
              Escolher fotos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={handleInput}
              />
            </label>
          </section>

          {files.length > 0 && (
            <section className="selected-files">
              <div>
                <strong>{files.length} arquivo(s) selecionado(s)</strong>
                <span>
                  {formatStorage(
                    files.reduce((total, file) => total + file.size, 0)
                  )}
                </span>
              </div>
              <ul>
                {files.map((file) => (
                  <li key={`${file.name}-${file.lastModified}`}>
                    {file.name}
                  </li>
                ))}
              </ul>
              <div className="selected-file-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setFiles([])}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className={`send-button compact-button ${
                    uploading ? 'is-progress' : ''
                  }`}
                  onClick={upload}
                  disabled={uploading}
                  aria-busy={uploading}
                  aria-valuemin={uploading ? 0 : undefined}
                  aria-valuemax={uploading ? 100 : undefined}
                  aria-valuenow={uploading ? uploadPercent : undefined}
                  aria-label={
                    uploading
                      ? `Enviando fotos, ${uploadPercent}%`
                      : 'Enviar fotos'
                  }
                >
                  {uploading ? (
                    <>
                      <span
                        className="send-button-fill"
                        style={{ width: `${uploadPercent}%` }}
                      />
                      <span className="send-button-label">{uploadPercent}%</span>
                    </>
                  ) : (
                    'Enviar fotos'
                  )}
                </button>
              </div>
            </section>
          )}

          <section className="gallery-photo-section">
            <h2>Fotos da galeria</h2>
            {loading ? (
              <p className="auth-muted">Carregando fotos…</p>
            ) : photos.length === 0 ? (
              <div className="empty-state">
                <p>Nenhuma foto enviada para esta galeria.</p>
              </div>
            ) : (
              <>
                <div className="photo-grid">
                  {photos.map((photo) => (
                    <article className="photo-card" key={photo.id}>
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.fileName}
                        loading="lazy"
                      />
                      <div>
                        <strong title={photo.fileName}>{photo.fileName}</strong>
                        <span>{formatStorage(photo.size)}</span>
                        <div className="photo-card-actions">
                          <a
                            className="photo-download-link"
                            href={`/api/photos/${photo.id}/content?download=1`}
                          >
                            Baixar
                          </a>
                          <button
                            type="button"
                            className="photo-delete-button"
                            disabled={deletingId === photo.id}
                            onClick={() => void removePhoto(photo)}
                          >
                            {deletingId === photo.id ? 'Apagando…' : 'Excluir'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <PhotoPagination
                  page={page}
                  totalItems={totalPhotos}
                  onChange={setPage}
                />
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
