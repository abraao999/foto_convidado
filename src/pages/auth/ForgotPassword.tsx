import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.forgotPassword({ email });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar a solicitação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">Recuperação</p>
        <h1>Esqueci minha senha</h1>
        <p className="auth-muted">Informe seu e-mail para receber instruções de redefinição.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {error && <p className="status error">{error}</p>}
          {message && <p className="status success">{message}</p>}
          <button type="submit" className="send-button" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar instruções'}
          </button>
        </form>
        <p className="auth-links">
          <Link to="/login">Voltar ao login</Link>
        </p>
      </section>
    </main>
  );
}
