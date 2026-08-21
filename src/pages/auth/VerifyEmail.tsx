import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Link de confirmação inválido.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await api.verifyEmail({ token });
        if (cancelled) return;
        setUser(result.user);
        setMessage(result.message);
        window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Não foi possível confirmar o e-mail.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate, setUser]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">Confirmação</p>
        <h1>Validar e-mail</h1>
        {loading && <p className="auth-muted">Confirmando seu e-mail…</p>}
        {message && <p className="status success">{message}</p>}
        {error && (
          <>
            <p className="status error">{error}</p>
            <p className="auth-muted">Solicite um novo link na tela de login ou cadastro.</p>
          </>
        )}
        <p className="auth-links">
          <Link to="/login">Ir para o login</Link>
        </p>
      </section>
    </main>
  );
}
