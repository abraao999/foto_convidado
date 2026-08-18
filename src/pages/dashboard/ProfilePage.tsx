import { FormEvent, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(
    user?.avatarUrl ?? ''
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.updateProfile(form);
      setMessage(result.message);
      await refreshUser();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar o perfil.'
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseAvatar(file?: File) {
    setError(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Escolha uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A foto deve ter no máximo 5 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setUploadingAvatar(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.uploadAvatar(avatarFile);
      setMessage(result.message);
      setAvatarFile(null);
      setAvatarPreview(result.user.avatarUrl ?? '');
      await refreshUser();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar a foto.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">Sua conta</p>
          <h1>Meu Perfil</h1>
          <p className="auth-muted">
            Atualize seus dados pessoais e sua foto de perfil.
          </p>
        </div>
      </header>

      <form className="profile-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Dados pessoais</h2>
          <div className="avatar-uploader">
            <div className="profile-avatar-preview">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Foto de perfil" />
              ) : (
                user?.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <strong>Foto de perfil</strong>
              <p>JPG, PNG ou WebP. Tamanho máximo de 5 MB.</p>
              <div className="avatar-actions">
                <label className="ghost-button avatar-file-button">
                  Escolher foto
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      chooseAvatar(event.target.files?.[0])
                    }
                  />
                </label>
                {avatarFile && (
                  <button
                    type="button"
                    className="send-button"
                    onClick={uploadAvatar}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? 'Enviando…' : 'Enviar foto'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Nome
              <input
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                required
              />
            </label>
            <label>
              Sobrenome
              <input
                value={form.lastName}
                onChange={(event) =>
                  update('lastName', event.target.value)
                }
              />
            </label>
            <label>
              E-mail
              <input value={user?.email ?? ''} disabled />
              <small>
                A troca de e-mail exige verificação e será adicionada depois.
              </small>
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="(11) 99999-9999"
              />
            </label>
          </div>
        </section>

        {error && <p className="status error">{error}</p>}
        {message && <p className="status success">{message}</p>}

        <div className="form-actions">
          <button className="send-button" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </div>
      </form>
    </main>
  );
}
