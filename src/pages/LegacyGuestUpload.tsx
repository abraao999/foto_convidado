import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';

const MAX_FILES = 10;
const accepted = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/');

/**
 * Página legada preservada da versão single-evento (aniversário da Olivia).
 * Mantida em /enviar até a Etapa 7 substituí-la por galerias públicas por slug.
 */
export default function LegacyGuestUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })),
    [files]
  );

  function chooseFiles(items: FileList | File[]) {
    const selected = Array.from(items).filter(accepted).slice(0, MAX_FILES);
    setFiles(selected);
    setMessage(null);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) chooseFiles(event.target.files);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    chooseFiles(event.dataTransfer.files);
  }

  async function sendPhotos() {
    if (!files.length) return;
    setIsSending(true);
    setMessage(null);
    const body = new FormData();
    files.forEach((file) => body.append('photos', file));
    try {
      const response = await fetch('/api/photos', { method: 'POST', body });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      setMessage({ type: 'success', text: 'Fotos enviadas! Obrigado por guardar esse pedacinho da festa da Olivia.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Tente novamente em alguns instantes.' });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero" aria-label="Envie fotos do aniversário da Olivia">
        <div className="photo-frame">
          <img src="/olivia.png" alt="Olivia com 1 ano" className="hero-photo" />
        </div>
        <div className="topline">
          <span>✦</span>
          <span>OLIVIA</span>
          <span>✦</span>
        </div>
        <p className="eyebrow">1 aninho</p>
        <h1>
          Compartilhe os momentos
          <br />
          <em>da nossa festa.</em>
        </h1>
        <p className="intro">
          Registre os sorrisos, abraços e brincadeiras e envie suas fotos para o álbum de aniversário da Olivia.
        </p>
        <label
          className={`upload-card ${isDragging ? 'dragging' : ''}`}
          onDragEnter={() => setIsDragging(true)}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <span className="camera-icon">📷</span>
          <span className="upload-title">Adicionar fotos</span>
          <span className="upload-help">Toque aqui ou arraste os arquivos</span>
          <input ref={inputRef} onChange={onInput} type="file" accept="image/*,video/*" multiple />
        </label>
        <p className="formats">JPG, PNG, HEIC e vídeos · até 10 arquivos por vez</p>
        {files.length > 0 && (
          <section className="selection">
            <div className="selection-heading">
              <p>
                <strong>{files.length}</strong> arquivos selecionados
              </p>
              <button
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
                  {url ? <img src={url} alt="Prévia da foto" /> : <span>Vídeo</span>}
                </div>
              ))}
            </div>
            <button className="send-button" onClick={sendPhotos} disabled={isSending}>
              {isSending ? 'Enviando…' : <>Enviar para o álbum <span>→</span></>}
            </button>
          </section>
        )}
        {message && <p className={`status ${message.type}`}>{message.text}</p>}
      </section>
      <footer>Feito com carinho para celebrar a Olivia.</footer>
    </main>
  );
}
