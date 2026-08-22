import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { GalleryInfo } from '../../types/gallery';
import {
  tableFillLabel,
  type SeatedGuest,
  type TableInfo,
  type UnconfirmedGuest,
} from '../../types/planning';

type DragPayload = { guestId: string; fromTableId?: string };

function seatsAroundTable(seatCount: number, seated: SeatedGuest[]) {
  const total = Math.max(1, Math.min(40, seatCount));
  const slots: Array<{ guest?: SeatedGuest }> = Array.from(
    { length: total },
    () => ({})
  );
  let cursor = 0;
  for (const guest of seated) {
    const take = Math.min(Math.max(1, guest.partySize), total - cursor);
    for (let index = 0; index < take; index += 1) {
      slots[cursor] = { guest };
      cursor += 1;
    }
  }
  return slots;
}

function TableDrawing({
  table,
  seated,
  draggingId,
  onDragStart,
  onDragEnd,
}: {
  table: TableInfo;
  seated: SeatedGuest[];
  draggingId: string | null;
  onDragStart: (event: React.DragEvent, guestId: string, tableId: string) => void;
  onDragEnd: () => void;
}) {
  const slots = seatsAroundTable(table.seats, seated);
  return (
    <div
      className="table-drawing"
      aria-label={`${table.occupied} de ${table.seats} cadeiras ocupadas`}
    >
      <div className="table-top">
        <strong>{table.name}</strong>
        <small>
          {table.occupied}/{table.seats}
        </small>
      </div>
      {slots.map((slot, index) => {
        const angle = (360 / slots.length) * index;
        const guest = slot.guest;
        return (
          <div
            key={`${table.id}-seat-${index}`}
            className={`table-chair ${guest ? 'is-taken' : ''} ${
              guest && draggingId === guest.id ? 'is-dragging' : ''
            }`}
            style={{ '--angle': `${angle}deg` } as React.CSSProperties}
            title={guest ? guest.fullName : 'Cadeira livre'}
            draggable={Boolean(guest)}
            onDragStart={
              guest
                ? (event) => onDragStart(event, guest.id, table.id)
                : undefined
            }
            onDragEnd={guest ? onDragEnd : undefined}
          >
            <span className="table-chair-back" />
            <span className="table-chair-seat">
              {guest ? guest.fullName.slice(0, 1).toUpperCase() : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTableId, setDropTableId] = useState<string | null>(null);
  const dragRef = useRef<DragPayload | null>(null);

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
    if (
      tables.length > 0 &&
      !window.confirm(
        'As mesas atuais serão apagadas e os convidados sairão dos lugares. Gerar de novo?'
      )
    ) {
      return;
    }
    setError(null);
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
      setMessage('Convidado sentado na mesa.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível sentar.');
    }
  }

  async function unassign(tableId: string, guestId: string) {
    if (!galleryId) return;
    applyResult(await api.unassignGuestFromTable(galleryId, tableId, guestId));
  }

  function startDrag(
    event: React.DragEvent,
    guestId: string,
    fromTableId?: string
  ) {
    dragRef.current = { guestId, fromTableId };
    event.dataTransfer.setData('text/plain', guestId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(guestId);
  }

  function endDrag() {
    dragRef.current = null;
    setDraggingId(null);
    setDropTableId(null);
  }

  function allowDrop(event: React.DragEvent, tableId?: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (tableId) setDropTableId(tableId);
  }

  function dropOnTable(event: React.DragEvent, tableId: string) {
    event.preventDefault();
    const guestId =
      dragRef.current?.guestId || event.dataTransfer.getData('text/plain');
    const fromTableId = dragRef.current?.fromTableId;
    endDrag();
    if (!guestId || fromTableId === tableId) return;
    void assign(tableId, guestId);
  }

  function dropOnUnseated(event: React.DragEvent) {
    event.preventDefault();
    const guestId =
      dragRef.current?.guestId || event.dataTransfer.getData('text/plain');
    const fromTableId = dragRef.current?.fromTableId;
    endDrag();
    if (guestId && fromTableId) void unassign(fromTableId, guestId);
  }

  const unseated = guests.filter((guest) => !guest.tableId);

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Organização</p>
          <h1>Mesas</h1>
          <p className="auth-muted">
            Arraste o convidado confirmado até a mesa. Só quem confirmou
            presença ocupa lugar.
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
              <p className="auth-muted">Arraste o nome até a mesa.</p>
              <ul
                className={`guest-drop-list ${dropTableId === 'unseated' ? 'is-drop-target' : ''}`}
                onDragOver={(event) => allowDrop(event, 'unseated')}
                onDrop={(event) => dropOnUnseated(event)}
              >
                {unseated.length === 0 ? (
                  <li className="guest-empty">
                    {guests.length === 0
                      ? 'Nenhum convidado confirmou presença ainda.'
                      : 'Todos já estão em uma mesa. Arraste o nome de um card para outra mesa.'}
                  </li>
                ) : (
                  unseated.map((guest) => (
                    <li key={guest.id}>
                      <div
                        className={`guest-chip ${draggingId === guest.id ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={(event) => startDrag(event, guest.id)}
                        onDragEnd={endDrag}
                      >
                        <span className="guest-chip-handle" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <span>
                          <strong>{guest.fullName}</strong>
                          <small>{guest.partySize} lugar(es)</small>
                        </span>
                      </div>
                      <label>
                        Mesa
                        <select
                          value=""
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
                  ))
                )}
              </ul>
              <h2>Não confirmados</h2>
              <ul className="guest-drop-list muted-list">
                {unconfirmed.length === 0 ? (
                  <li className="guest-empty">Ninguém pendente.</li>
                ) : (
                  unconfirmed.map((guest) => (
                    <li key={guest.id}>{guest.fullName}</li>
                  ))
                )}
              </ul>
            </aside>
            <div className="tables-grid">
              {tables.map((table) => (
                <article
                  key={table.id}
                  className={`table-card fill-${table.fill} ${
                    dropTableId === table.id ? 'is-drop-target' : ''
                  }`}
                  onDragOver={(event) => allowDrop(event, table.id)}
                  onDrop={(event) => dropOnTable(event, table.id)}
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
                  <TableDrawing
                    table={table}
                    seated={guests.filter((guest) => guest.tableId === table.id)}
                    draggingId={draggingId}
                    onDragStart={startDrag}
                    onDragEnd={endDrag}
                  />
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
                        <li key={guest.id}>
                          <div
                            className={`guest-chip ${draggingId === guest.id ? 'is-dragging' : ''}`}
                            draggable
                            onDragStart={(event) =>
                              startDrag(event, guest.id, table.id)
                            }
                            onDragEnd={endDrag}
                          >
                            <span className="guest-chip-handle" aria-hidden="true">
                              ⋮⋮
                            </span>
                            <span>
                              {guest.fullName}
                              {guest.partySize > 1 ? ` · ${guest.partySize} lugares` : ''}
                            </span>
                          </div>
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
