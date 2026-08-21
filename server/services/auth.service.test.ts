import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEmailVerified } from './auth.service.js';
import type { IUserDocument } from '../models/User.js';

function fakeUser(emailVerifiedAt: Date | null | undefined): IUserDocument {
  return { emailVerifiedAt } as IUserDocument;
}

describe('isEmailVerified', () => {
  it('trata null como não verificado', () => {
    assert.equal(isEmailVerified(fakeUser(null)), false);
  });

  it('trata Date como verificado', () => {
    assert.equal(isEmailVerified(fakeUser(new Date())), true);
  });

  it('trata contas antigas sem o campo como verificadas', () => {
    assert.equal(isEmailVerified(fakeUser(undefined)), true);
  });
});
