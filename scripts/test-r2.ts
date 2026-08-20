import 'dotenv/config';
import {
  deleteFile,
  getObjectStream,
  uploadFile,
} from '../server/services/r2.service.js';

async function main() {
  const key = `tmp/r2-test/${Date.now()}.txt`;
  const payload = Buffer.from(`r2-ok-${Date.now()}`, 'utf8');

  console.log('Bucket:', process.env.R2_BUCKET_NAME);
  console.log('Endpoint:', process.env.R2_ENDPOINT);
  console.log('Enviando:', key);

  await uploadFile({
    storageKey: key,
    buffer: payload,
    mimeType: 'text/plain',
  });

  const read = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of read.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  console.log('Lido de volta:', text);

  await deleteFile(key);
  console.log('Teste R2 OK. Pode enviar fotos pelo app.');
}

main().catch((error) => {
  console.error('Teste R2 falhou:', error);
  process.exit(1);
});
