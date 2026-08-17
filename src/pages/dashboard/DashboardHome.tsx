import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import SubscriptionAlertBanner from '../../components/SubscriptionAlert';
import { formatDate, type SubscriptionSummary } from '../../types/subscription';

export default function DashboardHome() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);

  useEffect(() => {
    api.getSubscriptionSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  const sub = summary?.subscription;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="auth-eyebrow">Dashboard</p>
          <h1>Olá, {user?.name}</h1>
          <p className="auth-muted">Acompanhe sua assinatura e gerencie suas galerias.</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => logout()}>
          Sair
        </button>
      </header>

      <SubscriptionAlertBanner alert={summary?.alert ?? null} />

      <section className="dashboard-grid">
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

      <p className="auth-links">
        <Link to="/enviar">Página legada de upload (convidados)</Link>
      </p>
    </main>
  );
}
