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
```

Pode remover variáveis `GOOGLE_*` — o app não usa mais Google Drive.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173` · API: `http://localhost:3001` · Health: `/api/health`

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
   - `R2_*` (bucket **privado**)
   - `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`
   - `MERCADOPAGO_USE_SANDBOX=false` em produção
3. No Mercado Pago, aponte o webhook para `https://seu-dominio.com/api/payments/webhook`.
4. Confirme `/api/health` respondendo `{ ok: true }`.
5. Faça login com o e-mail de `ADMIN_EMAIL` (ou crie outro admin em **Administração**).
6. Não use o filesystem da Vercel para fotos — só R2.

Cookies de sessão usam `httpOnly` + `secure` em produção.

## Expiração e fotos

1. Quando a assinatura vence, o acesso do dono some.
2. Por `PUBLIC_GALLERY_GRACE_DAYS` dias (padrão 30), a galeria ainda pode receber uploads de convidados.
3. Depois da carência, **fotos e capas** da conta são apagadas do Cloudflare R2 e do MongoDB (avatar de perfil permanece).
4. A limpeza roda automaticamente junto com a sincronização de assinaturas e também pode ser disparada em **Administração → Resumo**.
