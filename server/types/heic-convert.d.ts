declare module 'heic-convert' {
  interface HeicConvertInput {
    buffer: ArrayBuffer | Buffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  export default function convert(
    input: HeicConvertInput
  ): Promise<ArrayBuffer>;
}
