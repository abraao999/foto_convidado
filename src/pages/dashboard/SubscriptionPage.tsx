import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import SubscriptionAlertBanner from '../../components/SubscriptionAlert';
import {
  formatDate,
  formatPrice,
  formatStorage,
  type SubscriptionSummary,
} from '../../types/subscription';

export default function SubscriptionPage() {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSubscriptionSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="dashboard-shell">
        <p className="auth-muted">Carregando…</p>
      </main>
    );
  }

  const sub = summary?.subscription;

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Acesso temporário</p>
          <h1>Meu acesso</h1>
          <p className="auth-muted">
            Acompanhe a validade ou compre mais {summary?.offer.durationDays ?? 90} dias.
          </p>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}
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

      {!summary?.isAdmin && summary && (
        <section className="access-details">
          <h2>Condições do acesso</h2>
          <p>
            <strong>{formatPrice(summary.offer.priceCents)}</strong> por{' '}
            {summary.offer.durationDays} dias
          </p>
          <p>Até {summary.offer.maxGalleries} galeria</p>
          <p>{formatStorage(summary.offer.maxStorageBytes)} de armazenamento</p>
          <Link to="/pagamento" className="send-button dashboard-link-button">
            {summary.hasAccess ? 'Renovar acesso' : 'Comprar acesso'}
          </Link>
        </section>
      )}
    </main>
  );
}
