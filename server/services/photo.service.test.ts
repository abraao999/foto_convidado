import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadPartKeys } from './r2.service.js';
import {
  hasValidImageSignature,
  photoListPaging,
  uniqueZipEntryNames,
  zipBudgetError,
  zipFileName,
  type PhotoUpload,
} from './photo.service.js';

function file(buffer: Buffer): PhotoUpload {
  return {
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    size: buffer.length,
    buffer,
  };
}

test('aceita assinaturas reais de JPEG, PNG e WebP', () => {
  assert.equal(
    hasValidImageSignature(file(Buffer.from([0xff, 0xd8, 0xff, 0x00]))),
    true
  );
  assert.equal(
    hasValidImageSignature(
      file(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ),
    true
  );
  assert.equal(
    hasValidImageSignature(file(Buffer.from('RIFF0000WEBP'))),
    true
  );
});

test('rejeita arquivo disfarçado apenas pelo MIME type', () => {
  assert.equal(hasValidImageSignature(file(Buffer.from('not-an-image'))), false);
});

test('gera nomes únicos para entradas do ZIP', () => {
  assert.deepEqual(uniqueZipEntryNames(['a.jpg', 'a.jpg', 'b.png']), [
    'a.jpg',
    'a-2.jpg',
    'b.png',
  ]);
});

test('rejeita ZIP acima do limite de fotos ou tamanho', () => {
  assert.equal(zipBudgetError(1, 1024), null);
  assert.match(zipBudgetError(999, 1) ?? '', /no máximo/);
  assert.match(zipBudgetError(1, 999 * 1024 * 1024 * 1024) ?? '', /grande demais/);
  assert.equal(zipFileName('Casamento Ana & João'), 'casamento-ana-joao-fotos.zip');
});

test('monta chaves temporárias de upload na ordem das partes', () => {
  assert.deepEqual(uploadPartKeys('abc', 3), [
    'tmp/uploads/abc/part-00001',
    'tmp/uploads/abc/part-00002',
    'tmp/uploads/abc/part-00003',
  ]);
});

test('paginação de fotos usa skip/limit seguros', () => {
  assert.deepEqual(photoListPaging(2, 15), { page: 2, limit: 15, skip: 15 });
  assert.equal(photoListPaging(0, 15).page, 1);
  assert.equal(photoListPaging(1, 999).limit, 50);
});
