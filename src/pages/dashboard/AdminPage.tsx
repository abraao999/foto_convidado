import { useEffect, useState } from 'react';
import {
  api,
  type AdminGalleryRow,
  type AdminOverview,
  type AdminPaymentRow,
  type AdminUserRow,
} from '../../api/client';
import {
  formatDate,
  formatPrice,
} from '../../types/subscription';
import { paymentStatusLabel } from '../../types/payment';

type AdminTab = 'overview' | 'users' | 'payments' | 'galleries';

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [galleries, setGalleries] = useState<AdminGalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadTab(nextTab: AdminTab) {
    setLoading(true);
    setError(null);
    try {
      if (nextTab === 'overview') {
        setOverview(await api.adminOverview());
      } else if (nextTab === 'users') {
        const result = await api.adminUsers();
        setUsers(result.users);
      } else if (nextTab === 'payments') {
        const result = await api.adminPayments();
        setPayments(result.payments);
      } else {
        const result = await api.adminGalleries();
        setGalleries(result.galleries);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível carregar os dados.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTab(tab);
  }, [tab]);

  async function runUserAction(
    userId: string,
    action: () => Promise<{ message: string }>
  ) {
    setBusyUserId(userId);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(result.message);
      const refreshed = await api.adminUsers();
      setUsers(refreshed.users);
      if (tab === 'overview') {
        setOverview(await api.adminOverview());
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível concluir a ação.'
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Etapa 9</p>
          <h1>Administração</h1>
          <p className="auth-muted">
            Usuários, pagamentos, acessos e galerias da plataforma.
          </p>
        </div>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="Seções admin">
        {(
          [
            ['overview', 'Resumo'],
            ['users', 'Usuários'],
            ['payments', 'Pagamentos'],
            ['galleries', 'Galerias'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ghost-button ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="status error">{error}</p>}
      {message && <p className="status success">{message}</p>}

      {loading ? (
        <p className="auth-muted">Carregando…</p>
      ) : tab === 'overview' && overview ? (
        <section className="admin-kpi-grid">
          <article>
            <span>Usuários</span>
            <strong>{overview.users}</strong>
          </article>
          <article>
            <span>Bloqueados</span>
            <strong>{overview.blockedUsers}</strong>
          </article>
          <article>
            <span>Acessos ativos</span>
            <strong>{overview.activeSubscriptions}</strong>
          </article>
          <article>
            <span>Pagamentos aprovados</span>
            <strong>{overview.approvedPayments}</strong>
          </article>
          <article>
            <span>Receita</span>
            <strong>{formatPrice(overview.revenueCents)}</strong>
          </article>
          <article>
            <span>Galerias</span>
            <strong>{overview.galleries}</strong>
          </article>
          <article>
            <span>Fotos</span>
            <strong>{overview.photos}</strong>
          </article>
        </section>
      ) : tab === 'users' ? (
        <section className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Status</th>
                <th>Acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const busy = busyUserId === user.id;
                return (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.status === 'BLOCKED' ? 'Bloqueado' : 'Ativo'}</td>
                    <td>
                      {user.activeSubscription
                        ? `${user.activeSubscription.daysRemaining ?? 0} dia(s)`
                        : '—'}
                    </td>
                    <td className="admin-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy || user.role === 'ADMIN'}
                        onClick={() =>
                          runUserAction(user.id, () =>
                            api.adminSetUserStatus(
                              user.id,
                              user.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED'
                            )
                          )
                        }
                      >
                        {user.status === 'BLOCKED' ? 'Reativar' : 'Bloquear'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy}
                        onClick={() =>
                          runUserAction(user.id, () =>
                            api.adminGrantAccess(user.id)
                          )
                        }
                      >
                        Conceder acesso
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy}
                        onClick={() =>
                          runUserAction(user.id, () =>
                            api.adminExpireAccess(user.id)
                          )
                        }
                      >
                        Expirar acesso
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="auth-muted">Nenhum usuário cadastrado.</p>
          )}
        </section>
      ) : tab === 'payments' ? (
        <section className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Pago em</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <strong>{payment.userName ?? '—'}</strong>
                    <br />
                    <span className="auth-muted">{payment.userEmail}</span>
                  </td>
                  <td>{formatPrice(payment.amountCents)}</td>
                  <td>{paymentStatusLabel[payment.status]}</td>
                  <td>{formatDate(payment.paidAt)}</td>
                  <td>{formatDate(payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="auth-muted">Nenhum pagamento registrado.</p>
          )}
        </section>
      ) : (
        <section className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Dono</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {galleries.map((gallery) => (
                <tr key={gallery.id}>
                  <td>{gallery.title}</td>
                  <td>
                    <strong>{gallery.userName ?? '—'}</strong>
                    <br />
                    <span className="auth-muted">{gallery.userEmail}</span>
                  </td>
                  <td>{gallery.slug}</td>
                  <td>{gallery.status}</td>
                  <td>{formatDate(gallery.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {galleries.length === 0 && (
            <p className="auth-muted">Nenhuma galeria encontrada.</p>
          )}
        </section>
      )}
    </main>
  );
}
