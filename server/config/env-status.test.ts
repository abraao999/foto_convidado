import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { SPA_CONTENT_SECURITY_POLICY } from './csp.js';
import { getEnvStatus, missingEnvKeys } from './env-status.js';

describe('getEnvStatus', () => {
  it('marca ausente quando a variável está vazia', () => {
    const prev = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '   ';
    assert.equal(getEnvStatus().jwt, false);
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  });

  it('lista só as chaves faltando', () => {
    assert.deepEqual(
      missingEnvKeys({
        mongo: true,
        jwt: true,
        r2: false,
        mercadopago: true,
        publicUrl: false,
        email: true,
        cron: true,
      }),
      ['r2', 'publicUrl']
    );
  });
});

describe('SPA CSP', () => {
  it('permite self, fontes Google e imagens do R2', () => {
    assert.match(SPA_CONTENT_SECURITY_POLICY, /default-src 'self'/);
    assert.match(SPA_CONTENT_SECURITY_POLICY, /fonts\.googleapis\.com/);
    assert.match(SPA_CONTENT_SECURITY_POLICY, /r2\.cloudflarestorage\.com/);
    assert.doesNotMatch(SPA_CONTENT_SECURITY_POLICY, /unsafe-eval/);
  });

  it('vercel.json usa a mesma política', () => {
    const vercelPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../vercel.json'
    );
    const vercel = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const csp = vercel.headers
      .flatMap((entry) => entry.headers)
      .find((header) => header.key === 'Content-Security-Policy');
    assert.equal(csp?.value, SPA_CONTENT_SECURITY_POLICY);
  });
});
