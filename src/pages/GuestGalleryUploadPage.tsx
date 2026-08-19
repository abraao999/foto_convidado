import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { uploadPublicGalleryPhotos } from '../utils/photoUpload';

const MAX_FILES = 10;
const acceptedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

interface PublicGalleryInfo {
  title: string;
  description?: string;
  slug: string;
  eventDate?: string;
  location?: string;
  coverUrl?: string;
}

export default function GuestGalleryUploadPage() {
  const { slug = '' } = useParams();
  const [gallery, setGallery] = useState<PublicGalleryInfo | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/public/galleries/${slug}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          gallery?: PublicGalleryInfo;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? 'Galeria indisponível.');
        }
        setGallery(data.gallery ?? null);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Galeria indisponível.'
        )
      )
      .finally(() => setLoading(false));
  }, [slug]);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  function chooseFiles(selected: File[]) {
    setError(null);
    setMessage(null);
    const images = selected
      .filter((file) =>
        acceptedTypes.includes(file.type) ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
      )
      .slice(0, MAX_FILES);
    if (images.length === 0 && selected.length > 0) {
      setError('Use apenas imagens JPG, PNG, WebP ou HEIC.');
      return;
    }
    setFiles(images);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFiles(Array.from(event.dataTransfer.files));
  }

  async function sendPhotos() {
    if (!files.length || !slug) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      await uploadPublicGalleryPhotos(slug, files);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Fotos enviadas! Obrigado por compartilhar este momento.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar as fotos.'
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <p className="auth-muted">Carregando galeria…</p>
      </main>
    );
  }

  if (error && !gallery) {
    return (
      <main className="page-shell">
        <section className="hero">
          <h1>Galeria indisponível</h1>
          <p className="status error">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero" aria-label={`Enviar fotos para ${gallery?.title}`}>
        <div className="topline">
          <span>✦</span>
          <span>GALERIA</span>
          <span>✦</span>
        </div>
        <p className="eyebrow">Envio de convidados</p>
        <h1>
          Compartilhe os momentos
          <br />
          <em>{gallery?.title}</em>
        </h1>
        {gallery?.coverUrl && (
          <div className="photo-frame">
            <img
              src={gallery.coverUrl}
              alt={`Capa de ${gallery.title}`}
              className="hero-photo"
            />
          </div>
        )}
        {gallery?.description && (
          <p className="intro">{gallery.description}</p>
        )}
        <label
          className={`upload-card ${dragging ? 'dragging' : ''}`}
          onDragEnter={() => setDragging(true)}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="camera-icon">📷</span>
          <span className="upload-title">Adicionar fotos</span>
          <span className="upload-help">Toque aqui ou arraste os arquivos</span>
          <input
            ref={inputRef}
            onChange={onInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
          />
        </label>
        <p className="formats">
          JPG, PNG, WebP ou HEIC · até 10 fotos · até 25 MB por foto
        </p>

        {files.length > 0 && (
          <section className="selection">
            <div className="selection-heading">
              <p>
                <strong>{files.length}</strong> arquivo(s) selecionado(s)
              </p>
              <button
                type="button"
                onClick={() => {
                  setFiles([]);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                Limpar
              </button>
            </div>
            <div className="previews">
              {previews.map(({ file, url }) => (
                <div className="preview" key={`${file.name}-${file.lastModified}`}>
                  <img src={url} alt="Prévia da foto" />
                </div>
              ))}
            </div>
            <button
              className="send-button"
              onClick={sendPhotos}
              disabled={uploading}
            >
              {uploading ? 'Enviando…' : <>Enviar para a galeria <span>→</span></>}
            </button>
          </section>
        )}

        {error && gallery && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}
      </section>
      <footer>Feito com carinho para guardar memórias especiais.</footer>
    </main>
  );
}
