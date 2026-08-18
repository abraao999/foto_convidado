import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSlug } from './profile.service.js';

test('normaliza nome de evento para slug público', () => {
  assert.equal(
    normalizeSlug('Casamento de João & Maria!'),
    'casamento-de-joao-maria'
  );
});

test('remove separadores inválidos das extremidades', () => {
  assert.equal(normalizeSlug('--- Festa da Olivia ---'), 'festa-da-olivia');
});
