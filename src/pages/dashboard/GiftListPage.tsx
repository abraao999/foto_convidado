import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatPrice } from '../../types/subscription';
import type { GalleryInfo } from '../../types/gallery';
import {
  formatPriceUpdatedAt,
  giftStatusLabel,
  type GiftInfo,
  type GiftOffer,
} from '../../types/gift';

const emptyForm = {
  name: '',
  description: '',
  category: '',
  desiredQuantity: 1,
  notes: '',
};

export default function GiftListPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [gifts, setGifts] = useState<GiftInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offers, setOffers] = useState<GiftOffer[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
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
      );
  }, []);

  useEffect(() => {
    if (!galleryId) return;
    api
      .getGifts(galleryId)
      .then((result) => setGifts(result.gifts))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar.')
      );
  }, [galleryId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!galleryId) return;
    setError(null);
    try {
      const body = {
        ...form,
        desiredQuantity: Number(form.desiredQuantity) || 1,
      };
      if (editingId) {
        const result = await api.updateGift(galleryId, editingId, body);
        setMessage(result.message);
      } else {
      const result = await api.createGift(galleryId, body);
      if (offers[0]) {
        await api.applyGiftOffer(galleryId, result.gift.id, offers[0]);
      }
      setMessage(result.message);
      }
      setForm(emptyForm);
      setEditingId(null);
      setGifts((await api.getGifts(galleryId)).gifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  async function searchOffers() {
    if (!galleryId || form.name.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const result = await api.searchGiftOffers(galleryId, form.name);
      setOffers(result.offers);
      setProviders(result.providers);
      if (result.offers.length === 0) {
        setMessage(
          result.providers.length === 0
            ? 'Nenhuma fonte de pesquisa está configurada.'
            : 'Nenhuma oferta encontrada nas fontes consultadas.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na pesquisa.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Organização</p>
          <h1>Lista de Presentes</h1>
          <p className="auth-muted">
            Sugira presentes, busque ofertas reais e acompanhe o que já foi
            comprado.
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

          <section className="form-section">
            <h2>{editingId ? 'Editar presente' : 'Adicionar presente'}</h2>
            <form className="event-form" onSubmit={(event) => void save(event)}>
              <div className="form-grid">
                <label>
                  Nome
                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Categoria
                  <input
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    placeholder="Eletrodomésticos, cama, mesa..."
                  />
                </label>
                <label>
                  Quantidade desejada
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.desiredQuantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        desiredQuantity: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="form-field-wide">
                  Descrição
                  <input
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void searchOffers()}
                  disabled={searching}
                >
                  {searching ? 'Buscando…' : 'Buscar ofertas'}
                </button>
                <button type="submit" className="send-button compact-button">
                  {editingId ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </form>
            {providers.length > 0 && (
              <p className="auth-muted">Fontes consultadas: {providers.join(', ')}</p>
            )}
            {offers.length > 0 && (
              <ul className="gift-offer-list">
                {offers.map((offer) => (
                  <li key={offer.url}>
                    {offer.imageUrl && <img src={offer.imageUrl} alt="" />}
                    <div>
                      <strong>{offer.title}</strong>
                      <span>
                        {offer.store} · {formatPrice(offer.priceCents)}
                      </span>
                    </div>
                    <a
                      className="ghost-button"
                      href={offer.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver oferta
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="gift-owner-grid">
            {gifts.map((gift) => (
              <article className="dashboard-card" key={gift.id}>
                {gift.imageUrl && (
                  <img className="gift-thumb" src={gift.imageUrl} alt="" />
                )}
                <h2>{gift.name}</h2>
                <p>
                  <span
                    className={`planning-pill gift-${gift.status.toLowerCase()}`}
                  >
                    {giftStatusLabel[gift.status]}
                  </span>
                </p>
                <p>
                  {gift.remainingQuantity} de {gift.desiredQuantity} disponíveis
                </p>
                {gift.priceCents != null && (
                  <p>
                    {formatPrice(gift.priceCents)}
                    {gift.store ? ` · ${gift.store}` : ''}
                  </p>
                )}
                <small>{formatPriceUpdatedAt(gift.priceUpdatedAt)}</small>
                <div className="admin-actions">
                  {gift.productUrl && (
                    <a
                      className="ghost-button"
                      href={gift.productUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir loja
                    </a>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      void api
                        .refreshGiftPrice(galleryId, gift.id)
                        .then(async (result) => {
                          setMessage(result.message);
                          setGifts((await api.getGifts(galleryId)).gifts);
                        })
                        .catch((err) =>
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Não foi possível atualizar.'
                          )
                        )
                    }
                  >
                    Atualizar preços
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditingId(gift.id);
                      setForm({
                        name: gift.name,
                        description: gift.description ?? '',
                        category: gift.category ?? '',
                        desiredQuantity: gift.desiredQuantity,
                        notes: gift.notes ?? '',
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-action"
                    onClick={() => {
                      if (window.confirm('Excluir este presente?')) {
                        void api.deleteGift(galleryId, gift.id).then(async () => {
                          setGifts((await api.getGifts(galleryId)).gifts);
                        });
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
