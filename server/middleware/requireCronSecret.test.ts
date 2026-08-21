import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import {
  isAuthorizedCronRequest,
  secretsMatch,
} from './requireCronSecret.js';
import { isMissingR2Object } from '../services/r2.service.js';

describe('cron secret', () => {
  it('compara secrets em tempo constante e rejeita tamanho diferente', () => {
    assert.equal(secretsMatch('abc', 'abc'), true);
    assert.equal(secretsMatch('abc', 'abd'), false);
    assert.equal(secretsMatch('abc', 'ab'), false);
  });

  it('aceita Bearer ou x-cron-secret', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'job-secret';
    const bearerReq = {
      headers: { authorization: 'Bearer job-secret' },
    } as unknown as Request;
    const headerReq = {
      headers: { 'x-cron-secret': 'job-secret' },
    } as unknown as Request;
    const badReq = {
      headers: { authorization: 'Bearer other' },
    } as unknown as Request;
    assert.equal(isAuthorizedCronRequest(bearerReq), true);
    assert.equal(isAuthorizedCronRequest(headerReq), true);
    assert.equal(isAuthorizedCronRequest(badReq), false);
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });
});

describe('isMissingR2Object', () => {
  it('trata objeto já inexistente como sucesso', () => {
    assert.equal(isMissingR2Object({ Code: 'NoSuchKey' }), true);
    assert.equal(isMissingR2Object({ name: 'NotFound' }), true);
    assert.equal(isMissingR2Object({ $metadata: { httpStatusCode: 404 } }), true);
    assert.equal(isMissingR2Object({ Code: 'AccessDenied' }), false);
  });
});
