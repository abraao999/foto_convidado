import type { Readable } from 'node:stream';
import { getObjectStream, isR2StorageKey } from './r2.service.js';

/**
 * Lê arquivos do Cloudflare R2.
 */
export async function openStoredFile(storageRef: string): Promise<{
  stream: Readable;
  mimeType: string;
}> {
  if (!isR2StorageKey(storageRef)) {
    throw new Error('Referência de armazenamento inválida. Esperava uma chave do R2.');
  }
  const file = await getObjectStream(storageRef);
  return { stream: file.stream, mimeType: file.mimeType };
}
