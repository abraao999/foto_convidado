import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Landing() {
  const { user } = useAuth();

  return (
    <main className="auth-shell">
      <section className="auth-card landing-card">
        <p className="auth-eyebrow">Galerias de fotos</p>
        <h1>
          Crie, compartilhe e <em>venda acesso</em> às suas galerias.
        </h1>
        <p className="auth-muted">
          Plataforma para eventos, festas e casamentos. Seus convidados enviam e baixam fotos com facilidade.
        </p>
        <div className="landing-actions">
          {user ? (
            <Link to="/dashboard" className="send-button landing-button">
              Ir para o painel
            </Link>
          ) : (
            <>
              <Link to="/cadastro" className="send-button landing-button">
                Criar conta
              </Link>
              <Link to="/login" className="ghost-button landing-button">
                Entrar
              </Link>
            </>
          )}
        </div>
        <p className="auth-links">
          <Link to="/enviar">Ver página de upload legada</Link>
        </p>
      </section>
    </main>
  );
}
