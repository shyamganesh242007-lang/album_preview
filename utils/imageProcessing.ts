import { AlbumPage } from '@/types/album';
import { storage } from '@/services/storage';

export interface ProcessedPageResult {
  pages: AlbumPage[];
}

export interface WebPPreviewResult {
  previewBlob: Blob;
  previewWidth: number;
  previewHeight: number;
}

/**
 * Checks if dimensions constitute a wide two-page spread (e.g. 12x24, 15x30, 18x36).
 * Single photos (portrait ~0.67, square 1.0, 4:3 ~1.33, 3:2 1.50) remain single pages.
 * Album spreads have aspect ratio >= 1.6 (typically 1.6 to 2.2+).
 */
export function isWideSpread(width: number, height: number): boolean {
  if (height === 0) return false;
  const ratio = width / height;
  return ratio >= 1.6;
}

/**
 * Loads an image file or blob into an HTMLImageElement
 */
export function loadImageElement(fileOrBlob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file: ' + String(err)));
    };
    img.src = url;
  });
}

/**
 * Directly encodes an HTMLCanvasElement into an optimized WebP blob (with JPEG fallback)
 */
export function canvasToWebPBlob(
  canvas: HTMLCanvasElement,
  quality: number = 0.82
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to JPEG if browser fails on WebP encoding
          canvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error('Failed to encode preview image'));
            },
            'image/jpeg',
            quality
          );
        }
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Generates an optimized WebP client preview from an image/canvas/blob.
 * - Format: WebP (with JPEG fallback if WebP encoding fails)
 * - Quality: ~0.82 (optimal balance between visual clarity and web performance)
 * - Max dimension: 2048px on longest side for online proofing (never upscales smaller images)
 * - Avoids duplicate canvas allocation if source canvas is already sized appropriately
 * - Aggressive memory cleanup after blob extraction
 */
export async function generateWebPPreview(
  source: Blob | HTMLImageElement | HTMLCanvasElement,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<WebPPreviewResult> {
  let imgElement: HTMLImageElement | null = null;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let drawSource: CanvasImageSource;

  if (source instanceof HTMLCanvasElement) {
    sourceWidth = source.width;
    sourceHeight = source.height;
    drawSource = source;

    // Fast-path: if canvas is already <= maxDimension, encode directly with zero extra allocation
    if (sourceWidth <= maxDimension && sourceHeight <= maxDimension) {
      const previewBlob = await canvasToWebPBlob(source, quality);
      return {
        previewBlob,
        previewWidth: sourceWidth,
        previewHeight: sourceHeight,
      };
    }
  } else if (source instanceof HTMLImageElement) {
    sourceWidth = source.naturalWidth || source.width;
    sourceHeight = source.naturalHeight || source.height;
    drawSource = source;
  } else {
    // Blob or File
    imgElement = await loadImageElement(source);
    sourceWidth = imgElement.naturalWidth || imgElement.width;
    sourceHeight = imgElement.naturalHeight || imgElement.height;
    drawSource = imgElement;
  }

  // Calculate target dimensions: do NOT upscale if smaller than maxDimension
  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;
  const longestSide = Math.max(sourceWidth, sourceHeight);

  if (longestSide > maxDimension && longestSide > 0) {
    const scale = maxDimension / longestSide;
    targetWidth = Math.round(sourceWidth * scale);
    targetHeight = Math.round(sourceHeight * scale);
  }

  // Draw into offscreen canvas with high quality downsampling
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Could not get 2D context for WebP generation');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

  // Convert to WebP blob
  const previewBlob = await canvasToWebPBlob(canvas, quality);

  // Release memory immediately
  canvas.width = 0;
  canvas.height = 0;
  if (imgElement) {
    imgElement.src = '';
    imgElement = null;
  }

  return {
    previewBlob,
    previewWidth: targetWidth,
    previewHeight: targetHeight,
  };
}

/**
 * Splits a wide spread image into left and right halves and converts both directly to WebP previews
 * without intermediate duplicate canvas buffers.
 */
export async function splitSpreadImageWebP(
  img: HTMLImageElement,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<{
  leftPreview: WebPPreviewResult;
  rightPreview: WebPPreviewResult;
  halfWidth: number;
  height: number;
}> {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const halfWidth = Math.floor(width / 2);

  // Calculate scaled target dimensions for each half directly (avoiding 2nd downsample step)
  const halfLongestSide = Math.max(halfWidth, height);
  const scale = halfLongestSide > maxDimension ? maxDimension / halfLongestSide : 1.0;
  const targetHalfW = Math.round(halfWidth * scale);
  const targetH = Math.round(height * scale);

  // Canvas for Left Half
  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = targetHalfW;
  leftCanvas.height = targetH;
  const leftCtx = leftCanvas.getContext('2d', { alpha: false });
  if (!leftCtx) throw new Error('Could not get 2D context for left canvas');
  leftCtx.imageSmoothingEnabled = true;
  leftCtx.imageSmoothingQuality = 'high';
  leftCtx.drawImage(img, 0, 0, halfWidth, height, 0, 0, targetHalfW, targetH);

  // Canvas for Right Half
  const rightCanvas = document.createElement('canvas');
  rightCanvas.width = targetHalfW;
  rightCanvas.height = targetH;
  const rightCtx = rightCanvas.getContext('2d', { alpha: false });
  if (!rightCtx) throw new Error('Could not get 2D context for right canvas');
  rightCtx.imageSmoothingEnabled = true;
  rightCtx.imageSmoothingQuality = 'high';
  rightCtx.drawImage(img, halfWidth, 0, width - halfWidth, height, 0, 0, targetHalfW, targetH);

  // Convert each half directly into WebP previews without intermediate buffer
  const [leftBlob, rightBlob] = await Promise.all([
    canvasToWebPBlob(leftCanvas, quality),
    canvasToWebPBlob(rightCanvas, quality),
  ]);

  // Release canvas memory immediately
  leftCanvas.width = 0;
  leftCanvas.height = 0;
  rightCanvas.width = 0;
  rightCanvas.height = 0;

  return {
    leftPreview: {
      previewBlob: leftBlob,
      previewWidth: targetHalfW,
      previewHeight: targetH,
    },
    rightPreview: {
      previewBlob: rightBlob,
      previewWidth: targetHalfW,
      previewHeight: targetH,
    },
    halfWidth,
    height,
  };
}

export interface ProcessImageOptions {
  isCover?: boolean;
  isBackCover?: boolean;
  sourcePageIndex?: number;
  sourcePageNumber?: number;
}

/**
 * Processes an uploaded image file (JPG, PNG, WebP) in the browser:
 * 1. Reads dimensions and orientation.
 * 2. If marked as Cover or Back Cover: keeps as SINGLE page, never splits even if wide.
 * 3. If middle page and aspect ratio >= 1.6: splits exactly at center midpoint into Left & Right pages.
 * 4. If middle page and normal aspect ratio (< 1.6): keeps as SINGLE page.
 * 5. Converts resulting pages directly to optimized WebP.
 * 6. Uploads ONLY WebP previews to Supabase bucket 'album-previews'.
 * 7. Frees memory immediately.
 */
export async function processImageFile(
  file: File,
  albumId: string,
  startOrder: number,
  options?: boolean | ProcessImageOptions,
  onStepProgress?: (step: string) => void
): Promise<AlbumPage[]> {
  const isCover = typeof options === 'boolean' ? options : Boolean(options?.isCover);
  const isBackCover = typeof options === 'boolean' ? false : Boolean(options?.isBackCover);
  const sourcePageIndex = typeof options === 'object' ? options.sourcePageIndex : undefined;
  const sourcePageNumber = typeof options === 'object' ? options.sourcePageNumber : undefined;

  onStepProgress?.('Processing image file...');
  const img = await loadImageElement(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const generatePageId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Cover and Back Cover are ALWAYS single pages and NEVER split, even if wide
  const forceSingle = isCover || isBackCover;

  if (!forceSingle && isWideSpread(width, height)) {
    onStepProgress?.('Splitting panoramic spread into Left & Right WebP previews...');
    const { leftPreview, rightPreview, halfWidth } = await splitSpreadImageWebP(img, 1600, 0.82);

    // Clear original img element from memory
    img.src = '';

    const leftPageId = generatePageId();
    const rightPageId = generatePageId();

    onStepProgress?.('Uploading Left page WebP preview...');
    const leftUpload = await storage.uploadPagePreview({
      albumId,
      pageId: leftPageId,
      blobId: leftPageId,
      previewBlob: leftPreview.previewBlob,
      previewWidth: leftPreview.previewWidth,
      previewHeight: leftPreview.previewHeight,
      filename: `${file.name} (Left)`,
    });

    onStepProgress?.('Uploading Right page WebP preview...');
    const rightUpload = await storage.uploadPagePreview({
      albumId,
      pageId: rightPageId,
      blobId: rightPageId,
      previewBlob: rightPreview.previewBlob,
      previewWidth: rightPreview.previewWidth,
      previewHeight: rightPreview.previewHeight,
      filename: `${file.name} (Right)`,
    });

    const leftPage: AlbumPage = {
      id: leftPageId,
      albumId,
      order: startOrder,
      sourcePageIndex,
      sourcePageNumber,
      splitSide: 'left',
      blobId: leftPageId,
      width: halfWidth,
      height,
      isSpread: true,
      side: 'left',
      filename: `${file.name} (Left)`,
      previewStoragePath: leftUpload.previewStoragePath,
      previewUrl: leftUpload.previewUrl,
      previewWidth: leftPreview.previewWidth,
      previewHeight: leftPreview.previewHeight,
      previewSizeBytes: leftUpload.previewSizeBytes,
    };

    const rightPage: AlbumPage = {
      id: rightPageId,
      albumId,
      order: startOrder + 1,
      sourcePageIndex,
      sourcePageNumber,
      splitSide: 'right',
      blobId: rightPageId,
      width: halfWidth,
      height,
      isSpread: true,
      side: 'right',
      filename: `${file.name} (Right)`,
      previewStoragePath: rightUpload.previewStoragePath,
      previewUrl: rightUpload.previewUrl,
      previewWidth: rightPreview.previewWidth,
      previewHeight: rightPreview.previewHeight,
      previewSizeBytes: rightUpload.previewSizeBytes,
    };

    return [leftPage, rightPage];
  } else {
    // Single page (Cover, Back Cover, or standard single middle page)
    const pageId = generatePageId();

    onStepProgress?.('Generating WebP preview...');
    const previewRes = await generateWebPPreview(img, 2560, 0.82);

    // Free loaded image memory
    img.src = '';

    onStepProgress?.('Uploading WebP preview to Supabase...');
    const uploadRes = await storage.uploadPagePreview({
      albumId,
      pageId,
      blobId: pageId,
      previewBlob: previewRes.previewBlob,
      previewWidth: previewRes.previewWidth,
      previewHeight: previewRes.previewHeight,
      filename: file.name,
    });

    const pageSide: AlbumPage['side'] = isCover ? 'cover' : isBackCover ? 'back-cover' : 'single';

    const singlePage: AlbumPage = {
      id: pageId,
      albumId,
      order: startOrder,
      sourcePageIndex,
      sourcePageNumber,
      splitSide: 'single',
      blobId: pageId,
      width,
      height,
      isSpread: false,
      side: pageSide,
      filename: file.name,
      previewStoragePath: uploadRes.previewStoragePath,
      previewUrl: uploadRes.previewUrl,
      previewWidth: previewRes.previewWidth,
      previewHeight: previewRes.previewHeight,
      previewSizeBytes: uploadRes.previewSizeBytes,
    };

    return [singlePage];
  }
}
