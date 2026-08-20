import 'dotenv/config';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  const bucket = process.env.R2_BUCKET_NAME!;

  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'events/',
      MaxKeys: 100,
    })
  );

  console.log('--- Objetos no R2 (events/) ---');
  for (const obj of listed.Contents ?? []) {
    console.log(`${obj.Size}B\t${obj.Key}`);
  }
  if (!listed.Contents?.length) console.log('(vazio)');

  await mongoose.connect(process.env.MONGODB_URI!);
  const photos = await mongoose.connection.db!
    .collection('photos')
    .find({})
    .project({ fileName: 1, storageKey: 1, galleryId: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const r2Keys = new Set((listed.Contents ?? []).map((o) => o.Key));
  console.log('\n--- Fotos no Mongo (últimas 20) ---');
  for (const photo of photos) {
    const key = photo.storageKey as string | undefined;
    const label = !key ? 'NO_KEY' : r2Keys.has(key) ? 'OK' : 'MISSING_IN_R2';
    console.log(`${label}\t${photo._id}\t${photo.fileName}\t${key ?? '-'}`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
