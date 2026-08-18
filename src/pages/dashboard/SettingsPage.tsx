import { FormEvent, useState } from 'react';
import { api } from '../../api/client';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('As novas senhas não coincidem.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.changePassword({
        currentPassword,
        newPassword,
      });
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível alterar a senha.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Segurança</p>
          <h1>Configurações</h1>
          <p className="auth-muted">
            Gerencie a segurança e as preferências da sua conta.
          </p>
        </div>
      </header>

      <form className="form-section settings-form" onSubmit={submit}>
        <h2>Alterar senha</h2>
        <label>
          Senha atual
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        {error && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}

        <button className="send-button" type="submit" disabled={saving}>
          {saving ? 'Alterando…' : 'Alterar senha'}
        </button>
      </form>
    </main>
  );
}
