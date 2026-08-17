import app from './server/index.js';

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Servidor em http://localhost:${port}`));
