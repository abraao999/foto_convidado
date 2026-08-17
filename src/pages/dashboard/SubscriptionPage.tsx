import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import SubscriptionAlertBanner from '../../components/SubscriptionAlert';
import {
  paymentStatusLabel,
  type PaymentInfo,
} from '../../types/payment';
import {
  formatDate,
  formatPrice,
  formatStorage,
  type SubscriptionSummary,
} from '../../types/subscription';

export default function SubscriptionPage() {
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutReturn = searchParams.get('checkout');

  const loadData = useCallback(async () => {
    const [summaryResult, paymentsResult] = await Promise.all([
      api.getSubscriptionSummary(),
      api.getPayments(),
    ]);
    setSummary(summaryResult);
    setPayments(paymentsResult.payments);
  }, []);

  useEffect(() => {
    loadData()
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [loadData]);

  // O retorno do checkout é apenas informativo. O acesso só muda quando o
  // webhook autenticado confirma o pagamento; por isso consultamos o backend.
  useEffect(() => {
    if (checkoutReturn !== 'success' && checkoutReturn !== 'pending') return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      loadData().catch(() => undefined);
      if (attempts >= 5) window.clearInterval(interval);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [checkoutReturn, loadData]);

  async function startCheckout() {
    setStartingCheckout(true);
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
      setStartingCheckout(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-shell">
        <p className="auth-muted">Carregando…</p>
      </main>
    );
  }

  const sub = summary?.subscription;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="auth-eyebrow">Acesso temporário</p>
          <h1>Meu acesso</h1>
          <p className="auth-muted">
            Acompanhe a validade ou compre mais {summary?.offer.durationDays ?? 90} dias.
          </p>
        </div>
        <Link to="/dashboard" className="ghost-button">← Dashboard</Link>
      </header>

      {error && <p className="status error">{error}</p>}
      {(checkoutReturn === 'success' || checkoutReturn === 'pending') && (
        <p className="status success">
          Pagamento recebido. Estamos aguardando a confirmação segura do
          Mercado Pago.
        </p>
      )}
      {checkoutReturn === 'failure' && (
        <p className="status error">
          O pagamento não foi concluído. Você pode tentar novamente.
        </p>
      )}
      <SubscriptionAlertBanner alert={summary?.alert ?? null} />

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <h2>Status do acesso</h2>
          {summary?.isAdmin ? (
            <p>Você é administrador — acesso ilimitado à plataforma.</p>
          ) : sub?.status === 'ACTIVE' ? (
            <>
              <p>Status: <strong>Ativo</strong></p>
              <p>Início: {formatDate(sub.startsAt)}</p>
              <p>Vencimento: {formatDate(sub.expiresAt)}</p>
              <p>Dias restantes: <strong>{sub.daysRemaining ?? 0}</strong></p>
            </>
          ) : (
            <p>Você não possui acesso ativo.</p>
          )}
        </article>
      </section>

      {!summary?.isAdmin && (
        <section className="plans-section">
          <h2 className="plans-title">
            {summary?.hasAccess ? 'Renovar acesso' : 'Liberar acesso'}
          </h2>
          <div className="plans-grid">
            {summary && (
              <article className="plan-card">
                <h3>Acesso por {summary.offer.durationDays} dias</h3>
                <p className="plan-price">{formatPrice(summary.offer.priceCents)}</p>
                <p className="plan-desc">
                  Pagamento único, sem mensalidade e sem renovação automática.
                </p>
                <ul className="plan-features">
                  <li>{summary.offer.durationDays} dias de acesso</li>
                  <li>
                    Até {summary.offer.maxGalleries}{' '}
                    {summary.offer.maxGalleries === 1 ? 'galeria' : 'galerias'}
                  </li>
                  <li>{formatStorage(summary.offer.maxStorageBytes)} de armazenamento</li>
                  <li>Uma nova compra acrescenta mais {summary.offer.durationDays} dias</li>
                </ul>
                <button
                  type="button"
                  className="send-button"
                  onClick={startCheckout}
                  disabled={startingCheckout}
                >
                  {startingCheckout
                    ? 'Abrindo Mercado Pago…'
                    : `${summary.hasAccess ? 'Renovar' : 'Comprar'} por ${formatPrice(summary.offer.priceCents)}`}
                </button>
              </article>
            )}
          </div>
        </section>
      )}

      {!summary?.isAdmin && (
        <section className="payment-history">
          <h2 className="plans-title">Histórico de pagamentos</h2>
          {payments.length === 0 ? (
            <p className="auth-muted">Nenhum pagamento realizado.</p>
          ) : (
            <div className="payment-list">
              {payments.map((payment) => (
                <article className="payment-row" key={payment.id}>
                  <div>
                    <strong>{formatPrice(payment.amountCents)}</strong>
                    <span>{formatDate(payment.createdAt)}</span>
                  </div>
                  <span className={`payment-status ${payment.status.toLowerCase()}`}>
                    {paymentStatusLabel[payment.status]}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
