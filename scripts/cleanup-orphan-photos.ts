import 'dotenv/config';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

/**
 * Remove do Mongo fotos com storageKey que não existem no R2.
 * Uso: npx tsx scripts/cleanup-orphan-photos.ts
 */
async function main() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

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
      Bucket: process.env.R2_BUCKET_NAME!,
      Prefix: 'events/',
      MaxKeys: 1000,
    })
  );
  const r2Keys = new Set((listed.Contents ?? []).map((obj) => obj.Key));

  await mongoose.connect(process.env.MONGODB_URI!);
  const photos = await mongoose.connection.db!
    .collection('photos')
    .find({ storageKey: { $type: 'string' } })
    .project({ storageKey: 1, fileName: 1 })
    .toArray();

  const orphans = photos.filter(
    (photo) => photo.storageKey && !r2Keys.has(photo.storageKey as string)
  );

  console.log(`Encontrados ${orphans.length} registro(s) órfão(s).`);
  for (const photo of orphans) {
    console.log(`- ${photo._id} ${photo.fileName} → ${photo.storageKey}`);
  }

  if (orphans.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const result = await mongoose.connection.db!.collection('photos').deleteMany({
    _id: { $in: orphans.map((photo) => photo._id) },
  });
  console.log(`Removidos do Mongo: ${result.deletedCount}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
