export type GalleryStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface GalleryInfo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  slug: string;
  coverPhoto?: string;
  eventDate?: string;
  location?: string;
  status: GalleryStatus;
  createdAt: string;
  updatedAt: string;
}

export const galleryStatusLabel: Record<GalleryStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Arquivada',
};
