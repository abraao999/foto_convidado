import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { GalleryInfo } from '../../types/gallery';
import {
  absoluteInviteUrl,
  attendanceStatusLabel,
  digitsOnlyPhone,
  inviteStatusLabel,
  maskPhone,
  whatsAppInviteHref,
  type GuestInfo,
  type GuestListFilter,
  type GuestStats,
} from '../../types/guest';

const emptyForm = {
  fullName: '',
  phone: '',
  email: '',
  maxCompanions: 0,
  notes: '',
  inviteMessage: '',
};

const filters: Array<{ id: GuestListFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'confirmed', label: 'Confirmados' },
  { id: 'declined', label: 'Recusados' },
  { id: 'no_response', label: 'Sem resposta' },
];

export default function GuestsPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [stats, setStats] = useState<GuestStats | null>(null);
  const [filter, setFilter] = useState<GuestListFilter>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
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
        setError(err instanceof Error ? err.message : 'Não foi possível carregar.')
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!galleryId) {
      setGuests([]);
      setStats(null);
      return;
    }
    setLoading(true);
    api
      .getGuests(galleryId, filter, query)
      .then((result) => {
        setGuests(result.guests);
        setStats(result.stats);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar.')
      )
      .finally(() => setLoading(false));
  }, [galleryId, filter, query]);

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function startEdit(guest: GuestInfo) {
    setEditingId(guest.id);
    setFormOpen(true);
    setForm({
      fullName: guest.fullName,
      phone: guest.phone,
      email: guest.email ?? '',
      maxCompanions: guest.maxCompanions,
      notes: guest.notes ?? '',
      inviteMessage: guest.inviteMessage ?? '',
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!galleryId) return;
    setError(null);
    try {
      const body = {
        ...form,
        phone: digitsOnlyPhone(form.phone),
        email: form.email || undefined,
        maxCompanions: Number(form.maxCompanions) || 0,
      };
      if (editingId) {
        const result = await api.updateGuest(galleryId, editingId, body);
        setMessage(result.message);
      } else {
        const result = await api.createGuest(galleryId, body);
        setMessage(result.message);
      }
      setForm(emptyForm);
      setEditingId(null);
      setFormOpen(false);
      const refreshed = await api.getGuests(galleryId, filter, query);
      setGuests(refreshed.guests);
      setStats(refreshed.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  async function markInviteSent(guest: GuestInfo) {
    if (!galleryId) return;
    await api.markGuestInviteSent(galleryId, guest.id);
    const refreshed = await api.getGuests(galleryId, filter, query);
    setGuests(refreshed.guests);
    setStats(refreshed.stats);
  }

  async function copyInvite(guest: GuestInfo) {
    const link = absoluteInviteUrl(guest.inviteUrl);
    if (!link) return;
    await navigator.clipboard.writeText(link);
    await markInviteSent(guest);
    setMessage('Link do convite copiado.');
  }

  async function sendWhatsApp(guest: GuestInfo) {
    const eventTitle =
      activeGalleries.find((gallery) => gallery.id === galleryId)?.title ??
      'o evento';
    const href = whatsAppInviteHref({
      phone: guest.phone,
      fullName: guest.fullName,
      eventTitle,
      inviteUrl: guest.inviteUrl,
      inviteMessage: guest.inviteMessage,
    });
    if (!href) {
      setError('Informe um telefone válido para enviar pelo WhatsApp.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
    await markInviteSent(guest);
    setMessage('WhatsApp aberto com o convite.');
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Organização</p>
          <h1>Convidados</h1>
          <p className="auth-muted">
            Cadastre convidados, acompanhe o RSVP e compartilhe o convite
            individual.
          </p>
        </div>
        {activeGalleries.length > 0 && (
          <button
            type="button"
            className="send-button compact-button"
            onClick={() => (formOpen ? closeForm() : startCreate())}
          >
            {formOpen ? 'Cancelar' : 'Adicionar convidado'}
          </button>
        )}
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {activeGalleries.length === 0 ? (
        <section className="photos-empty">
          <h2>Crie um evento primeiro</h2>
          <p>A lista de convidados pertence a um evento.</p>
          <Link to="/eventos" className="send-button compact-button">
            Criar evento
          </Link>
        </section>
      ) : (
        <>
          {stats && (
            <section className="metric-grid planning-metrics">
              <article className="metric-card">
                <span>Convidados</span>
                <strong>{stats.total}</strong>
                <small>Total cadastrado</small>
              </article>
              <article className="metric-card">
                <span>Confirmados</span>
                <strong>{stats.confirmed}</strong>
                <small>{stats.confirmedPeople} pessoas</small>
              </article>
              <article className="metric-card">
                <span>Pendentes</span>
                <strong>{stats.pending}</strong>
                <small>{stats.noResponse} sem resposta</small>
              </article>
              <article className="metric-card">
                <span>Recusados</span>
                <strong>{stats.declined}</strong>
                <small>{stats.confirmedCompanions} acompanhantes</small>
              </article>
            </section>
          )}

          {stats && (
            <section className="metric-grid planning-age-metrics">
              <article className="metric-card">
                <span>Adultos</span>
                <strong>{stats.confirmedAdults}</strong>
                <small>Confirmados</small>
              </article>
              <article className="metric-card">
                <span>Crianças até 3 anos</span>
                <strong>{stats.childrenUpTo3}</strong>
                <small>0 a 3 anos</small>
              </article>
              <article className="metric-card">
                <span>Crianças até 10 anos</span>
                <strong>{stats.childrenUpTo10}</strong>
                <small>4 a 10 anos</small>
              </article>
            </section>
          )}

          <section className="photo-toolbar">
            <label>
              Evento
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
            <label className="guest-search">
              Buscar
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, telefone ou e-mail"
              />
            </label>
          </section>

          <div className="admin-tabs" role="tablist">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ghost-button ${filter === item.id ? 'active' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {(formOpen || editingId) && (
          <section className="form-section">
            <h2>{editingId ? 'Editar convidado' : 'Adicionar convidado'}</h2>
            <form className="event-form" onSubmit={(event) => void save(event)}>
              <div className="form-grid">
                <label>
                  Nome completo
                  <input
                    required
                    value={form.fullName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Telefone
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={maskPhone(form.phone)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: maskPhone(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  E-mail (opcional)
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Acompanhantes autorizados
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={form.maxCompanions}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxCompanions: Number(event.target.value),
                      }))
                    }
                  />
                  <small className="auth-muted">
                    Inclui adultos e crianças.
                  </small>
                </label>
                <label className="form-field-wide">
                  Mensagem do convite
                  <input
                    value={form.inviteMessage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        inviteMessage: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="form-field-wide">
                  Observações
                  <input
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={closeForm}
                >
                  Cancelar
                </button>
                <button type="submit" className="send-button compact-button">
                  {editingId ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </section>
          )}

          {loading ? (
            <p className="auth-muted">Carregando…</p>
          ) : guests.length === 0 ? (
            <section className="empty-state">
              <p>Nenhum convidado neste filtro.</p>
            </section>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Contato</th>
                    <th>Convite</th>
                    <th>Presença</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((guest) => (
                    <tr key={guest.id}>
                      <td data-label="Nome">
                        <span className="guest-name">
                          <strong>{guest.fullName}</strong>
                          <small>+{guest.maxCompanions} acompanhante(s)</small>
                        </span>
                      </td>
                      <td data-label="Contato">
                        {maskPhone(guest.phone)}
                        {guest.email ? ` · ${guest.email}` : ''}
                      </td>
                      <td data-label="Convite">
                        <span
                          className={`planning-pill invite-${guest.inviteStatus.toLowerCase()}`}
                        >
                          {inviteStatusLabel[guest.inviteStatus]}
                        </span>
                      </td>
                      <td data-label="Presença">
                        <span
                          className={`planning-pill attendance-${guest.attendanceStatus.toLowerCase()}`}
                        >
                          {attendanceStatusLabel[guest.attendanceStatus]}
                        </span>
                      </td>
                      <td className="guest-row-actions">
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="ghost-button whatsapp-button"
                            aria-label="Enviar no WhatsApp"
                            title="Enviar no WhatsApp"
                            onClick={() => void sendWhatsApp(guest)}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path
                                fill="currentColor"
                                d="M12.04 2c-5.5 0-9.96 4.45-9.96 9.94 0 1.75.46 3.46 1.33 4.97L2 22l5.24-1.37a10 10 0 0 0 4.8 1.22h.01c5.5 0 9.96-4.46 9.96-9.95A9.92 9.92 0 0 0 12.04 2zm5.85 14.2c-.24.68-1.42 1.26-1.97 1.34-.5.07-1.14.1-1.84-.12-.42-.13-.96-.31-1.66-.61-2.92-1.26-4.83-4.2-4.97-4.4-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.53-.35.7-.35h.51c.16 0 .38-.06.59.45.24.58.8 2 .87 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.47-.14.16-.29.36-.42.49-.14.14-.28.29-.12.56.16.28.7 1.16 1.51 1.88 1.04.93 1.91 1.22 2.19 1.36.28.14.44.12.6-.07.16-.19.7-.81.88-1.09.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void copyInvite(guest)}
                          >
                            Copiar convite
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => startEdit(guest)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger-action"
                            onClick={() => {
                              if (
                                window.confirm('Excluir este convidado?') &&
                                galleryId
                              ) {
                                void api
                                  .deleteGuest(galleryId, guest.id)
                                  .then(async () => {
                                    const refreshed = await api.getGuests(
                                      galleryId,
                                      filter,
                                      query
                                    );
                                    setGuests(refreshed.guests);
                                    setStats(refreshed.stats);
                                    setMessage('Convidado excluído.');
                                  })
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Não foi possível excluir.'
                                    )
                                  );
                              }
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
