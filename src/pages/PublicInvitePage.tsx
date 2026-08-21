import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatPrice } from '../types/subscription';
import {
  formatPriceUpdatedAt,
  giftStatusLabel,
  type GiftInfo,
} from '../types/gift';

export default function PublicInvitePage() {
  const { slug = '', token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<{
    title: string;
    description?: string;
    eventDate?: string;
    location?: string;
    slug: string;
    coverUrl?: string;
  } | null>(null);
  const [guest, setGuest] = useState<{
    fullName: string;
    maxCompanions: number;
    attendanceStatus: string;
    confirmedCompanionCount: number;
    bringingChildren?: boolean;
    childCount?: number;
    childAges?: number[];
    inviteMessage?: string;
  } | null>(null);
  const [attending, setAttending] = useState(true);
  const [companionCount, setCompanionCount] = useState(0);
  const [bringingChildren, setBringingChildren] = useState(false);
  const [childCount, setChildCount] = useState(1);
  const [childAges, setChildAges] = useState<number[]>([0]);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftInfo[]>([]);
  const [giftQuery, setGiftQuery] = useState('');
  const [giftCategory, setGiftCategory] = useState('');

  useEffect(() => {
    api
      .getPublicInvitation(token, slug)
      .then((result) => {
        setEvent(result.event);
        setGuest(result.guest);
        setAttending(result.guest.attendanceStatus !== 'DECLINED');
        setCompanionCount(result.guest.confirmedCompanionCount);
        setBringingChildren(Boolean(result.guest.bringingChildren));
        const count = Math.max(1, result.guest.childCount ?? 1);
        setChildCount(result.guest.bringingChildren ? count : 1);
        setChildAges(
          result.guest.bringingChildren
            ? (result.guest.childAges ?? []).concat(
                Array(Math.max(0, count - (result.guest.childAges?.length ?? 0))).fill(0)
              ).slice(0, count)
            : [0]
        );
        if (result.guest.attendanceStatus !== 'UNANSWERED') {
          setDoneMessage(
            result.guest.attendanceStatus === 'CONFIRMED'
              ? 'Presença confirmada! Esperamos você.'
              : 'Sentiremos sua falta. Obrigado por nos avisar.'
          );
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Convite não encontrado.')
      )
      .finally(() => setLoading(false));
  }, [slug, token]);

  useEffect(() => {
    if (!doneMessage || !guest || guest.attendanceStatus === 'DECLINED') return;
    api
      .getPublicGifts(token)
      .then((result) => setGifts(result.gifts))
      .catch(() => setGifts([]));
  }, [doneMessage, token, guest]);

  async function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    setError(null);
    try {
      const result = await api.submitPublicRsvp(token, {
        attending,
        companionCount: attending ? companionCount : 0,
        bringingChildren: attending ? bringingChildren : false,
        childCount: attending && bringingChildren ? childCount : 0,
        childAges: attending && bringingChildren ? childAges.slice(0, childCount) : [],
      });
      setDoneMessage(result.message);
      setGuest((current) =>
        current
          ? {
              ...current,
              attendanceStatus: result.attendanceStatus,
              confirmedCompanionCount: result.confirmedCompanionCount,
            }
          : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível responder.');
    }
  }

  const categories = [...new Set(gifts.map((gift) => gift.category).filter(Boolean))];
  const visibleGifts = gifts.filter((gift) => {
    const matchesQuery = gift.name.toLowerCase().includes(giftQuery.toLowerCase());
    const matchesCategory = !giftCategory || gift.category === giftCategory;
    return matchesQuery && matchesCategory;
  });

  return (
    <main className="page-shell invite-shell">
      <section className="hero invite-card">
        {loading ? (
          <p>Carregando convite…</p>
        ) : error || !event || !guest ? (
          <p>{error ?? 'Convite não encontrado.'}</p>
        ) : (
          <>
            {event.coverUrl && (
              <img
                className="invite-cover"
                src={event.coverUrl}
                alt={`Capa de ${event.title}`}
              />
            )}
            <p className="auth-eyebrow">Convite</p>
            <h1>{event.title}</h1>
            <p>Olá, {guest.fullName}.</p>
            {event.eventDate && <p>Data: {formatDate(event.eventDate)}</p>}
            {event.location && <p>Local: {event.location}</p>}
            {guest.inviteMessage && <p>{guest.inviteMessage}</p>}
            {event.description && <p className="auth-muted">{event.description}</p>}

            {error && <p className="status error">{error}</p>}
            {doneMessage && <p className="status success">{doneMessage}</p>}

            <form className="event-form" onSubmit={(eventForm) => void submit(eventForm)}>
              <div className="invite-actions">
                <button
                  type="button"
                  className={`send-button compact-button ${attending ? '' : 'ghost-like'}`}
                  onClick={() => setAttending(true)}
                >
                  Vou participar
                </button>
                <button
                  type="button"
                  className={`ghost-button ${attending ? '' : 'active'}`}
                  onClick={() => setAttending(false)}
                >
                  Não poderei participar
                </button>
              </div>
              {attending && guest.maxCompanions > 0 && (
                <label>
                  Você irá acompanhado?
                  <select
                    value={companionCount}
                    onChange={(eventSelect) =>
                      setCompanionCount(Number(eventSelect.target.value))
                    }
                  >
                    {Array.from({ length: guest.maxCompanions + 1 }, (_, index) => (
                      <option key={index} value={index}>
                        {index === 0 ? 'Só eu' : `${index} acompanhante(s)`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {attending && (
                <div className="invite-children">
                  <label>
                    Vai levar criança?
                    <select
                      value={bringingChildren ? 'yes' : 'no'}
                      onChange={(eventSelect) => {
                        const yes = eventSelect.target.value === 'yes';
                        setBringingChildren(yes);
                        if (yes && childCount < 1) setChildCount(1);
                      }}
                    >
                      <option value="no">Não</option>
                      <option value="yes">Sim</option>
                    </select>
                  </label>
                  {bringingChildren && (
                    <>
                      <label>
                        Quantas crianças?
                        <select
                          value={childCount}
                          onChange={(eventSelect) => {
                            const next = Number(eventSelect.target.value);
                            setChildCount(next);
                            setChildAges((current) =>
                              Array.from({ length: next }, (_, index) => current[index] ?? 0)
                            );
                          }}
                        >
                          {Array.from({ length: 10 }, (_, index) => (
                            <option key={index + 1} value={index + 1}>
                              {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="invite-ages">
                        {childAges.slice(0, childCount).map((age, index) => (
                          <label key={index}>
                            Idade {index + 1}
                            <input
                              type="number"
                              min={0}
                              max={17}
                              value={age}
                              onChange={(eventInput) => {
                                const next = Number(eventInput.target.value);
                                setChildAges((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? next : item
                                  )
                                );
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <button type="submit" className="send-button compact-button">
                Enviar resposta
              </button>
            </form>

            {guest.attendanceStatus === 'CONFIRMED' && (
              <section className="public-gifts">
                <h2>Lista de presentes</h2>
                <div className="photo-toolbar">
                  <label>
                    Buscar
                    <input
                      value={giftQuery}
                      onChange={(eventInput) => setGiftQuery(eventInput.target.value)}
                    />
                  </label>
                  <label>
                    Categoria
                    <select
                      value={giftCategory}
                      onChange={(eventSelect) => setGiftCategory(eventSelect.target.value)}
                    >
                      <option value="">Todas</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="gift-owner-grid">
                  {visibleGifts.map((gift) => (
                    <article className="dashboard-card" key={gift.id}>
                      <h3>{gift.name}</h3>
                      <p>
                        <span className={`planning-pill gift-${gift.status.toLowerCase()}`}>
                          {gift.status === 'PURCHASED'
                            ? '✓ Já comprado'
                            : giftStatusLabel[gift.status]}
                        </span>
                      </p>
                      <p>
                        {gift.remainingQuantity} disponível(is) de {gift.desiredQuantity}
                      </p>
                      {gift.priceCents != null && (
                        <p>
                          {formatPrice(gift.priceCents)}
                          {gift.store ? ` · ${gift.store}` : ''}
                        </p>
                      )}
                      <small>{formatPriceUpdatedAt(gift.priceUpdatedAt)}</small>
                      <div className="admin-actions">
                        {gift.productUrl && gift.status !== 'PURCHASED' && (
                          <a
                            className="ghost-button"
                            href={gift.productUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Comprar na loja
                          </a>
                        )}
                        {gift.status !== 'PURCHASED' && gift.remainingQuantity > 0 && (
                          <button
                            type="button"
                            className="send-button compact-button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Você deseja marcar este presente como comprado?'
                                )
                              ) {
                                void api
                                  .purchasePublicGift(token, gift.id)
                                  .then((result) => {
                                    setDoneMessage(result.message);
                                    setGifts((current) =>
                                      current.map((item) =>
                                        item.id === result.gift.id ? result.gift : item
                                      )
                                    );
                                  })
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Não foi possível marcar.'
                                    )
                                  );
                              }
                            }}
                          >
                            Vou comprar este presente
                          </button>
                        )}
                      </div>
                      {gift.offers?.slice(0, 3).map((offer) => (
                        <p key={offer.url}>
                          {offer.store}: {formatPrice(offer.priceCents)}{' '}
                          <a href={offer.url} target="_blank" rel="noreferrer">
                            Ver oferta
                          </a>
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
