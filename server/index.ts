import 'dotenv/config';
import './types/express.js';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import galleriesRoutes from './routes/galleries.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import photosRoutes from './routes/photos.routes.js';
import profileRoutes from './routes/profile.routes.js';
import publicRoutes from './routes/public.routes.js';
import subscriptionsRoutes from './routes/subscriptions.routes.js';
import internalRoutes from './routes/internal.routes.js';

const app = express();

// A Vercel encaminha o IP original por proxy. Necessário para que o
// express-rate-limit identifique corretamente cada cliente.
app.set('trust proxy', 1);

app.use(
  helmet({
    // SPA + assets locais / Vite; CSP restritiva fica para um endurecimento futuro.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check não depende do banco, permitindo diagnosticar a Function.
app.get('/api/health', (_request: Request, response: Response) =>
  response.json({
    ok: true,
    env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  })
);

app.use(async (_request, response, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Falha ao conectar ao MongoDB:', error);
    response.status(503).json({ error: 'Serviço temporariamente indisponível.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/galleries', galleriesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/photos', photosRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/internal', internalRoutes);

app.use((error: Error, _request: Request, response: Response, _next: () => void) => {
  const code = 'code' in error ? String(error.code) : '';
  if (code === 'LIMIT_FILE_SIZE' || error.message.includes('File too large')) {
    return response.status(413).json({
      error: 'Cada foto pode ter até 25 MB. Tente enviar menos arquivos por vez.',
    });
  }
  console.error('Erro não tratado:', error);
  response.status(400).json({ error: 'Não foi possível processar a solicitação.' });
});

export default app;
