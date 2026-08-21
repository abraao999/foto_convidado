import { FormEvent, useEffect, useState } from 'react';
import {
  api,
  type AdminGalleryRow,
  type AdminOverview,
  type AdminPaymentRow,
  type AdminUserRow,
} from '../../api/client';
import PhotoPagination from '../../components/PhotoPagination';
import {
  formatDate,
  formatPrice,
  formatStorage,
} from '../../types/subscription';
import { paymentStatusLabel } from '../../types/payment';

type AdminTab = 'overview' | 'users' | 'payments' | 'galleries';
const ADMIN_PAGE_SIZE = 40;

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [galleries, setGalleries] = useState<AdminGalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadTab(nextTab: AdminTab, nextPage = 1) {
    setLoading(true);
    setError(null);
    try {
      if (nextTab === 'overview') {
        setOverview(await api.adminOverview());
        setTotal(0);
      } else if (nextTab === 'users') {
        const [result, snapshot] = await Promise.all([
          api.adminUsers(nextPage, ADMIN_PAGE_SIZE),
          overview ? Promise.resolve(overview) : api.adminOverview(),
        ]);
        if (!overview) setOverview(snapshot);
        setUsers(result.users);
        setTotal(result.total);
        if (result.page !== nextPage) setPage(result.page);
      } else if (nextTab === 'payments') {
        const result = await api.adminPayments(nextPage, ADMIN_PAGE_SIZE);
        setPayments(result.payments);
        setTotal(result.total);
        if (result.page !== nextPage) setPage(result.page);
      } else {
        const result = await api.adminGalleries(nextPage, ADMIN_PAGE_SIZE);
        setGalleries(result.galleries);
        setTotal(result.total);
        if (result.page !== nextPage) setPage(result.page);
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
    void loadTab(tab, page);
  }, [tab, page]);

  function changeTab(nextTab: AdminTab) {
    setPage(1);
    setTab(nextTab);
  }

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
      const refreshed = await api.adminUsers(page, ADMIN_PAGE_SIZE);
      setUsers(refreshed.users);
      setTotal(refreshed.total);
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

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    setCreatingAdmin(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.adminCreateUser({
        name: adminName,
        email: adminEmail,
        password: adminPassword,
      });
      setMessage(result.message);
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setPage(1);
      const refreshed = await api.adminUsers(1, ADMIN_PAGE_SIZE);
      setUsers(refreshed.users);
      setTotal(refreshed.total);
      setOverview(await api.adminOverview());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível criar o administrador.'
      );
    } finally {
      setCreatingAdmin(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Operação</p>
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
            onClick={() => changeTab(id)}
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
        <>
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
        <p className="auth-muted admin-offer-note">
          Oferta única via ambiente: {formatPrice(overview.offer.priceCents)} ·{' '}
          {overview.offer.durationDays} dias · {overview.offer.maxGalleries}{' '}
          galeria(s) · {formatStorage(overview.offer.maxStorageBytes)}. Sem CRUD
          de planos.
        </p>
        <div className="admin-purge-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setError(null);
              setMessage(null);
              api
                .adminPurgeExpiredMedia()
                .then((result) => setMessage(result.message))
                .catch((err) =>
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Não foi possível limpar a mídia.'
                  )
                );
            }}
          >
            Limpar fotos de assinaturas expiradas
          </button>
          <p className="auth-muted">
            Remove fotos e capas de contas cuja carência após o vencimento já
            terminou. O cron diário faz a mesma limpeza automaticamente.
          </p>
        </div>
        </>
      ) : tab === 'users' ? (
        <section className="admin-users-section">
          <p className="auth-muted">
            Use <strong>Liberar acesso</strong> para dar o período da plataforma
            a qualquer usuário, mesmo sem pagamento no Mercado Pago. Se ele já
            tiver acesso ativo, os dias são somados.
          </p>
          <form className="admin-create-form" onSubmit={createAdmin}>
            <h2>Novo administrador</h2>
            <p className="auth-muted">
              Cria uma conta com papel ADMIN e acesso imediato ao painel.
            </p>
            <div className="admin-create-grid">
              <label>
                Nome
                <input
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="off"
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  required
                  maxLength={254}
                  autoComplete="off"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <button
              type="submit"
              className="send-button compact-button"
              disabled={creatingAdmin}
            >
              {creatingAdmin ? 'Criando…' : 'Criar administrador'}
            </button>
          </form>

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
                    <td data-label="Nome">{user.name}</td>
                    <td data-label="E-mail">{user.email}</td>
                    <td data-label="Papel">{user.role}</td>
                    <td data-label="Status">
                      {user.status === 'BLOCKED' ? 'Bloqueado' : 'Ativo'}
                    </td>
                    <td data-label="Acesso">
                      {user.activeSubscription
                        ? `${user.activeSubscription.daysRemaining ?? 0} dia(s)`
                        : '—'}
                    </td>
                    <td className="admin-actions" data-label="Ações">
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
                        onClick={() => {
                          const days =
                            overview?.offer.durationDays ?? 90;
                          if (
                            !window.confirm(
                              `Liberar ${days} dias de acesso para ${user.name} sem exigir pagamento?`
                            )
                          ) {
                            return;
                          }
                          void runUserAction(user.id, () =>
                            api.adminGrantAccess(user.id)
                          );
                        }}
                      >
                        Liberar acesso
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
          <PhotoPagination
            page={page}
            totalItems={total}
            pageSize={ADMIN_PAGE_SIZE}
            onChange={setPage}
          />
          </section>
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
                  <td data-label="Cliente">
                    <strong>{payment.userName ?? '—'}</strong>
                    <br />
                    <span className="auth-muted">{payment.userEmail}</span>
                  </td>
                  <td data-label="Valor">{formatPrice(payment.amountCents)}</td>
                  <td data-label="Status">{paymentStatusLabel[payment.status]}</td>
                  <td data-label="Pago em">{formatDate(payment.paidAt)}</td>
                  <td data-label="Criado em">{formatDate(payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="auth-muted">Nenhum pagamento registrado.</p>
          )}
          <PhotoPagination
            page={page}
            totalItems={total}
            pageSize={ADMIN_PAGE_SIZE}
            onChange={setPage}
          />
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
                  <td data-label="Evento">{gallery.title}</td>
                  <td data-label="Dono">
                    <strong>{gallery.userName ?? '—'}</strong>
                    <br />
                    <span className="auth-muted">{gallery.userEmail}</span>
                  </td>
                  <td data-label="Slug">{gallery.slug}</td>
                  <td data-label="Status">{gallery.status}</td>
                  <td data-label="Criada em">{formatDate(gallery.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {galleries.length === 0 && (
            <p className="auth-muted">Nenhuma galeria encontrada.</p>
          )}
          <PhotoPagination
            page={page}
            totalItems={total}
            pageSize={ADMIN_PAGE_SIZE}
            onChange={setPage}
          />
        </section>
      )}
    </main>
  );
}
