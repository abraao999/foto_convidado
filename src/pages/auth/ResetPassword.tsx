import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError('Token inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">Nova senha</p>
        <h1>Redefinir senha</h1>
        <p className="auth-muted">Escolha uma nova senha para sua conta.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Nova senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          {error && <p className="status error">{error}</p>}
          <button type="submit" className="send-button" disabled={submitting || !token}>
            {submitting ? 'Salvando…' : 'Redefinir senha'}
          </button>
        </form>
        <p className="auth-links">
          <Link to="/login">Voltar ao login</Link>
        </p>
      </section>
    </main>
  );
}
