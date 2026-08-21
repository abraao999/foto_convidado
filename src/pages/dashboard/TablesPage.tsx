import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { GalleryInfo } from '../../types/gallery';
import {
  tableFillLabel,
  type SeatedGuest,
  type TableInfo,
  type UnconfirmedGuest,
} from '../../types/planning';

export default function TablesPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [guests, setGuests] = useState<SeatedGuest[]>([]);
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedGuest[]>([]);
  const [count, setCount] = useState(10);
  const [seats, setSeats] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );

  function applyResult(result: {
    tables: TableInfo[];
    guests: SeatedGuest[];
    unconfirmed: UnconfirmedGuest[];
  }) {
    setTables(result.tables);
    setGuests(result.guests);
    setUnconfirmed(result.unconfirmed);
  }

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
      );
  }, []);

  useEffect(() => {
    if (!galleryId) return;
    api
      .getTables(galleryId)
      .then(applyResult)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar.')
      );
  }, [galleryId]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!galleryId) return;
    try {
      const result = await api.generateTables(galleryId, count, seats);
      applyResult(result);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar mesas.');
    }
  }

  async function assign(tableId: string, guestId: string) {
    if (!galleryId) return;
    setError(null);
    try {
      applyResult(await api.assignGuestToTable(galleryId, tableId, guestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível sentar.');
    }
  }

  async function unassign(tableId: string, guestId: string) {
    if (!galleryId) return;
    applyResult(await api.unassignGuestFromTable(galleryId, tableId, guestId));
  }

  const unseated = guests.filter((guest) => !guest.tableId);

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Organização</p>
          <h1>Mesas</h1>
          <p className="auth-muted">
            Gere mesas, ajuste cadeiras e distribua só quem confirmou presença.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {activeGalleries.length === 0 ? (
        <section className="photos-empty">
          <h2>Crie um evento primeiro</h2>
          <Link to="/eventos" className="send-button compact-button">
            Criar evento
          </Link>
        </section>
      ) : (
        <>
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
          </section>

          <form className="form-section event-form" onSubmit={(event) => void generate(event)}>
            <div className="form-grid">
              <label>
                Quantidade de mesas
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
              </label>
              <label>
                Cadeiras por mesa
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={seats}
                  onChange={(event) => setSeats(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="send-button compact-button">
                Gerar mesas
              </button>
            </div>
          </form>

          <section className="tables-layout">
            <aside className="tables-sidebar">
              <h2>Confirmados</h2>
              <ul
                className="guest-drop-list"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const guestId = event.dataTransfer.getData('guestId');
                  const fromTable = event.dataTransfer.getData('tableId');
                  if (guestId && fromTable) void unassign(fromTable, guestId);
                }}
              >
                {unseated.map((guest) => (
                  <li
                    key={guest.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('guestId', guest.id);
                    }}
                  >
                    <strong>{guest.fullName}</strong>
                    <small>{guest.partySize} lugar(es)</small>
                    <label>
                      Mesa
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value) {
                            void assign(event.target.value, guest.id);
                          }
                        }}
                      >
                        <option value="">Adicionar à mesa</option>
                        {tables.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              <h2>Não confirmados</h2>
              <ul className="guest-drop-list muted-list">
                {unconfirmed.map((guest) => (
                  <li key={guest.id}>{guest.fullName}</li>
                ))}
              </ul>
            </aside>
            <div className="tables-grid">
              {tables.map((table) => (
                <article
                  key={table.id}
                  className={`table-card fill-${table.fill}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const guestId = event.dataTransfer.getData('guestId');
                    if (guestId) void assign(table.id, guestId);
                  }}
                >
                  <header>
                    <input
                      defaultValue={table.name}
                      onBlur={(event) => {
                        if (event.target.value !== table.name && galleryId) {
                          void api.updateTable(galleryId, table.id, {
                            name: event.target.value,
                            seats: table.seats,
                          });
                        }
                      }}
                    />
                    <span className={`planning-pill fill-${table.fill}`}>
                      {tableFillLabel[table.fill]}
                    </span>
                  </header>
                  <p>
                    {table.occupied}/{table.seats} lugares
                    {table.fill === 'full' ? ' · Lotada' : ` · ${table.available} livres`}
                  </p>
                  <label>
                    Cadeiras
                    <input
                      type="number"
                      min={1}
                      max={40}
                      defaultValue={table.seats}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (next !== table.seats && galleryId) {
                          void api
                            .updateTable(galleryId, table.id, { seats: next })
                            .then(async () => applyResult(await api.getTables(galleryId)))
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Capacidade inválida.'
                              )
                            );
                        }
                      }}
                    />
                  </label>
                  <ul>
                    {guests
                      .filter((guest) => guest.tableId === table.id)
                      .map((guest) => (
                        <li
                          key={guest.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('guestId', guest.id);
                            event.dataTransfer.setData('tableId', table.id);
                          }}
                        >
                          {guest.fullName}
                          {guest.confirmedCompanionCount > 0
                            ? ` +${guest.confirmedCompanionCount}`
                            : ''}
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void unassign(table.id, guest.id)}
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
