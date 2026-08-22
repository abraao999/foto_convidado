import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { formatPrice } from '../../types/subscription';
import type { GalleryInfo } from '../../types/gallery';
import {
  formatPriceUpdatedAt,
  giftStatusLabel,
  parseReaisToCents,
  reaisInputFromCents,
  type GiftInfo,
  type GiftOffer,
  type GiftStatus,
} from '../../types/gift';

const emptyForm = {
  name: '',
  description: '',
  category: '',
  desiredQuantity: 1,
  productUrl: '',
  price: '',
  store: '',
  notes: '',
};

type GiftFilter = 'all' | GiftStatus;

const filters: Array<{ id: GiftFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'AVAILABLE', label: 'Disponíveis' },
  { id: 'PURCHASED', label: 'Comprados' },
];

export default function GiftListPage() {
  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [galleryId, setGalleryId] = useState('');
  const [gifts, setGifts] = useState<GiftInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offers, setOffers] = useState<GiftOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<GiftOffer | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GiftFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeGalleries = useMemo(
    () => galleries.filter((gallery) => gallery.status !== 'ARCHIVED'),
    [galleries]
  );

  const stats = useMemo(() => {
    const purchased = gifts.filter((gift) => gift.status === 'PURCHASED').length;
    const available = gifts.filter((gift) => gift.status === 'AVAILABLE').length;
    return {
      total: gifts.length,
      available,
      purchased,
    };
  }, [gifts]);

  const visibleGifts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return gifts.filter((gift) => {
      const matchesFilter = filter === 'all' || gift.status === filter;
      const matchesQuery =
        !needle ||
        gift.name.toLowerCase().includes(needle) ||
        (gift.category ?? '').toLowerCase().includes(needle) ||
        (gift.store ?? '').toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [gifts, filter, query]);

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
      setGifts([]);
      return;
    }
    setLoading(true);
    api
      .getGifts(galleryId)
      .then((result) => setGifts(result.gifts))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Não foi possível carregar.')
      )
      .finally(() => setLoading(false));
  }, [galleryId]);

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setOffers([]);
    setSelectedOffer(null);
    setProviders([]);
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOffers([]);
    setSelectedOffer(null);
    setFormOpen(true);
  }

  function startEdit(gift: GiftInfo) {
    setEditingId(gift.id);
    setFormOpen(true);
    setOffers([]);
    setSelectedOffer(null);
    setForm({
      name: gift.name,
      description: gift.description ?? '',
      category: gift.category ?? '',
      desiredQuantity: gift.desiredQuantity,
      productUrl: gift.productUrl ?? '',
      price: reaisInputFromCents(gift.priceCents),
      store: gift.store ?? '',
      notes: gift.notes ?? '',
    });
  }

  async function refreshGifts() {
    if (!galleryId) return;
    setGifts((await api.getGifts(galleryId)).gifts);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!galleryId) return;
    setError(null);
    try {
      const priceCents = parseReaisToCents(form.price);
      const productUrl = form.productUrl.trim() || undefined;
      const body = {
        name: form.name,
        description: form.description,
        category: form.category,
        desiredQuantity: Number(form.desiredQuantity) || 1,
        notes: form.notes,
        productUrl,
        priceCents,
        store:
          form.store.trim() ||
          (productUrl?.includes('mercadolivre') ? 'Mercado Livre' : undefined),
      };
      if (editingId) {
        const result = await api.updateGift(galleryId, editingId, body);
        if (selectedOffer) {
          await api.applyGiftOffer(galleryId, editingId, selectedOffer);
        }
        setMessage(result.message);
      } else {
        const result = await api.createGift(galleryId, body);
        if (selectedOffer) {
          await api.applyGiftOffer(galleryId, result.gift.id, selectedOffer);
        }
        setMessage(result.message);
      }
      closeForm();
      await refreshGifts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  async function searchOffers() {
    if (!galleryId || form.name.trim().length < 2) {
      setError('Digite o nome do presente para buscar ofertas.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const result = await api.searchGiftOffers(galleryId, form.name);
      setOffers(result.offers);
      setProviders(result.providers);
      setSelectedOffer(null);
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

  function chooseOffer(offer: GiftOffer) {
    setSelectedOffer(offer);
    setForm((current) => ({
      ...current,
      name: current.name.trim() ? current.name : offer.title,
      productUrl: offer.url,
      price: reaisInputFromCents(offer.priceCents),
      store: offer.store,
    }));
    setMessage(`Oferta selecionada: ${offer.store}.`);
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
        {activeGalleries.length > 0 && (
          <button
            type="button"
            className="send-button compact-button"
            onClick={() => (formOpen ? closeForm() : startCreate())}
          >
            {formOpen ? 'Cancelar' : 'Adicionar presente'}
          </button>
        )}
      </header>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {activeGalleries.length === 0 ? (
        <section className="photos-empty">
          <h2>Crie um evento primeiro</h2>
          <p>A lista de presentes pertence a um evento.</p>
          <Link to="/eventos" className="send-button compact-button">
            Criar evento
          </Link>
        </section>
      ) : (
        <>
          <section className="metric-grid planning-metrics planning-age-metrics">
            <article className="metric-card">
              <span>Presentes</span>
              <strong>{stats.total}</strong>
              <small>Na lista</small>
            </article>
            <article className="metric-card">
              <span>Disponíveis</span>
              <strong>{stats.available}</strong>
              <small>Ainda não comprados</small>
            </article>
            <article className="metric-card">
              <span>Comprados</span>
              <strong>{stats.purchased}</strong>
              <small>Já escolhidos</small>
            </article>
          </section>

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
                placeholder="Nome, categoria ou loja"
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
              <h2>{editingId ? 'Editar presente' : 'Adicionar presente'}</h2>
              <form className="event-form" onSubmit={(event) => void save(event)}>
                <div className="form-grid">
                  <label>
                    Nome
                    <input
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
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
                  <label>
                    Preço (R$)
                    <input
                      inputMode="decimal"
                      placeholder="199,90"
                      value={form.price}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          price: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Loja
                    <input
                      value={form.store}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          store: event.target.value,
                        }))
                      }
                      placeholder="Mercado Livre, loja física..."
                    />
                  </label>
                  <label className="form-field-wide">
                    Link da loja
                    <input
                      type="url"
                      value={form.productUrl}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          productUrl: event.target.value,
                        }))
                      }
                      placeholder="https://produto.mercadolivre.com.br/..."
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
                  <button type="button" className="ghost-button" onClick={closeForm}>
                    Cancelar
                  </button>
                  <button type="submit" className="send-button compact-button">
                    {editingId ? 'Salvar' : 'Adicionar'}
                  </button>
                </div>
              </form>
              {providers.length > 0 && (
                <p className="auth-muted">
                  Fontes consultadas: {providers.join(', ')}
                </p>
              )}
              {selectedOffer && (
                <p className="auth-muted">
                  Oferta escolhida: {selectedOffer.store} ·{' '}
                  {formatPrice(selectedOffer.priceCents)}
                </p>
              )}
              {offers.length > 0 && (
                <ul className="gift-offer-list">
                  {offers.map((offer) => (
                    <li
                      key={offer.url}
                      className={
                        selectedOffer?.url === offer.url ? 'is-selected' : ''
                      }
                    >
                      {offer.imageUrl && <img src={offer.imageUrl} alt="" />}
                      <div>
                        <strong>{offer.title}</strong>
                        <span>
                          {offer.store} · {formatPrice(offer.priceCents)}
                        </span>
                      </div>
                      <div className="admin-actions">
                        <a
                          className="ghost-button"
                          href={offer.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver
                        </a>
                        <button
                          type="button"
                          className="send-button compact-button"
                          onClick={() => chooseOffer(offer)}
                        >
                          Usar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {loading ? (
            <p className="auth-muted">Carregando…</p>
          ) : visibleGifts.length === 0 ? (
            <section className="empty-state">
              <p>
                {gifts.length === 0
                  ? 'Nenhum presente cadastrado neste evento.'
                  : 'Nenhum presente neste filtro.'}
              </p>
            </section>
          ) : (
            <section className="gift-owner-grid">
              {visibleGifts.map((gift) => (
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
                            await refreshGifts();
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
                      onClick={() => startEdit(gift)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger-action"
                      onClick={() => {
                        if (window.confirm('Excluir este presente?')) {
                          void api
                            .deleteGift(galleryId, gift.id)
                            .then(async () => {
                              setMessage('Presente excluído.');
                              await refreshGifts();
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
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
