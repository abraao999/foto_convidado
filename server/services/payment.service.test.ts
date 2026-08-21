import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapMercadoPagoStatus,
  resolveRefundAction,
} from './payment.service.js';

test('mapeia status oficiais do Mercado Pago', () => {
  assert.equal(mapMercadoPagoStatus('approved'), 'APPROVED');
  assert.equal(mapMercadoPagoStatus('rejected'), 'REJECTED');
  assert.equal(mapMercadoPagoStatus('cancelled'), 'CANCELED');
  assert.equal(mapMercadoPagoStatus('refunded'), 'REFUNDED');
  assert.equal(mapMercadoPagoStatus('charged_back'), 'REFUNDED');
  assert.equal(mapMercadoPagoStatus('in_process'), 'PENDING');
});

test('webhook duplicado de aprovado não gera nova ação se já houver accessGrantedAt', () => {
  assert.equal(
    resolveRefundAction({ amountCents: 5000, refundedCents: 0, providerStatus: 'approved' }),
    'none'
  );
});

test('reembolso total e chargeback revogam acesso', () => {
  assert.equal(
    resolveRefundAction({
      amountCents: 5000,
      refundedCents: 5000,
      providerStatus: 'approved',
    }),
    'full'
  );
  assert.equal(
    resolveRefundAction({
      amountCents: 5000,
      refundedCents: 0,
      providerStatus: 'refunded',
    }),
    'full'
  );
  assert.equal(
    resolveRefundAction({
      amountCents: 5000,
      refundedCents: 1000,
      providerStatus: 'charged_back',
    }),
    'full'
  );
});

test('reembolso parcial mantém a assinatura', () => {
  assert.equal(
    resolveRefundAction({
      amountCents: 5000,
      refundedCents: 1000,
      providerStatus: 'approved',
    }),
    'partial'
  );
});
