import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const selected = useMemo(
    () => galleries.find((gallery) => gallery.id === selectedId),
    [galleries, selectedId]
  );

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.createGallery(form);
      setGalleries((current) => [result.gallery, ...current]);
      setSelectedId(result.gallery.id);
      setForm(emptyForm);
      setCreating(false);
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

  async function copyAddress() {
    if (!selected) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/galeria/${selected.slug}`
    );
    setMessage('Endereço público copiado.');
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
        {galleries.length > 0 && (
          <button
            type="button"
            className="send-button compact-button"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? 'Cancelar' : 'Criar nova galeria'}
          </button>
        )}
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {loading ? (
        <p className="auth-muted">Carregando eventos…</p>
      ) : galleries.length === 0 && !creating ? (
        <section className="empty-state">
          <span>✦</span>
          <h2>Você ainda não possui galerias</h2>
          <p>Crie uma galeria para configurar seu primeiro evento.</p>
          <button
            type="button"
            className="send-button compact-button"
            onClick={() => setCreating(true)}
          >
            Criar nova galeria
          </button>
        </section>
      ) : (
        <>
          {galleries.length > 0 && (
            <section className="form-section public-address-card">
              <h2>Endereço público</h2>
              <label>
                Selecione uma galeria
                <select
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {galleries.map((gallery) => (
                    <option value={gallery.id} key={gallery.id}>
                      {gallery.title} — /galeria/{gallery.slug}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="public-url-row">
                  <input
                    readOnly
                    value={`${window.location.origin}/galeria/${selected.slug}`}
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={copyAddress}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {creating && (
        <form className="form-section event-form" onSubmit={create}>
          <h2>Nova galeria</h2>
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
            {saving ? 'Criando…' : 'Criar galeria'}
          </button>
        </form>
      )}

      {galleries.length > 0 && (
        <section className="events-grid">
          {galleries.map((gallery) => (
            <article className="event-card" key={gallery.id}>
              <span className={`gallery-status ${gallery.status.toLowerCase()}`}>
                {galleryStatusLabel[gallery.status]}
              </span>
              <h2>{gallery.title}</h2>
              <p>{gallery.description || 'Evento sem descrição.'}</p>
              <small>/galeria/{gallery.slug}</small>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
