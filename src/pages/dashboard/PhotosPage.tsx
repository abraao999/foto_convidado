import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { uploadGalleryPhotos } from '../../utils/photoUpload';
import type { GalleryInfo } from '../../types/gallery';
import type { PhotoInfo, PhotoStats } from '../../types/photo';
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
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );

  useEffect(() => {
    Promise.all([api.getGalleries(), api.getPhotoStats()])
      .then(([galleryResult, statsResult]) => {
        const available = galleryResult.galleries.filter(
          (gallery) => gallery.status !== 'ARCHIVED'
        );
        setGalleries(galleryResult.galleries);
        setGalleryId(available[0]?.id ?? '');
        setStats(statsResult);
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
      return;
    }
    setLoading(true);
    api
      .getGalleryPhotos(galleryId)
      .then((result) => setPhotos(result.photos))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Não foi possível carregar as fotos.'
        )
      )
      .finally(() => setLoading(false));
  }, [galleryId]);

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
    setError(null);
    setMessage(null);
    try {
      const uploaded = await uploadGalleryPhotos(galleryId, files);
      setPhotos((current) => [...uploaded, ...current]);
      const uploadedBytes = uploaded.reduce(
        (total, photo) => total + photo.size,
        0
      );
      setStats((current) =>
        current
          ? {
              ...current,
              count: current.count + uploaded.length,
              totalBytes: current.totalBytes + uploadedBytes,
            }
          : current
      );
      setFiles([]);
      setMessage(`${uploaded.length} foto(s) enviada(s) com sucesso.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar as fotos.'
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Google Drive</p>
          <h1>Fotos</h1>
          <p className="auth-muted">
            Envie e organize as imagens de cada galeria.
          </p>
        </div>
        {stats && (
          <div className="storage-summary">
            <strong>{stats.count} foto(s)</strong>
            <span>
              {formatStorage(stats.totalBytes)} de{' '}
              {formatStorage(stats.maxStorageBytes)}
            </span>
          </div>
        )}
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {activeGalleries.length === 0 ? (
        <section className="empty-state">
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
                  className="send-button compact-button"
                  onClick={upload}
                  disabled={uploading}
                >
                  {uploading ? 'Enviando…' : 'Enviar fotos'}
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
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
