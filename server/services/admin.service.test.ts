import assert from 'node:assert/strict';
import test from 'node:test';
import { adminListPaging } from './admin.service.js';

test('paginação admin usa skip/limit seguros', () => {
  assert.deepEqual(adminListPaging(2, 40), { page: 2, limit: 40, skip: 40 });
  assert.equal(adminListPaging(0, 40).page, 1);
  assert.equal(adminListPaging(1, 999).limit, 80);
});
