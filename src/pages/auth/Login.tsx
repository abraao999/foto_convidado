import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

function isUnverifiedError(message: string) {
  return message.toLowerCase().includes('confirme seu e-mail');
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    setNeedsVerification(false);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível entrar.';
      setError(message);
      setNeedsVerification(isUnverifiedError(message));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResending(true);
    setError(null);
    try {
      const result = await api.resendVerification({ email });
      setInfo(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o e-mail.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">Plataforma de galerias</p>
        <h1>Entrar</h1>
        <p className="auth-muted">Acesse seu painel para gerenciar suas galerias.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="status error">{error}</p>}
          {info && <p className="status success">{info}</p>}
          <button type="submit" className="send-button" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
          {needsVerification && (
            <button type="button" className="ghost-button" onClick={onResend} disabled={resending || !email}>
              {resending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
            </button>
          )}
        </form>
        <p className="auth-links">
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
          <span> · </span>
          <Link to="/cadastro">Criar conta</Link>
        </p>
      </section>
    </main>
  );
}
