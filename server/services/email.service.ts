type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function emailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    'Foto Convidado <onboarding@resend.dev>'
  );
}

function resendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

/** Em desenvolvimento sem API key, apenas registra no console. Em produção, exige RESEND_API_KEY. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = resendApiKey();

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'RESEND_API_KEY não configurada. Não é possível enviar e-mails em produção.'
      );
    }
    console.info('[email] (dev) Para:', input.to);
    console.info('[email] Assunto:', input.subject);
    console.info('[email] Texto:\n', input.text);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Falha ao enviar e-mail via Resend:', response.status, detail);
    throw new Error('Não foi possível enviar o e-mail. Tente novamente em instantes.');
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const subject = 'Redefinir sua senha';
  const text = [
    'Recebemos um pedido para redefinir a senha da sua conta.',
    '',
    `Abra este link (válido por 1 hora):`,
    resetUrl,
    '',
    'Se você não solicitou isso, ignore este e-mail.',
  ].join('\n');

  const html = `
    <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
    <p><a href="${resetUrl}">Redefinir senha</a></p>
    <p>O link é válido por 1 hora. Se você não solicitou isso, ignore este e-mail.</p>
  `.trim();

  await sendEmail({ to, subject, text, html });
}

export async function sendEmailVerificationEmail(to: string, verifyUrl: string, name: string) {
  const subject = 'Confirme seu e-mail';
  const text = [
    `Olá, ${name}!`,
    '',
    'Confirme seu e-mail para ativar sua conta:',
    verifyUrl,
    '',
    'O link é válido por 24 horas.',
  ].join('\n');

  const html = `
    <p>Olá, ${name}!</p>
    <p>Confirme seu e-mail para ativar sua conta:</p>
    <p><a href="${verifyUrl}">Confirmar e-mail</a></p>
    <p>O link é válido por 24 horas.</p>
  `.trim();

  await sendEmail({ to, subject, text, html });
}
