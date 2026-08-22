import type {
  ProductOffer,
  ProductSearchProvider,
} from './types.js';

const ML_SITE = process.env.MERCADOLIVRE_SITE?.trim() || 'MLB';

type MercadoLivreItem = {
  title?: unknown;
  price?: unknown;
  original_price?: unknown;
  permalink?: unknown;
  thumbnail?: unknown;
};

export function mapMercadoLivreResults(
  items: MercadoLivreItem[],
  queriedAt = new Date()
): ProductOffer[] {
  const offers: ProductOffer[] = [];
  for (const item of items) {
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    if (typeof item.permalink !== 'string' || !item.permalink.startsWith('http')) {
      continue;
    }
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
      continue;
    }
    const previous =
      typeof item.original_price === 'number' &&
      Number.isFinite(item.original_price) &&
      item.original_price > item.price
        ? Math.round(item.original_price * 100)
        : undefined;
    const image =
      typeof item.thumbnail === 'string'
        ? item.thumbnail.replace(/^http:\/\//, 'https://')
        : undefined;
    offers.push({
      provider: 'mercadolivre',
      title: item.title.trim().slice(0, 240),
      store: 'Mercado Livre',
      priceCents: Math.round(item.price * 100),
      previousPriceCents: previous,
      url: item.permalink,
      imageUrl: image,
      queriedAt,
    });
  }
  return offers;
}

export const mercadoLivreProvider: ProductSearchProvider = {
  id: 'mercadolivre',
  enabled() {
    return process.env.PRODUCT_SEARCH_DISABLE_ML !== '1';
  },
  async search(query: string) {
    const url = new URL(
      `https://api.mercadolibre.com/sites/${ML_SITE}/search`
    );
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '8');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'FotoConvidado/1.0',
    };
    const token = process.env.MERCADOLIVRE_ACCESS_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers });
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'O Mercado Livre fechou a busca pública de produtos. Cadastre o presente com o nome, o preço e o link da loja.'
        );
      }
      if (!response.ok) {
        throw new Error(
          'Mercado Livre indisponível no momento. Tente de novo em instantes.'
        );
      }
      const data = (await response.json()) as { results?: MercadoLivreItem[] };
      return mapMercadoLivreResults(data.results ?? []);
    } finally {
      clearTimeout(timer);
    }
  },
};
