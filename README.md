# Álbum de casamento — React + Node + TypeScript

Os convidados usam a página React; o servidor Node recebe os arquivos e os grava em uma pasta privada do seu Google Drive. A chave do Google nunca vai para o navegador.

## Configuração do Google Drive

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Drive API**.
2. Em **Google Auth Platform → Clients**, crie um cliente OAuth 2.0 do tipo **Aplicativo da Web**. Em URIs de redirecionamento autorizados, informe `http://localhost:3001/api/google-auth-callback`. Copie o **Client ID** (ele termina em `.apps.googleusercontent.com`) e o **Client secret** — não use API key nem o ID do projeto.
3. Em **Google Auth Platform → Audience**, mantenha o app como **Testing** e, em **Test users**, clique em **Add users**. Adicione o e-mail da conta que vai receber as fotos (por exemplo, `acscartorio@gmail.com`).
4. Crie a pasta que receberá as fotos no seu Drive e copie o ID dela (o trecho depois de `/folders/`).
5. Copie `.env.example` para `.env` e informe o ID da pasta, o Client ID e o Client Secret.

## Rodar localmente

```bash
npm install
npm run dev
```

6. Com o servidor rodando, abra `http://localhost:3001/api/google-auth`, entre na **sua conta Google** (incluída em Test users) e autorize. Copie o código mostrado para `GOOGLE_REFRESH_TOKEN` no `.env`, então reinicie o servidor.

Abra `http://localhost:5173`. Para produção, use `npm run build`; publique o frontend gerado em `dist` e execute o servidor com `npm start`, mantendo as variáveis de ambiente configuradas. No Google Cloud, adicione também `https://seu-dominio.com/api/google-auth-callback` à lista de redirecionamentos e defina `PUBLIC_URL=https://seu-dominio.com` antes de gerar o token.

Personalize os nomes, data e textos em `src/App.tsx`.

## Publicar na Vercel

O projeto já está preparado: a Vercel publica o frontend Vite e transforma as rotas dentro de `api/` em Functions Node.

1. Faça o deploy com `npx vercel` e escolha o diretório atual.
2. No painel da Vercel, em **Settings → Environment Variables**, cadastre `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e `PUBLIC_URL`. Use a URL final do projeto em `PUBLIC_URL` (por exemplo, `https://album-casamento.vercel.app`).
3. No Google Cloud, adicione `https://seu-dominio.vercel.app/api/google-auth-callback` aos redirecionamentos autorizados do cliente OAuth.
4. Gere novamente o refresh token em `https://seu-dominio.vercel.app/api/google-auth` e substitua `GOOGLE_REFRESH_TOKEN` na Vercel. Faça um novo deploy para aplicar a variável.

Para preservar uma URL permanente, conecte o projeto a um repositório Git ou adicione um domínio no painel da Vercel.

> Contas de serviço não têm quota de armazenamento no Drive. Este projeto usa OAuth para que os arquivos pertençam à sua conta e consumam o espaço dela. A [documentação do Google](https://developers.google.com/workspace/drive/api/guides/create-file) confirma esse comportamento.

> Em modo **Testing**, o Google limita o acesso aos e-mails adicionados como testadores e o refresh token pode expirar após 7 dias. Antes do casamento, em **Audience**, publique o app em produção e gere um novo `GOOGLE_REFRESH_TOKEN`. Como somente a sua conta autoriza o app, os convidados não precisam ter acesso ao OAuth.

> O limite por arquivo está definido em 25 MB no servidor. Para vídeos maiores, aumente `fileSize` em `server/index.ts` e use uma infraestrutura que suporte esse tamanho de envio.
