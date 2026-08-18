import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/perfil', label: 'Meu Perfil' },
  { to: '/eventos', label: 'Meus Eventos' },
  { to: '/fotos', label: 'Fotos' },
  { to: '/download', label: 'Download' },
  { to: '/pagamento', label: 'Pagamento' },
  { to: '/assinatura', label: 'Meu Acesso' },
  { to: '/configuracoes', label: 'Configurações' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <NavLink to="/dashboard" className="app-brand">
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
          <button type="button" onClick={signOut}>
            Sair
          </button>
        </div>
      </aside>

      <section className="app-content">
        <Outlet />
      </section>
    </div>
  );
}
