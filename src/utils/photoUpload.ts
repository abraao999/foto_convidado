import type { PhotoInfo } from '../types/photo';

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;

interface InitResponse {
  sessionToken: string;
  chunkSize: number;
}

interface ChunkResponse {
  complete: boolean;
  uploadedBytes?: number;
  totalSize?: number;
  photo?: PhotoInfo;
}

function mimeFromFileName(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return '';
}

async function readApiError(response: Response, fallback: string) {
  const raw = await response.text();
  try {
    const data = JSON.parse(raw) as { error?: string; message?: string };
    return data.error ?? data.message ?? fallback;
  } catch {
    if (response.status === 429) {
      return 'Muitos envios ao mesmo tempo. Aguarde um instante e tente novamente.';
    }
    return raw.trim() || fallback;
  }
}

async function uploadFileInChunks(
  file: File,
  initUrl: string,
  chunkUrl: string,
  credentials: RequestCredentials = 'include'
) {
  const mimeType = file.type || mimeFromFileName(file.name);
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    credentials,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType,
      size: file.size,
    }),
  });
  if (!initResponse.ok) {
    throw new Error(await readApiError(initResponse, 'Não foi possível iniciar o envio.'));
  }
  const initData = (await initResponse.json()) as InitResponse;

  const chunkSize = initData.chunkSize || DEFAULT_CHUNK_SIZE;
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const body = new FormData();
    body.append('sessionToken', initData.sessionToken);
    body.append('chunk', chunk, file.name);

    const chunkResponse = await fetch(chunkUrl, {
      method: 'POST',
      credentials,
      body,
    });
    if (!chunkResponse.ok) {
      throw new Error(await readApiError(chunkResponse, 'Falha ao enviar parte do arquivo.'));
    }
    const chunkData = (await chunkResponse.json()) as ChunkResponse;

    if (chunkData.complete && chunkData.photo) {
      return chunkData.photo;
    }

    offset += chunk.size;
  }

  throw new Error('O envio não foi concluído.');
}

export async function uploadGalleryPhoto(
  galleryId: string,
  file: File
): Promise<PhotoInfo> {
  return uploadFileInChunks(
    file,
    `/api/photos/gallery/${galleryId}/init`,
    '/api/photos/upload/chunk'
  );
}

export async function uploadPublicGalleryPhoto(
  slug: string,
  file: File
): Promise<PhotoInfo> {
  return uploadFileInChunks(
    file,
    `/api/public/galleries/${slug}/upload/init`,
    `/api/public/galleries/${slug}/upload/chunk`,
    'same-origin'
  );
}

export async function uploadGalleryPhotos(
  galleryId: string,
  files: File[]
): Promise<PhotoInfo[]> {
  const photos: PhotoInfo[] = [];
  for (const file of files) {
    photos.push(await uploadGalleryPhoto(galleryId, file));
  }
  return photos;
}

export async function uploadPublicGalleryPhotos(
  slug: string,
  files: File[]
): Promise<PhotoInfo[]> {
  const photos: PhotoInfo[] = [];
  for (const file of files) {
    photos.push(await uploadPublicGalleryPhoto(slug, file));
  }
  return photos;
}
