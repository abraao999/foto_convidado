/**
 * CSP da SPA (HTML). Deve permanecer alinhada a `vercel.json`.
 * Checkout do Mercado Pago é navegação top-level (`location.assign`), não iframe.
 * Previews assinados do R2 entram em img-src.
 */
export const SPA_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev",
  "connect-src 'self'",
  "form-action 'self' https://www.mercadopago.com https://www.mercadopago.com.br https://sandbox.mercadopago.com https://sandbox.mercadopago.com.br",
  'upgrade-insecure-requests',
].join('; ');
