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

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

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

function reportProgress(
  onProgress: UploadProgressHandler | undefined,
  loaded: number,
  total: number
) {
  if (!onProgress) return;
  const safeTotal = total > 0 ? total : 1;
  onProgress({
    loaded: Math.min(loaded, safeTotal),
    total: safeTotal,
    percent: Math.min(100, Math.round((loaded / safeTotal) * 100)),
  });
}

async function uploadFileInChunks(
  file: File,
  initUrl: string,
  chunkUrl: string,
  credentials: RequestCredentials = 'include',
  onFileProgress?: (loaded: number, total: number) => void
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
  onFileProgress?.(0, file.size);

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

    offset += chunk.size;
    onFileProgress?.(Math.min(offset, file.size), file.size);

    if (chunkData.complete && chunkData.photo) {
      return chunkData.photo;
    }
  }

  throw new Error('O envio não foi concluído.');
}

async function uploadFilesSequentially(
  files: File[],
  uploadOne: (
    file: File,
    onFileProgress?: (loaded: number, total: number) => void
  ) => Promise<PhotoInfo>,
  onProgress?: UploadProgressHandler
) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;
  const photos: PhotoInfo[] = [];

  reportProgress(onProgress, 0, total);

  for (const file of files) {
    const photo = await uploadOne(file, (loaded) => {
      reportProgress(onProgress, completedBytes + loaded, total);
    });
    completedBytes += file.size;
    reportProgress(onProgress, completedBytes, total);
    photos.push(photo);
  }

  return photos;
}

export async function uploadGalleryPhoto(
  galleryId: string,
  file: File,
  onFileProgress?: (loaded: number, total: number) => void
): Promise<PhotoInfo> {
  return uploadFileInChunks(
    file,
    `/api/photos/gallery/${galleryId}/init`,
    '/api/photos/upload/chunk',
    'include',
    onFileProgress
  );
}

export async function uploadPublicGalleryPhoto(
  slug: string,
  file: File,
  onFileProgress?: (loaded: number, total: number) => void
): Promise<PhotoInfo> {
  return uploadFileInChunks(
    file,
    `/api/public/galleries/${slug}/upload/init`,
    `/api/public/galleries/${slug}/upload/chunk`,
    'same-origin',
    onFileProgress
  );
}

export async function uploadGalleryPhotos(
  galleryId: string,
  files: File[],
  onProgress?: UploadProgressHandler
): Promise<PhotoInfo[]> {
  return uploadFilesSequentially(
    files,
    (file, onFileProgress) => uploadGalleryPhoto(galleryId, file, onFileProgress),
    onProgress
  );
}

export async function uploadPublicGalleryPhotos(
  slug: string,
  files: File[],
  onProgress?: UploadProgressHandler
): Promise<PhotoInfo[]> {
  return uploadFilesSequentially(
    files,
    (file, onFileProgress) => uploadPublicGalleryPhoto(slug, file, onFileProgress),
    onProgress
  );
}
