import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function Register() {
  const { register, user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await register(name, email, password);
      if (result.verificationRequired) {
        setPendingEmail(result.email ?? email);
        setInfo(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!pendingEmail) return;
    setResending(true);
    setError(null);
    try {
      const result = await api.resendVerification({ email: pendingEmail });
      setInfo(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o e-mail.');
    } finally {
      setResending(false);
    }
  }

  if (pendingEmail) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="auth-eyebrow">Confirme seu e-mail</p>
          <h1>Quase lá</h1>
          <p className="auth-muted">
            Enviamos um link de confirmação para <strong>{pendingEmail}</strong>. Abra o e-mail e
            confirme para ativar sua conta.
          </p>
          {info && <p className="status success">{info}</p>}
          {error && <p className="status error">{error}</p>}
          <button type="button" className="send-button" onClick={onResend} disabled={resending}>
            {resending ? 'Reenviando…' : 'Reenviar e-mail'}
          </button>
          <p className="auth-links">
            Já confirmou? <Link to="/login">Entrar</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">Comece agora</p>
        <h1>Criar conta</h1>
        <p className="auth-muted">
          Cadastre-se para criar e gerenciar suas galerias. Você precisará confirmar o e-mail.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Nome
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="status error">{error}</p>}
          <button type="submit" className="send-button" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar conta'}
          </button>
        </form>
        <p className="auth-links">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
