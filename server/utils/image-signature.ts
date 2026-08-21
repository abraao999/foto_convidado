export interface ImageSignatureInput {
  buffer: Buffer;
}

export function hasValidImageSignature(file: ImageSignatureInput) {
  const bytes = file.buffer;
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const heicBrand =
    bytes.length >= 12 ? bytes.subarray(8, 12).toString('ascii') : '';
  const isHeic =
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(heicBrand);
  return isJpeg || isPng || isWebp || isHeic;
}
