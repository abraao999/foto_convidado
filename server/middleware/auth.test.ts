import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionMatchesUser } from '../middleware/auth.js';
import type { IUserDocument } from '../models/User.js';
import { jwtExpiresInMs, type JwtPayload } from '../utils/jwt.js';

describe('sessionMatchesUser', () => {
  it('aceita token sem tv para usuário sem tokenVersion (legado)', () => {
    const user = {} as IUserDocument;
    const payload = { sub: '1', email: 'a@b.com', role: 'USER' } as JwtPayload;
    assert.equal(sessionMatchesUser(payload, user), true);
  });

  it('rejeita token antigo após bump de versão', () => {
    const user = { tokenVersion: 2 } as IUserDocument;
    const payload = { sub: '1', email: 'a@b.com', role: 'USER', tv: 1 } as JwtPayload;
    assert.equal(sessionMatchesUser(payload, user), false);
  });

  it('aceita token com a versão atual', () => {
    const user = { tokenVersion: 3 } as IUserDocument;
    const payload = { sub: '1', email: 'a@b.com', role: 'USER', tv: 3 } as JwtPayload;
    assert.equal(sessionMatchesUser(payload, user), true);
  });
});

describe('jwtExpiresInMs', () => {
  it('interpreta dias e horas', () => {
    const prev = process.env.JWT_EXPIRES_IN;
    process.env.JWT_EXPIRES_IN = '7d';
    assert.equal(jwtExpiresInMs(), 7 * 24 * 60 * 60 * 1000);
    process.env.JWT_EXPIRES_IN = '12h';
    assert.equal(jwtExpiresInMs(), 12 * 60 * 60 * 1000);
    if (prev === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = prev;
  });
});
