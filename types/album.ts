export type AlbumStatus =
  | 'Draft'
  | 'In Review'
  | 'Changes Requested'
  | 'Changes In Progress'
  | 'Ready for Review'
  | 'Customer Reviews'
  | 'Approved';

export type PageSide =
  | 'single'
  | 'left'
  | 'right'
  | 'cover'
  | 'front_cover'
  | 'back-cover'
  | 'back_cover';

export type CorrectionCategory =
  | 'Photo Correction'
  | 'Text Correction'
  | 'Design Correction'
  | 'Color Correction'
  | 'Layout Correction'
  | 'Other';

export type CorrectionStatus = 'Open' | 'Resolved';

export interface Correction {
  id: string;
  pageId: string;
  pageNumber?: number; // Logical page number across review rounds
  x: number; // Normalized coordinate (0 to 1)
  y: number; // Normalized coordinate (0 to 1)
  category: CorrectionCategory;
  comment: string;
  status: CorrectionStatus;
  author?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AlbumPage {
  id: string;
  albumId: string;
  order: number;
  blobId: string;
  width: number;
  height: number;
  isSpread: boolean;
  side: PageSide;
  filename?: string;

  // WebP preview storage architecture (single bucket: album-previews)
  previewStoragePath?: string;
  previewUrl?: string;
  previewWidth?: number;
  previewHeight?: number;
  previewSizeBytes?: number;

  // Source provenance metadata for strict order preservation
  sourcePageIndex?: number;
  sourcePageNumber?: number;
  splitSide?: 'single' | 'left' | 'right';

  // Legacy compatibility fields
  imagePath?: string;
  imageUrl?: string;
}

export type AlbumSourceType = 'images' | 'pdf';

export interface Album {
  id: string;
  title: string;
  clientName: string;
  clientEmail?: string;
  status: AlbumStatus;
  pages: AlbumPage[];
  corrections: Correction[];
  createdAt: number;
  updatedAt: number;
  approvedAt?: number | null;
  notes?: string;
  sourceType?: AlbumSourceType;
}

export interface StoredBlob {
  blobId: string;
  blob: Blob;
  type: string;
  size: number;
  createdAt: number;
}
