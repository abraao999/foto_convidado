import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRsvp,
  canAssignToTable,
  canPurchaseGift,
  clampCompanions,
  giftStatusFromCounts,
  guestMongoFilter,
  invitePublicUrl,
  matchesGuestFilter,
  normalizeChildren,
  partySize,
  remainingGiftUnits,
  summarizeGuests,
  tableFill,
} from './planning.helpers.js';
import { mapMercadoLivreResults } from './product-search/mercadolivre.js';

test('criar/editar convidado: acompanhantes não ultrapassam o máximo', () => {
  assert.equal(clampCompanions(5, 2), 2);
  assert.equal(clampCompanions(-1, 3), 0);
  assert.equal(clampCompanions(1.9, 4), 1);
});

test('confirmar presença contabiliza acompanhantes até o máximo', () => {
  const yes = applyRsvp({
    attending: true,
    companionCount: 5,
    maxCompanions: 2,
  });
  assert.equal(yes.inviteStatus, 'CONFIRMED');
  assert.equal(yes.attendanceStatus, 'CONFIRMED');
  assert.equal(yes.confirmedCompanionCount, 2);
  assert.equal(partySize(yes), 3);
});

test('crianças no RSVP entram no tamanho do grupo e somem se recusar', () => {
  const kids = normalizeChildren({
    attending: true,
    bringingChildren: true,
    childCount: 2,
    childAges: [3, 7, 99],
  });
  assert.equal(kids.bringingChildren, true);
  assert.equal(kids.childCount, 2);
  assert.deepEqual(kids.childAges, [3, 7]);
  assert.equal(
    partySize({
      attendanceStatus: 'CONFIRMED',
      confirmedCompanionCount: 1,
      childCount: kids.childCount,
    }),
    4
  );
  assert.deepEqual(
    normalizeChildren({ attending: false, bringingChildren: true, childCount: 2 }),
    { bringingChildren: false, childCount: 0, childAges: [] }
  );
});

test('recusar presença zera acompanhantes e não ocupa mesa', () => {
  const no = applyRsvp({ attending: false, companionCount: 2, maxCompanions: 2 });
  assert.equal(no.inviteStatus, 'DECLINED');
  assert.equal(no.attendanceStatus, 'DECLINED');
  assert.equal(no.confirmedCompanionCount, 0);
  assert.equal(partySize(no), 0);
});

test('filtros de convite não misturam presença com envio', () => {
  const sent = { inviteStatus: 'SENT' as const, attendanceStatus: 'UNANSWERED' as const };
  const confirmed = {
    inviteStatus: 'CONFIRMED' as const,
    attendanceStatus: 'CONFIRMED' as const,
  };
  assert.equal(matchesGuestFilter(sent, 'no_response'), true);
  assert.equal(matchesGuestFilter(sent, 'pending'), false);
  assert.equal(matchesGuestFilter(confirmed, 'confirmed'), true);
  assert.deepEqual(guestMongoFilter('confirmed'), { attendanceStatus: 'CONFIRMED' });
});

test('contadores de convidados e pessoas esperadas', () => {
  const stats = summarizeGuests([
    {
      maxCompanions: 2,
      confirmedCompanionCount: 2,
      attendanceStatus: 'CONFIRMED',
      inviteStatus: 'CONFIRMED',
    },
    {
      maxCompanions: 1,
      confirmedCompanionCount: 0,
      attendanceStatus: 'DECLINED',
      inviteStatus: 'DECLINED',
    },
    {
      maxCompanions: 0,
      confirmedCompanionCount: 0,
      attendanceStatus: 'UNANSWERED',
      inviteStatus: 'PENDING',
    },
    {
      maxCompanions: 0,
      confirmedCompanionCount: 0,
      attendanceStatus: 'UNANSWERED',
      inviteStatus: 'VIEWED',
    },
  ]);
  assert.equal(stats.total, 4);
  assert.equal(stats.confirmed, 1);
  assert.equal(stats.declined, 1);
  assert.equal(stats.pending, 1);
  assert.equal(stats.noResponse, 1);
  assert.equal(stats.confirmedCompanions, 2);
  assert.equal(stats.confirmedPeople, 3);
});

test('quantidade de presente e compra duplicada', () => {
  assert.equal(remainingGiftUnits(3, 1, 0), 2);
  assert.equal(canPurchaseGift(3, 2), true);
  assert.equal(canPurchaseGift(3, 3), false);
  assert.equal(giftStatusFromCounts(3, 3, 0), 'PURCHASED');
  assert.equal(giftStatusFromCounts(3, 1, 1), 'RESERVED');
  assert.equal(giftStatusFromCounts(3, 0, 0), 'AVAILABLE');
});

test('capacidade da mesa considera acompanhantes', () => {
  assert.equal(tableFill(8, 0), 'available');
  assert.equal(tableFill(8, 5), 'partial');
  assert.equal(tableFill(8, 8), 'full');
  assert.equal(canAssignToTable(8, 8, 1).ok, false);
  const overflow = canAssignToTable(8, 6, 3);
  assert.equal(overflow.ok, false);
  if (!overflow.ok) {
    assert.match(overflow.reason, /acompanhantes/);
  }
  assert.equal(canAssignToTable(8, 5, 3).ok, true);
  assert.equal(canAssignToTable(8, 0, 0).ok, false);
});

test('token do convite usa caminho público sem expor id de banco', () => {
  const url = invitePublicUrl('casamento-ana', 'a'.repeat(64));
  assert.match(url, /\/evento\/casamento-ana\/convite\//);
  assert.doesNotMatch(url, /ObjectId|mongodb/i);
});

test('pesquisa Mercado Livre só mapeia ofertas reais', () => {
  const offers = mapMercadoLivreResults([
    {
      title: 'Air Fryer Mondial 5L',
      price: 399.9,
      original_price: 499.9,
      permalink: 'https://produto.mercadolivre.com.br/MLB-123',
      thumbnail: 'http://http2.mlstatic.com/foto.jpg',
    },
    { title: 'sem link', price: 10 },
    { title: 'preço inventável', permalink: 'https://x.com', price: 'gratis' },
  ]);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.store, 'Mercado Livre');
  assert.equal(offers[0]?.priceCents, 39990);
  assert.equal(offers[0]?.previousPriceCents, 49990);
  assert.equal(offers[0]?.imageUrl, 'https://http2.mlstatic.com/foto.jpg');
  assert.equal(offers[0]?.url, 'https://produto.mercadolivre.com.br/MLB-123');
});
