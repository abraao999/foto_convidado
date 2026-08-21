import { Types } from 'mongoose';
import { GiftItem, type IGiftItemDocument } from '../models/GiftItem.js';
import { findOwnedGallery } from './gallery.service.js';
import { guestForPublicToken } from './guest.service.js';
import {
  canPurchaseGift,
  giftStatusFromCounts,
  remainingGiftUnits,
} from './planning.helpers.js';
import { searchProducts } from './product-search/index.js';
import type { ProductOffer } from './product-search/types.js';

export interface GiftInput {
  name: string;
  description?: string;
  category?: string;
  desiredQuantity?: number;
  imageUrl?: string;
  productUrl?: string;
  priceCents?: number;
  store?: string;
  notes?: string;
}

function syncGiftStatus(gift: IGiftItemDocument) {
  gift.status = giftStatusFromCounts(
    gift.desiredQuantity,
    gift.purchasedQuantity,
    gift.reservedQuantity
  );
}

function applyBestOffer(gift: IGiftItemDocument, offers: ProductOffer[]) {
  gift.offers = offers;
  gift.priceUpdatedAt = new Date();
  const best = offers[0];
  if (!best) return;
  if (gift.priceCents != null && gift.priceCents !== best.priceCents) {
    gift.previousPriceCents = gift.priceCents;
  }
  gift.priceCents = best.priceCents;
  gift.store = best.store;
  gift.productUrl = gift.productUrl || best.url;
  gift.imageUrl = gift.imageUrl || best.imageUrl;
}

export function serializeGift(
  gift: IGiftItemDocument,
  visibility: 'owner' | 'public' = 'owner'
) {
  const remaining = remainingGiftUnits(
    gift.desiredQuantity,
    gift.purchasedQuantity,
    gift.reservedQuantity
  );
  return {
    id: gift._id.toString(),
    galleryId: gift.galleryId.toString(),
    name: gift.name,
    description: gift.description,
    category: gift.category,
    desiredQuantity: gift.desiredQuantity,
    purchasedQuantity: gift.purchasedQuantity,
    reservedQuantity:
      visibility === 'owner' ? gift.reservedQuantity : undefined,
    remainingQuantity: remaining,
    imageUrl: gift.imageUrl,
    productUrl: gift.productUrl,
    priceCents: gift.priceCents,
    previousPriceCents: gift.previousPriceCents,
    store: gift.store,
    priceUpdatedAt: gift.priceUpdatedAt,
    status: gift.status,
    notes: visibility === 'owner' ? gift.notes : undefined,
    offers: gift.offers,
    createdAt: gift.createdAt,
    updatedAt: gift.updatedAt,
  };
}

async function ownedGallery(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser editada.');
  }
  return gallery;
}

export async function listGifts(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  const gifts = await GiftItem.find({
    galleryId: gallery._id,
    userId: gallery.userId,
  }).sort({ createdAt: -1 });
  return gifts.map((gift) => serializeGift(gift, 'owner'));
}

export async function createGift(
  userId: string,
  galleryId: string,
  input: GiftInput
) {
  const gallery = await ownedGallery(userId, galleryId);
  const gift = await GiftItem.create({
    galleryId: gallery._id,
    userId: gallery.userId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    category: input.category?.trim() || undefined,
    desiredQuantity: Math.max(1, Math.floor(input.desiredQuantity ?? 1)),
    imageUrl: input.imageUrl?.trim() || undefined,
    productUrl: input.productUrl?.trim() || undefined,
    priceCents: input.priceCents,
    store: input.store?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: 'AVAILABLE',
  });
  return serializeGift(gift, 'owner');
}

export async function updateGift(
  userId: string,
  galleryId: string,
  giftId: string,
  input: GiftInput
) {
  const gallery = await ownedGallery(userId, galleryId);
  if (!Types.ObjectId.isValid(giftId)) {
    throw new Error('Presente não encontrado.');
  }
  const gift = await GiftItem.findOne({
    _id: giftId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!gift) throw new Error('Presente não encontrado.');
  gift.name = input.name.trim();
  gift.description = input.description?.trim() || undefined;
  gift.category = input.category?.trim() || undefined;
  gift.desiredQuantity = Math.max(1, Math.floor(input.desiredQuantity ?? 1));
  gift.imageUrl = input.imageUrl?.trim() || undefined;
  gift.productUrl = input.productUrl?.trim() || undefined;
  if (typeof input.priceCents === 'number') gift.priceCents = input.priceCents;
  gift.store = input.store?.trim() || undefined;
  gift.notes = input.notes?.trim() || undefined;
  if (gift.purchasedQuantity > gift.desiredQuantity) {
    gift.purchasedQuantity = gift.desiredQuantity;
  }
  syncGiftStatus(gift);
  await gift.save();
  return serializeGift(gift, 'owner');
}

export async function deleteGift(
  userId: string,
  galleryId: string,
  giftId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  const deleted = await GiftItem.findOneAndDelete({
    _id: giftId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!deleted) throw new Error('Presente não encontrado.');
  return { message: 'Presente excluído.' };
}

export async function searchGiftOffers(
  userId: string,
  galleryId: string,
  query: string
) {
  await findOwnedGallery(userId, galleryId);
  return searchProducts(query);
}

export async function refreshGiftPrice(
  userId: string,
  galleryId: string,
  giftId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  const gift = await GiftItem.findOne({
    _id: giftId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!gift) throw new Error('Presente não encontrado.');
  const result = await searchProducts(gift.name);
  applyBestOffer(gift, result.offers);
  await gift.save();
  return serializeGift(gift, 'owner');
}

export async function applyOfferToGift(
  userId: string,
  galleryId: string,
  giftId: string,
  offer: ProductOffer
) {
  const gallery = await ownedGallery(userId, galleryId);
  const gift = await GiftItem.findOne({
    _id: giftId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!gift) throw new Error('Presente não encontrado.');
  if (!offer.url || !offer.store || typeof offer.priceCents !== 'number') {
    throw new Error('Oferta inválida.');
  }
  applyBestOffer(gift, [offer, ...gift.offers.filter((item) => item.url !== offer.url)]);
  await gift.save();
  return serializeGift(gift, 'owner');
}

export async function listPublicGifts(token: string) {
  const guest = await guestForPublicToken(token);
  const gifts = await GiftItem.find({ galleryId: guest.galleryId }).sort({
    createdAt: -1,
  });
  return gifts.map((gift) => serializeGift(gift, 'public'));
}

export async function purchasePublicGift(token: string, giftId: string) {
  const guest = await guestForPublicToken(token);
  if (!Types.ObjectId.isValid(giftId)) {
    throw new Error('Presente não encontrado.');
  }
  const current = await GiftItem.findOne({
    _id: giftId,
    galleryId: guest.galleryId,
  });
  if (!current) throw new Error('Presente não encontrado.');
  if (!canPurchaseGift(current.desiredQuantity, current.purchasedQuantity)) {
    throw new Error('Este presente acabou de ser escolhido por outra pessoa.');
  }

  const updated = await GiftItem.findOneAndUpdate(
    {
      _id: current._id,
      galleryId: guest.galleryId,
      $expr: { $lt: ['$purchasedQuantity', '$desiredQuantity'] },
    },
    { $inc: { purchasedQuantity: 1 } },
    { new: true }
  );
  if (!updated) {
    throw new Error('Este presente acabou de ser escolhido por outra pessoa.');
  }
  if (updated.reservedQuantity > 0) {
    updated.reservedQuantity = Math.max(0, updated.reservedQuantity - 1);
  }
  syncGiftStatus(updated);
  await updated.save();
  return {
    gift: serializeGift(updated, 'public'),
    message: 'Este presente foi marcado como comprado.',
  };
}
