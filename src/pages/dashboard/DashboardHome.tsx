import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import SubscriptionAlertBanner from '../../components/SubscriptionAlert';
import { formatDate, type SubscriptionSummary } from '../../types/subscription';

export default function DashboardHome() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [galleryCount, setGalleryCount] = useState(0);

  useEffect(() => {
    Promise.all([api.getSubscriptionSummary(), api.getGalleries()])
      .then(([subscription, galleryResult]) => {
        setSummary(subscription);
        setGalleryCount(galleryResult.galleries.length);
      })
      .catch(() => setSummary(null));
  }, []);

  const sub = summary?.subscription;

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Dashboard</p>
          <h1>Olá, {user?.name}</h1>
          <p className="auth-muted">
            Acompanhe seu acesso e prepare sua primeira galeria.
          </p>
        </div>
      </header>

      <SubscriptionAlertBanner alert={summary?.alert ?? null} />

      <section className="metric-grid">
        <article className="metric-card">
          <span>Fotos</span>
          <strong>0</strong>
          <small>Fotos armazenadas</small>
        </article>
        <article className="metric-card">
          <span>Armazenamento</span>
          <strong>0 MB</strong>
          <small>
            de{' '}
            {summary
              ? Math.round(summary.offer.maxStorageBytes / 1024 ** 3)
              : 0}{' '}
            GB
          </small>
        </article>
        <article className="metric-card">
          <span>Galerias</span>
          <strong>{galleryCount}</strong>
          <small>de {summary?.offer.maxGalleries ?? 0}</small>
        </article>
        <article className="metric-card">
          <span>Dias restantes</span>
          <strong>
            {summary?.isAdmin ? '∞' : sub?.daysRemaining ?? 0}
          </strong>
          <small>{sub?.expiresAt ? `até ${formatDate(sub.expiresAt)}` : 'sem acesso'}</small>
        </article>
      </section>

      <section className="dashboard-grid dashboard-details">
        <article className="dashboard-card">
          <h2>Sua conta</h2>
          <p><strong>E-mail:</strong> {user?.email}</p>
          <p><strong>Perfil:</strong> {user?.role === 'ADMIN' ? 'Administrador' : 'Cliente'}</p>
          <p><strong>Status:</strong> {user?.status === 'ACTIVE' ? 'Ativa' : 'Bloqueada'}</p>
        </article>

        <article className="dashboard-card">
          <h2>Acesso temporário</h2>
          {summary?.isAdmin ? (
            <p>Acesso administrativo sem vencimento.</p>
          ) : sub?.status === 'ACTIVE' ? (
            <>
              <p><strong>Status:</strong> Ativo</p>
              <p><strong>Vencimento:</strong> {formatDate(sub.expiresAt)}</p>
              <p><strong>Dias restantes:</strong> {sub.daysRemaining ?? 0}</p>
            </>
          ) : (
            <p>Sem acesso ativo.</p>
          )}
          <Link to="/assinatura" className="dashboard-link">
            {summary?.hasAccess ? 'Renovar acesso' : 'Comprar acesso'} →
          </Link>
        </article>
      </section>
    </main>
  );
}
