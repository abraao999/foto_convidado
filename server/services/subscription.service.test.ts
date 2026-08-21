import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccessOffer,
  getSubscriptionAlert,
} from './subscription.service.js';
import {
  daysUntilMediaPurge,
  isPastMediaGrace,
} from './media-cleanup.service.js';

test('produto de acesso possui preço e duração configurados', () => {
  const offer = getAccessOffer();

  assert.ok(offer.priceCents > 0);
  assert.ok(offer.durationDays > 0);
  assert.ok(offer.maxGalleries > 0);
  assert.ok(offer.maxStorageBytes > 0);
});

test('acesso expirado produz alerta de renovação', () => {
  const alert = getSubscriptionAlert(null, 'EXPIRED');

  assert.equal(alert?.level, 'expired');
  assert.match(alert?.message ?? '', /pagamento|fotos/i);
});

test('alerta expirado avisa sobre remoção de fotos na carência', () => {
  const alert = getSubscriptionAlert(null, 'EXPIRED', {
    daysUntilMediaPurge: 12,
  });
  assert.match(alert?.message ?? '', /12/);
  assert.match(alert?.message ?? '', /baixar/i);
});

test('alerta expirado após carência confirma remoção', () => {
  const alert = getSubscriptionAlert(null, 'EXPIRED', {
    daysUntilMediaPurge: 0,
  });
  assert.match(alert?.message ?? '', /removidas/i);
});

test('alertas ficam mais urgentes perto do vencimento', () => {
  assert.equal(getSubscriptionAlert(30, 'ACTIVE')?.level, 'info');
  assert.equal(getSubscriptionAlert(7, 'ACTIVE')?.level, 'warning');
  assert.equal(getSubscriptionAlert(3, 'ACTIVE')?.level, 'critical');
  assert.equal(getSubscriptionAlert(1, 'ACTIVE')?.level, 'critical');
});

test('carência de mídia calcula dias até a limpeza', () => {
  const expiresAt = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-01-10T00:00:00.000Z');
  const days = daysUntilMediaPurge(expiresAt, now);
  assert.ok(days > 0);
  assert.equal(isPastMediaGrace(expiresAt, now), false);

  const afterGrace = new Date('2026-03-01T00:00:00.000Z');
  assert.equal(isPastMediaGrace(expiresAt, afterGrace), true);
});
