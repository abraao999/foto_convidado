export interface PhotoInfo {
  id: string;
  galleryId: string;
  fileName: string;
  thumbnailUrl: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface PhotoStats {
  count: number;
  totalBytes: number;
  maxStorageBytes: number;
  maxPhotoBytes: number;
}
