export interface ProductOffer {
  provider: string;
  title: string;
  store: string;
  priceCents: number;
  previousPriceCents?: number;
  url: string;
  imageUrl?: string;
  queriedAt: Date;
}

export interface ProductSearchProvider {
  id: string;
  enabled(): boolean;
  search(query: string): Promise<ProductOffer[]>;
}

export interface ProductSearchResult {
  offers: ProductOffer[];
  providers: string[];
  queriedAt: Date;
}
