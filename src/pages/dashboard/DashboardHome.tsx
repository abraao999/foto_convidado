import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import {
  formatDate,
  formatStorage,
  type SubscriptionSummary,
} from '../../types/subscription';
import type { PhotoStats } from '../../types/photo';
import type { PlanningSummary } from '../../types/planning';

export default function DashboardHome() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [galleryCount, setGalleryCount] = useState(0);
  const [photoStats, setPhotoStats] = useState<PhotoStats | null>(null);
  const [planning, setPlanning] = useState<PlanningSummary | null>(null);

  useEffect(() => {
    Promise.all([
      api.getSubscriptionSummary(),
      api.getGalleries(),
      api.getPhotoStats(),
    ])
      .then(([subscription, galleryResult, photos]) => {
        setSummary(subscription);
        setGalleryCount(galleryResult.galleries.length);
        setPhotoStats(photos);
        const first = galleryResult.galleries.find(
          (gallery) => gallery.status !== 'ARCHIVED'
        );
        if (first) {
          return api
            .getPlanningSummary(first.id)
            .then(setPlanning)
            .catch(() => undefined);
        }
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

      <section className="metric-grid">
        <article className="metric-card">
          <span>Fotos</span>
          <strong>{photoStats?.count ?? 0}</strong>
          <small>Fotos armazenadas</small>
        </article>
        <article className="metric-card">
          <span>Armazenamento</span>
          <strong>{formatStorage(photoStats?.totalBytes ?? 0)}</strong>
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

      {planning && (
        <section className="metric-grid planning-metrics">
          <article className="metric-card">
            <span>Convidados</span>
            <strong>{planning.guests.total}</strong>
            <small>{planning.guests.confirmed} confirmados</small>
          </article>
          <article className="metric-card">
            <span>Pessoas confirmadas</span>
            <strong>{planning.guests.confirmedPeople}</strong>
            <small>
              {planning.guests.declined} recusaram · {planning.guests.pending} pendentes
            </small>
          </article>
          <article className="metric-card">
            <span>Mesas</span>
            <strong>{planning.tables.count}</strong>
            <small>
              {planning.tables.occupied}/{planning.tables.seats} lugares
            </small>
          </article>
          <article className="metric-card">
            <span>Presentes</span>
            <strong>{planning.gifts.total}</strong>
            <small>
              {planning.gifts.purchased} comprados · {planning.gifts.available} disponíveis
            </small>
          </article>
        </section>
      )}

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
