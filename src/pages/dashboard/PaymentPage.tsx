import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  paymentStatusLabel,
  type PaymentInfo,
} from '../../types/payment';
import {
  formatDate,
  formatPrice,
  type SubscriptionSummary,
} from '../../types/subscription';

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutReturn = searchParams.get('checkout');

  const loadData = useCallback(async () => {
    const [summaryResult, paymentResult] = await Promise.all([
      api.getSubscriptionSummary(),
      api.getPayments(),
    ]);
    setSummary(summaryResult);
    setPayments(paymentResult.payments);
  }, []);

  useEffect(() => {
    loadData()
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar.')
      )
      .finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    if (checkoutReturn !== 'success' && checkoutReturn !== 'pending') return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      loadData().catch(() => undefined);
      if (attempts >= 5) window.clearInterval(timer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [checkoutReturn, loadData]);

  async function checkout() {
    setStarting(true);
    setError(null);
    try {
      const result = await api.createCheckout();
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível iniciar o pagamento.'
      );
      setStarting(false);
    }
  }

  if (loading) {
    return <main className="panel-page">Carregando…</main>;
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Mercado Pago</p>
          <h1>Pagamento</h1>
          <p className="auth-muted">
            Pagamento único, sem cobrança ou renovação automática.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}
      {(checkoutReturn === 'success' || checkoutReturn === 'pending') && (
        <p className="status success">
          Aguardando a confirmação segura do Mercado Pago.
        </p>
      )}
      {checkoutReturn === 'failure' && (
        <p className="status error">
          O pagamento não foi concluído. Tente novamente.
        </p>
      )}

      {!summary?.isAdmin && summary && (
        <section className="checkout-card">
          <div>
            <span>Acesso por {summary.offer.durationDays} dias</span>
            <strong>{formatPrice(summary.offer.priceCents)}</strong>
            <small>
              {summary.hasAccess
                ? `A renovação acrescentará mais ${summary.offer.durationDays} dias.`
                : 'O acesso será liberado após a confirmação do webhook.'}
            </small>
          </div>
          <button
            type="button"
            className="send-button"
            onClick={checkout}
            disabled={starting}
          >
            {starting
              ? 'Abrindo Mercado Pago…'
              : summary.hasAccess
                ? 'Renovar acesso'
                : 'Comprar acesso'}
          </button>
        </section>
      )}

      <section className="payment-history">
        <h2 className="plans-title">Histórico de pagamentos</h2>
        {payments.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhum pagamento</h3>
            <p>Suas compras e renovações aparecerão aqui.</p>
          </div>
        ) : (
          <div className="payment-list">
            {payments.map((payment) => (
              <article className="payment-row" key={payment.id}>
                <div>
                  <strong>{formatPrice(payment.amountCents)}</strong>
                  <span>{formatDate(payment.createdAt)}</span>
                </div>
                <span
                  className={`payment-status ${payment.status.toLowerCase()}`}
                >
                  {paymentStatusLabel[payment.status]}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
