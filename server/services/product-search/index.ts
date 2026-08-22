import { mercadoLivreProvider } from './mercadolivre.js';
import type {
  ProductSearchProvider,
  ProductSearchResult,
} from './types.js';

const providers: ProductSearchProvider[] = [mercadoLivreProvider];

export async function searchProducts(
  query: string
): Promise<ProductSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    throw new Error('Informe ao menos 2 caracteres para pesquisar.');
  }
  const queriedAt = new Date();
  const used: string[] = [];
  const offers = [];
  const failures: Error[] = [];
  for (const provider of providers) {
    if (!provider.enabled()) continue;
    try {
      const found = await provider.search(q);
      offers.push(...found);
      used.push(provider.id);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (used.length === 0 && failures.length > 0) {
    throw failures[0];
  }
  offers.sort((a, b) => a.priceCents - b.priceCents);
  return { offers, providers: used, queriedAt };
}
