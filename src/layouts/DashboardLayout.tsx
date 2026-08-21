import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import SubscriptionAlertBanner from '../components/SubscriptionAlert';
import type { SubscriptionAlert } from '../types/subscription';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/perfil', label: 'Meu Perfil' },
  { to: '/eventos', label: 'Meus Eventos' },
  { to: '/convidados', label: 'Convidados' },
  { to: '/presentes', label: 'Lista de Presentes' },
  { to: '/mesas', label: 'Mesas' },
  { to: '/fotos', label: 'Fotos' },
  { to: '/download', label: 'Download' },
  { to: '/pagamento', label: 'Pagamento' },
  { to: '/assinatura', label: 'Meu Acesso' },
  { to: '/configuracoes', label: 'Configurações' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [alert, setAlert] = useState<SubscriptionAlert | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api
      .getSubscriptionSummary()
      .then((summary) => setAlert(summary.alert))
      .catch(() => setAlert(null));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.body.classList.add('nav-locked');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('nav-locked');
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function signOut() {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`app-layout ${menuOpen ? 'nav-open' : ''}`}>
      <header className="app-mobile-bar">
        <NavLink to="/dashboard" className="app-brand">
          <span>✦</span>
          <strong>Galerias</strong>
        </NavLink>
        <button
          type="button"
          className="app-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sr-only">
            {menuOpen ? 'Fechar menu' : 'Abrir menu'}
          </span>
          <span aria-hidden="true" />
        </button>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="app-nav-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className="app-sidebar" id="app-sidebar">
        <NavLink to="/dashboard" className="app-brand app-brand-desktop">
          <span>✦</span>
          <strong>Galerias</strong>
        </NavLink>

        <nav className="app-navigation" aria-label="Menu principal">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'app-nav-link active' : 'app-nav-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className="app-nav-link">
              Administração
            </NavLink>
          )}
        </nav>

        <div className="sidebar-account">
          <div className="sidebar-avatar">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              user?.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </aside>

      <section className="app-content">
        <SubscriptionAlertBanner alert={alert} />
        <Outlet />
      </section>
    </div>
  );
}
