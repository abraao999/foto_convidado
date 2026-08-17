import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccessOffer,
  getSubscriptionAlert,
} from './subscription.service.js';

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
  assert.match(alert?.message ?? '', /pagamento/i);
});

test('alertas ficam mais urgentes perto do vencimento', () => {
  assert.equal(getSubscriptionAlert(30, 'ACTIVE')?.level, 'info');
  assert.equal(getSubscriptionAlert(7, 'ACTIVE')?.level, 'warning');
  assert.equal(getSubscriptionAlert(3, 'ACTIVE')?.level, 'critical');
  assert.equal(getSubscriptionAlert(1, 'ACTIVE')?.level, 'critical');
});
