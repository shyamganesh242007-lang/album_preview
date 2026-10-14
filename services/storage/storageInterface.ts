import { Album, AlbumPage, AlbumStatus, Correction, AlbumSourceType } from '@/types/album';

export interface UploadPagePreviewParams {
  albumId: string;
  pageId: string;
  blobId?: string;
  previewBlob: Blob;
  previewWidth: number;
  previewHeight: number;
  filename?: string;
}

export interface UploadPagePreviewResult {
  previewStoragePath: string;
  previewUrl: string;
  previewSizeBytes: number;
  previewWidth: number;
  previewHeight: number;
}

export interface AlbumStorage {
  createAlbum(album: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album>;
  getAlbum(id: string): Promise<Album | null>;
  getAlbums(): Promise<Album[]>;
  updateAlbum(id: string, updates: Partial<Album>): Promise<Album>;
  replaceAlbumPages(albumId: string, newPages: AlbumPage[], sourceType?: AlbumSourceType): Promise<Album>;
  deleteAlbum(id: string): Promise<void>;

  savePageBlob(blobId: string, blob: Blob): Promise<void>;
  getPageBlob(blobId: string): Promise<Blob | null>;
  deletePageBlob(blobId: string): Promise<void>;

  // WebP-only preview upload
  uploadPagePreview(params: UploadPagePreviewParams): Promise<UploadPagePreviewResult>;

  updateCorrections(albumId: string, corrections: Correction[]): Promise<void>;
  updateStatus(albumId: string, status: AlbumStatus, approvedAt?: number | null): Promise<void>;
}
