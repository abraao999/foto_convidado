# FOTO_CONVIDADO — React + Node + MongoDB + Cloudflare R2

Plataforma de galerias de evento. Fotos, capas e avatares ficam no **Cloudflare R2**. O MongoDB guarda metadados, usuários, eventos e pagamentos.

## Variáveis de ambiente

Copie `.env.example` para `.env`.

### Cloudflare R2 (obrigatório)

1. No [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → crie um bucket **privado**.
2. Em **Manage R2 API Tokens**, crie um token com leitura/escrita.
3. Preencha:

```env
R2_ACCOUNT_ID=seu_account_id
R2_ACCESS_KEY_ID=sua_access_key
R2_SECRET_ACCESS_KEY=sua_secret_key
R2_BUCKET_NAME=seu_bucket
R2_ENDPOINT=https://seu_account_id.r2.cloudflarestorage.com
```

### MongoDB, auth e pagamentos

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
ADMIN_EMAIL=seu-email@exemplo.com
PUBLIC_URL=https://seu-dominio.com
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
RESEND_API_KEY=re_...
EMAIL_FROM=Foto Convidado <onboarding@resend.dev>
```

Pode remover variáveis `GOOGLE_*` — o app não usa mais Google Drive.

### E-mail (confirmação e recuperação)

1. Crie uma conta em [Resend](https://resend.com/) e gere uma API key.
2. Em desenvolvimento, sem `RESEND_API_KEY`, os links de confirmação/recuperação são impressos no **console do servidor**.
3. Em produção, `RESEND_API_KEY` é **obrigatória**. Use um domínio verificado no `EMAIL_FROM` (o endereço `onboarding@resend.dev` só serve para testes).
4. Fluxo: cadastro → e-mail de confirmação → só então o login é liberado. Recuperação de senha também vai por e-mail.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173` · API: `http://localhost:3001` · Health: `/api/health` · Ready: `/api/health/ready`

```bash
npm test
npm run test:r2
npm run build
```

## Estrutura no R2

```text
events/{galleryId}/photos/{uuid}.{ext}
events/{galleryId}/cover/{uuid}.{ext}
users/{userId}/avatar/{uuid}.{ext}
```

O bucket permanece privado. Visualização e download passam pelo backend autenticado.

## Deploy na Vercel (checklist)

1. Conecte o repositório e faça o deploy.
2. Cadastre no projeto **todas** as variáveis de `.env.example` (produção):
   - `NODE_ENV=production`
   - `PUBLIC_URL=https://seu-dominio.com` (sem barra final)
   - `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`
   - `RESEND_API_KEY`, `EMAIL_FROM` (domínio verificado no Resend)
   - `CRON_SECRET` (limpeza diária de mídia expirada)
   - `R2_*` (bucket **privado**)
   - `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`
   - `MERCADOPAGO_USE_SANDBOX=false` em produção
3. No Mercado Pago, aponte o webhook para `https://seu-dominio.com/api/payments/webhook`.
4. Confirme `/api/health` → `{ ok: true }` e `/api/health/ready` → `{ ok: true, configured: { ... } }` (em produção, 503 se faltar Mongo, JWT, R2, Mercado Pago, `PUBLIC_URL`, Resend ou `CRON_SECRET`).
5. Faça login com o e-mail de `ADMIN_EMAIL` (conta admin é criada já verificada) ou crie outro admin em **Administração**.
6. Não use o filesystem da Vercel para fotos — só R2.

Cookies de sessão usam `httpOnly` + `secure` em produção. O `maxAge` do cookie segue `JWT_EXPIRES_IN`.

A SPA envia `Content-Security-Policy` (scripts próprios, fontes Google, imagens do R2 e redirect do Mercado Pago). A API usa CSP `default-src 'none'`.

Nos logs da Vercel, filtre por `"event"`: `http_5xx`, `zip_built`, `zip_failed`, `webhook_ok`, `webhook_failed`, `webhook_rejected`, `cron_cleanup`. O cron também registra `photoCount` / `totalBytes` das fotos no Mongo (proxy do uso no R2).

## Expiração e fotos

1. Quando a assinatura vence, o acesso do dono some.
2. Por `PUBLIC_GALLERY_GRACE_DAYS` dias (padrão 30), a galeria ainda pode receber uploads de convidados.
3. Depois da carência, **fotos e capas** da conta são apagadas do Cloudflare R2 e do MongoDB (avatar de perfil permanece).
4. A limpeza **não depende de alguém abrir o site**: a Vercel chama `/api/internal/cleanup` todo dia às 09:00 UTC (`CRON_SECRET`).
5. Se um arquivo falhar no R2, o registro no Mongo permanece e o cron tenta de novo no dia seguinte.
6. O botão em **Administração → Resumo** dispara a mesma limpeza manualmente.
