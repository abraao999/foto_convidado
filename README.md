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

### MongoDB e demais

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
```

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173` · API: `http://localhost:3001`

Teste rápido do R2:

```bash
npm run test:r2
```

## Estrutura no R2

```text
events/{galleryId}/photos/{uuid}.{ext}
events/{galleryId}/cover/{uuid}.{ext}
users/{userId}/avatar/{uuid}.{ext}
```

O bucket permanece privado. Visualização e download passam pelo backend autenticado.

## Vercel

Cadastre as variáveis `R2_*`, `MONGODB_URI`, `JWT_SECRET` e Mercado Pago. Não use o filesystem da Vercel para guardar fotos.

## Migração (histórico)

Fotos antigas do Google Drive foram migradas com:

```bash
npx tsx scripts/migrate-drive-to-r2.ts
```

O Google Drive **não** é mais usado pelo app. Arquivos antigos no Drive não são apagados automaticamente.
