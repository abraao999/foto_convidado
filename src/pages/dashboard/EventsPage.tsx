import { FormEvent, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import {
  galleryStatusLabel,
  type GalleryInfo,
} from '../../types/gallery';

const emptyForm = {
  title: '',
  description: '',
  eventDate: '',
  location: '',
  slug: '',
};

export default function EventsPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getGalleries()
      .then(({ galleries: result }) => {
        setGalleries(result);
        setSelectedId(result[0]?.id ?? '');
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar seus eventos.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );
  const selected = useMemo(
    () => activeGalleries.find((gallery) => gallery.id === selectedId),
    [activeGalleries, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setQrCodeUrl('');
      return;
    }

    let active = true;
    const publicUrl = `${window.location.origin}/galeria/${selected.slug}/enviar`;
    QRCode.toDataURL(publicUrl, {
      width: 640,
      margin: 3,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#2e322c',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (active) setQrCodeUrl(dataUrl);
      })
      .catch(() => {
        if (active) setError('Não foi possível gerar o QR Code.');
      });

    return () => {
      active = false;
    };
  }, [selected]);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function startCreating() {
    setEditingId(null);
    setForm(emptyForm);
    setCreating(true);
  }

  function startEditing(gallery: GalleryInfo) {
    setCreating(false);
    setEditingId(gallery.id);
    setForm({
      title: gallery.title,
      description: gallery.description ?? '',
      eventDate: gallery.eventDate?.slice(0, 10) ?? '',
      location: gallery.location ?? '',
      slug: gallery.slug,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function replaceGallery(updated: GalleryInfo) {
    setGalleries((current) =>
      current.map((gallery) =>
        gallery.id === updated.id ? updated : gallery
      )
    );
  }

  async function saveGallery(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = editingId
        ? await api.updateGallery(editingId, form)
        : await api.createGallery(form);
      if (editingId) {
        replaceGallery(result.gallery);
      } else {
        setGalleries((current) => [result.gallery, ...current]);
      }
      setSelectedId(result.gallery.id);
      closeForm();
      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível criar a galeria.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePublication(gallery: GalleryInfo) {
    setError(null);
    setMessage(null);
    try {
      const result =
        gallery.status === 'PUBLISHED'
          ? await api.unpublishGallery(gallery.id)
          : await api.publishGallery(gallery.id);
      replaceGallery(result.gallery);
      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível alterar a publicação.'
      );
    }
  }

  async function archive(gallery: GalleryInfo) {
    if (!window.confirm(`Arquivar a galeria "${gallery.title}"?`)) return;
    setError(null);
    setMessage(null);
    try {
      const result = await api.archiveGallery(gallery.id);
      replaceGallery(result.gallery);
      const remaining = activeGalleries.filter(
        (item) => item.id !== gallery.id
      );
      if (selectedId === gallery.id) {
        setSelectedId(remaining[0]?.id ?? '');
      }
      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível arquivar.'
      );
    }
  }

  async function copyAddress() {
    if (!selected) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/galeria/${selected.slug}/enviar`
    );
    setMessage('Link público de envio copiado.');
  }

  async function uploadCover(file?: File) {
    if (!selected || !file) return;
    if (!file.type.startsWith('image/')) {
      setError('Escolha uma imagem para a capa.');
      return;
    }
    setUploadingCover(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.uploadGalleryCover(selected.id, file);
      replaceGallery(result.gallery);
      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar a capa.'
      );
    } finally {
      setUploadingCover(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Galerias</p>
          <h1>Meus Eventos</h1>
          <p className="auth-muted">
            Cada evento possui uma galeria e um endereço público próprio.
          </p>
        </div>
        {(activeGalleries.length > 0 || editingId) && (
          <button
            type="button"
            className="send-button compact-button"
            onClick={() =>
              creating || editingId ? closeForm() : startCreating()
            }
          >
            {creating || editingId ? 'Cancelar' : 'Criar nova galeria'}
          </button>
        )}
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {loading ? (
        <p className="auth-muted">Carregando eventos…</p>
      ) : activeGalleries.length === 0 && !creating && !editingId ? (
        <section className="empty-state">
          <span>✦</span>
          <h2>Você ainda não possui galerias</h2>
          <p>Crie uma galeria para configurar seu primeiro evento.</p>
          <button
            type="button"
            className="send-button compact-button"
            onClick={startCreating}
          >
            Criar nova galeria
          </button>
        </section>
      ) : (
        <>
          {activeGalleries.length > 0 && (
            <section className="form-section public-address-card">
              <h2>Link para convidados</h2>
              <p className="auth-muted">
                Compartilhe este endereço ou QR Code para receber fotos sem login.
                A galeria precisa estar publicada.
              </p>
              <label>
                Selecione uma galeria
                <select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {activeGalleries.map((gallery) => (
                    <option value={gallery.id} key={gallery.id}>
                      {gallery.title} — /galeria/{gallery.slug}/enviar
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="public-gallery-tools">
                  <div className="cover-uploader">
                    <div className="cover-preview">
                      {selected.coverPhoto ? (
                        <img src={selected.coverPhoto} alt="Foto de capa" />
                      ) : (
                        <span>Capa</span>
                      )}
                    </div>
                    <div>
                      <strong>Foto de capa</strong>
                      <p>
                        Aparece no centro da página pública dos convidados.
                      </p>
                      <label className="ghost-button photo-file-button">
                        {uploadingCover ? 'Enviando…' : 'Escolher capa'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                          disabled={uploadingCover}
                          onChange={(event) => {
                            uploadCover(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="public-url-row">
                    <input
                      readOnly
                      value={`${window.location.origin}/galeria/${selected.slug}/enviar`}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={copyAddress}
                    >
                      Copiar
                    </button>
                  </div>
                  {qrCodeUrl && (
                    <div className="qr-code-card">
                      <img
                        src={qrCodeUrl}
                        alt={`QR Code da galeria ${selected.title}`}
                      />
                      <div>
                        <strong>QR Code para envio</strong>
                        <p>
                          Convidados escaneiam e enviam fotos direto para esta
                          galeria.
                        </p>
                        <a
                          className="send-button compact-button"
                          href={qrCodeUrl}
                          download={`qrcode-${selected.slug}.png`}
                        >
                          Baixar QR Code em PNG
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {(creating || editingId) && (
        <form className="form-section event-form" onSubmit={saveGallery}>
          <h2>{editingId ? 'Editar evento' : 'Nova galeria'}</h2>
          <div className="form-grid">
            <label className="form-field-wide">
              Nome do evento
              <input
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="Casamento de João e Maria"
                required
              />
            </label>
            <label className="form-field-wide">
              Descrição
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) =>
                  update('description', event.target.value)
                }
                maxLength={1000}
              />
            </label>
            <label>
              Data do evento
              <input
                type="date"
                value={form.eventDate}
                onChange={(event) =>
                  update('eventDate', event.target.value)
                }
              />
            </label>
            <label>
              Localização
              <input
                value={form.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder="São Paulo, SP"
              />
            </label>
            <label className="form-field-wide">
              Endereço personalizado
              <div className="slug-input">
                <span>/galeria/</span>
                <input
                  value={form.slug}
                  onChange={(event) => update('slug', event.target.value)}
                  placeholder="joao-e-maria"
                />
              </div>
              <small>
                Se ficar vazio, o endereço será criado a partir do nome.
              </small>
            </label>
          </div>
          <button
            type="submit"
            className="send-button compact-button"
            disabled={saving}
          >
            {saving
              ? 'Salvando…'
              : editingId
                ? 'Salvar alterações'
                : 'Criar galeria'}
          </button>
        </form>
      )}

      {galleries.length > 0 && (
        <section className="events-grid">
          {galleries.map((gallery) => (
            <article className="event-card" key={gallery.id}>
              {gallery.coverPhoto && (
                <img
                  className="event-cover"
                  src={gallery.coverPhoto}
                  alt=""
                />
              )}
              <span className={`gallery-status ${gallery.status.toLowerCase()}`}>
                {galleryStatusLabel[gallery.status]}
              </span>
              <h2>{gallery.title}</h2>
              <p>{gallery.description || 'Evento sem descrição.'}</p>
              <small>/galeria/{gallery.slug}</small>
              {gallery.status !== 'ARCHIVED' && (
                <div className="event-actions">
                  <button
                    type="button"
                    onClick={() => startEditing(gallery)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublication(gallery)}
                  >
                    {gallery.status === 'PUBLISHED'
                      ? 'Despublicar'
                      : 'Publicar'}
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => archive(gallery)}
                  >
                    Arquivar
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
