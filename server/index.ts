import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.routes.js';
import legacyRoutes from './routes/legacy.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import subscriptionsRoutes from './routes/subscriptions.routes.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(async (_request, response, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Falha ao conectar ao MongoDB:', error);
    response.status(503).json({ error: 'Serviço temporariamente indisponível.' });
  }
});

app.get('/api/health', (_request: Request, response: Response) => response.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api', legacyRoutes);

app.use((error: Error, _request: Request, response: Response, _next: () => void) => {
  if (error.message.includes('File too large')) {
    return response.status(413).json({ error: 'Cada arquivo pode ter até 25 MB.' });
  }
  response.status(400).json({ error: 'Não foi possível processar a solicitação.' });
});

export default app;
