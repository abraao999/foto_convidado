import 'dotenv/config';
import './types/express.js';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.routes.js';
import galleriesRoutes from './routes/galleries.routes.js';
import legacyRoutes from './routes/legacy.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import profileRoutes from './routes/profile.routes.js';
import subscriptionsRoutes from './routes/subscriptions.routes.js';

const app = express();

// A Vercel encaminha o IP original por proxy. Necessário para que o
// express-rate-limit identifique corretamente cada cliente.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health check não depende do banco, permitindo diagnosticar a Function.
app.get('/api/health', (_request: Request, response: Response) =>
  response.json({ ok: true })
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
app.use('/api/galleries', galleriesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api', legacyRoutes);

app.use((error: Error, _request: Request, response: Response, _next: () => void) => {
  if (error.message.includes('File too large')) {
    return response.status(413).json({ error: 'Cada arquivo pode ter até 25 MB.' });
  }
  response.status(400).json({ error: 'Não foi possível processar a solicitação.' });
});

export default app;
