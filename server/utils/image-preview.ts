import sharp from 'sharp';

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_FILE_PATTERN = /\.heic$|\.heif$/i;

export function isHeicPhoto(mimeType: string, fileName: string) {
  return (
    HEIC_MIME_TYPES.has(mimeType.toLowerCase()) ||
    HEIC_FILE_PATTERN.test(fileName)
  );
}

export async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function convertWithHeicConvert(buffer: Buffer) {
  const convertModule = await import('heic-convert');
  const convert = convertModule.default ?? convertModule;
  const converted = await convert({
    buffer: new Uint8Array(buffer),
    format: 'JPEG',
    quality: 0.85,
  });
  return Buffer.from(converted);
}

export async function createWebpThumbnail(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}

export async function createHeicPreview(buffer: Buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (sharpError) {
    try {
      const converted = await convertWithHeicConvert(buffer);
      return sharp(converted)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (heicError) {
      console.error('Falha ao converter HEIC para prévia:', sharpError, heicError);
      throw new Error('Não foi possível gerar a prévia desta foto HEIC.');
    }
  }
}
