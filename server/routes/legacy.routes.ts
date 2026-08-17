import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'node:stream';

/**
 * Rotas legadas preservadas da versão single-evento (pré-SaaS).
 * Serão substituídas na Etapa 6 por upload autenticado por galeria.
 * Mantidas para não quebrar o fluxo atual de convidados (/enviar).
 */
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) =>
    callback(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')),
});

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('A autenticação do Google ainda não está configurada no servidor.');
  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3001';
  return new google.auth.OAuth2(clientId, clientSecret, `${publicUrl}/api/google-auth-callback`);
}

function driveClient() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!folderId || !refreshToken) throw new Error('O Google Drive ainda não está configurado no servidor.');
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return { drive: google.drive({ version: 'v3', auth }), folderId };
}

router.get('/google-auth', (_request: Request, response: Response) => {
  try {
    const auth = oauthClient();
    response.redirect(
      auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive'],
      })
    );
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : 'Erro de configuração.');
  }
});

router.get('/google-auth-callback', async (request: Request, response: Response) => {
  const code = typeof request.query.code === 'string' ? request.query.code : undefined;
  if (!code) return response.status(400).send('A autorização foi cancelada ou não retornou um código.');
  try {
    const auth = oauthClient();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('O Google não retornou um refresh token. Tente novamente.');
    response
      .type('html')
      .send(
        `<main style="font-family:system-ui;max-width:700px;margin:48px auto;line-height:1.5"><h1>Conta conectada</h1><p>Copie este valor para a variável <code>GOOGLE_REFRESH_TOKEN</code> do seu arquivo <code>.env</code> e reinicie o servidor. Não compartilhe este código.</p><pre style="white-space:pre-wrap;padding:16px;background:#f3f3f3;word-break:break-all">${tokens.refresh_token}</pre><p>Depois, esta página pode ser fechada.</p></main>`
      );
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : 'Não foi possível concluir a autorização.');
  }
});

router.post('/photos', upload.array('photos', 10), async (request: Request, response: Response) => {
  const files = request.files as Express.Multer.File[] | undefined;
  if (!files?.length) return response.status(400).json({ error: 'Escolha pelo menos uma foto ou vídeo.' });
  try {
    const { drive, folderId } = driveClient();
    await Promise.all(
      files.map((file) =>
        drive.files.create({
          requestBody: { name: file.originalname, parents: [folderId] },
          media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
          fields: 'id',
        })
      )
    );
    response.status(201).json({ ok: true, count: files.length });
  } catch (error) {
    console.error('Falha no upload:', error);
    response.status(500).json({ error: 'Não conseguimos enviar os arquivos agora. Tente novamente.' });
  }
});

export default router;
