/**
 * Configurações da plataforma via variáveis de ambiente.
 * Valores padrão usados quando a env não está definida.
 */
export const platformConfig = {
  /** Cada pagamento aprovado libera este número de dias. */
  accessDurationDays: parseEnvInt(process.env.ACCESS_DURATION_DAYS, 90),

  /** Preço do acesso único em centavos, evitando ponto flutuante. */
  accessPriceCents: parseEnvInt(process.env.ACCESS_PRICE_CENTS, 5000),

  /** Limites do produto único, configuráveis sem alterar código. */
  maxGalleries: parseEnvInt(process.env.ACCESS_MAX_GALLERIES, 1),
  maxStorageBytes: parseEnvInt(
    process.env.ACCESS_MAX_STORAGE_BYTES,
    5 * 1024 ** 3
  ),

  /** Tamanho máximo por foto (25 MB padrão). */
  maxPhotoBytes: parseEnvInt(
    process.env.UPLOAD_MAX_PHOTO_BYTES,
    25 * 1024 * 1024
  ),

  /** Tamanho de cada pedaço no envio resumível. */
  uploadChunkBytes: parseEnvInt(
    process.env.UPLOAD_CHUNK_BYTES,
    2 * 1024 * 1024
  ),

  /** Dias após expiração em que a galeria pública continua visível */
  publicGalleryGraceDays: Number(process.env.PUBLIC_GALLERY_GRACE_DAYS ?? 30),

  /** Dias antes do vencimento para exibir alertas no dashboard */
  subscriptionAlertDays: [30, 15, 7, 3, 1] as const,
};

export function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
