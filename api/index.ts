import app from '../server/index.js';

// Entrada única da Vercel. O vercel.json encaminha todas as rotas /api/*
// para esta Function, preservando o caminho original para o Express.
export default app;
