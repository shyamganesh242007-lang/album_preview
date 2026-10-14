import { AlbumPage } from '@/types/album';
import { storage } from '@/services/storage';
import { isWideSpread, canvasToWebPBlob } from './imageProcessing';

export interface PdfProcessProgress {
  currentPage: number;
  totalPages: number;
  status: string;
}

export interface PdfProcessOptions {
  markFirstAsCover?: boolean; // When true (default): forces first page as single front cover. When false: normal spread rules apply.
  markLastAsBackCover?: boolean; // When true (default): forces last page as single back cover. When false: normal spread rules apply.
}

/**
 * Lightweight asynchronous task queue with bounded concurrency
 */
class AsyncUploadQueue {
  private concurrency: number;
  private running: number = 0;
  private queue: Array<() => void> = [];

  constructor(concurrency: number = 3) {
    this.concurrency = concurrency;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      };

      if (this.running < this.concurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private next() {
    if (this.queue.length > 0 && this.running < this.concurrency) {
      const task = this.queue.shift();
      if (task) task();
    }
  }
}

/**
 * Renders PDF pages directly into WebP previews and uploads only WebP to album-previews:
 * - Optimal resolution rendering (avoids over-rendering canvases)
 * - Directly converts to WebP previews without intermediate duplicate canvas buffers
 * - Auto-detects and splits wide spreads into Left & Right pages
 * - Strictly preserves PDF source sequence via slot-based reassembly (sourcePageIndex)
 * - Pipelined controlled upload concurrency without ever corrupting page sequence
 * - Respects user preferences for front cover and back cover forcing
 * - Immediate canvas memory cleanup
 * - Zero original files stored or uploaded
 */
export async function processPdfFile(
  file: File,
  albumId: string,
  startOrder: number = 1,
  optionsOrProgress?: PdfProcessOptions | ((progress: PdfProcessProgress) => void),
  onProgress?: (progress: PdfProcessProgress) => void
): Promise<AlbumPage[]> {
  if (typeof window === 'undefined') {
    throw new Error('PDF processing can only be executed in browser');
  }

  let options: PdfProcessOptions = {
    markFirstAsCover: true,
    markLastAsBackCover: true,
  };
  let progressCallback = onProgress;

  if (typeof optionsOrProgress === 'function') {
    progressCallback = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = {
      markFirstAsCover: optionsOrProgress.markFirstAsCover !== false,
      markLastAsBackCover: optionsOrProgress.markLastAsBackCover !== false,
    };
  }

  // Dynamic import of pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');

  // Point to local public worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  // Fixed slot array allocated by source page index [0 ... totalPages-1]
  // This guarantees that regardless of async completion order, pages are
  // always reassembled in authoritative PDF source order.
  const pagesBySourceIndex: AlbumPage[][] = new Array(totalPages);
  const uploadQueue = new AsyncUploadQueue(3);
  const pendingUploadTasks: Promise<void>[] = [];

  const generatePageId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let completedUploadsCount = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const sourcePageIndex = pageNum - 1;
    const sourcePageNumber = pageNum;

    progressCallback?.({
      currentPage: pageNum,
      totalPages,
      status: `Rendering page ${pageNum} of ${totalPages}...`,
    });

    const page = await pdf.getPage(pageNum);

    // Compute optimal preview scale directly:
    // Single page preview max 2048px; wide spread max 3840px (1920px per side)
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const isFirstPage = pageNum === 1;
    const isLastPage = totalPages > 1 && pageNum === totalPages;

    const forceCoverSingle = isFirstPage && Boolean(options.markFirstAsCover);
    const forceBackCoverSingle = isLastPage && Boolean(options.markLastAsBackCover);
    const forceSingle = forceCoverSingle || forceBackCoverSingle;

    const isSpread = !forceSingle && isWideSpread(unscaledViewport.width, unscaledViewport.height);

    const targetMaxDim = isWideSpread(unscaledViewport.width, unscaledViewport.height) ? 3200 : 1600;
    const unscaledMax = Math.max(unscaledViewport.width, unscaledViewport.height);
    const renderScale = Math.min(2.0, Math.max(1.0, targetMaxDim / unscaledMax));
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error(`Failed to get canvas 2D context for PDF page ${pageNum}`);
    }

    // Render PDF page onto canvas
    const renderContext = {
      canvasContext: context,
      canvas: canvas,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

    if (isSpread) {
      const halfWidth = Math.floor(canvas.width / 2);
      const height = canvas.height;

      // Draw Left Canvas directly with alpha: false
      const leftCanvas = document.createElement('canvas');
      leftCanvas.width = halfWidth;
      leftCanvas.height = height;
      const leftCtx = leftCanvas.getContext('2d', { alpha: false });
      if (leftCtx) {
        leftCtx.drawImage(canvas, 0, 0, halfWidth, height, 0, 0, halfWidth, height);
      }

      // Draw Right Canvas directly with alpha: false
      const rightCanvas = document.createElement('canvas');
      rightCanvas.width = canvas.width - halfWidth;
      rightCanvas.height = height;
      const rightCtx = rightCanvas.getContext('2d', { alpha: false });
      if (rightCtx) {
        rightCtx.drawImage(
          canvas,
          halfWidth,
          0,
          canvas.width - halfWidth,
          height,
          0,
          0,
          canvas.width - halfWidth,
          height
        );
      }

      // Immediately release full spread canvas memory
      canvas.width = 0;
      canvas.height = 0;

      // Convert each half directly into WebP blob without intermediate duplicate canvas
      const [leftBlob, rightBlob] = await Promise.all([
        canvasToWebPBlob(leftCanvas, 0.82),
        canvasToWebPBlob(rightCanvas, 0.82),
      ]);

      // Immediately release split canvases memory
      leftCanvas.width = 0;
      leftCanvas.height = 0;
      rightCanvas.width = 0;
      rightCanvas.height = 0;

      const leftPageId = generatePageId();
      const rightPageId = generatePageId();

      // Pipeline upload concurrently in background while loop renders next page
      const uploadPromise = uploadQueue.run(async () => {
        const [leftUpload, rightUpload] = await Promise.all([
          storage.uploadPagePreview({
            albumId,
            pageId: leftPageId,
            blobId: leftPageId,
            previewBlob: leftBlob,
            previewWidth: halfWidth,
            previewHeight: height,
            filename: `${file.name} - Page ${pageNum} (Left)`,
          }),
          storage.uploadPagePreview({
            albumId,
            pageId: rightPageId,
            blobId: rightPageId,
            previewBlob: rightBlob,
            previewWidth: halfWidth,
            previewHeight: height,
            filename: `${file.name} - Page ${pageNum} (Right)`,
          }),
        ]);

        completedUploadsCount++;
        progressCallback?.({
          currentPage: completedUploadsCount,
          totalPages,
          status: `Uploaded page ${pageNum} (${completedUploadsCount}/${totalPages})...`,
        });

        const leftPage: AlbumPage = {
          id: leftPageId,
          albumId,
          order: 0, // Assigned sequentially during source reassembly
          sourcePageIndex,
          sourcePageNumber,
          splitSide: 'left',
          blobId: leftPageId,
          width: halfWidth,
          height,
          isSpread: true,
          side: 'left',
          filename: `${file.name} - Page ${pageNum} (Left)`,
          previewStoragePath: leftUpload.previewStoragePath,
          previewUrl: leftUpload.previewUrl,
          previewWidth: halfWidth,
          previewHeight: height,
          previewSizeBytes: leftUpload.previewSizeBytes,
        };

        const rightPage: AlbumPage = {
          id: rightPageId,
          albumId,
          order: 0, // Assigned sequentially during source reassembly
          sourcePageIndex,
          sourcePageNumber,
          splitSide: 'right',
          blobId: rightPageId,
          width: halfWidth,
          height,
          isSpread: true,
          side: 'right',
          filename: `${file.name} - Page ${pageNum} (Right)`,
          previewStoragePath: rightUpload.previewStoragePath,
          previewUrl: rightUpload.previewUrl,
          previewWidth: halfWidth,
          previewHeight: height,
          previewSizeBytes: rightUpload.previewSizeBytes,
        };

        // Put into exact source page slot: left strictly before right
        pagesBySourceIndex[sourcePageIndex] = [leftPage, rightPage];
      });

      pendingUploadTasks.push(uploadPromise);
    } else {
      const origWidth = canvas.width;
      const origHeight = canvas.height;

      // Convert directly into WebP blob without redundant resizing
      const previewBlob = await canvasToWebPBlob(canvas, 0.82);

      // Immediately release canvas memory
      canvas.width = 0;
      canvas.height = 0;

      const pageId = generatePageId();
      const pageSide: AlbumPage['side'] = forceCoverSingle
        ? 'front_cover'
        : forceBackCoverSingle
        ? 'back_cover'
        : 'single';

      // Pipeline upload concurrently in background while loop renders next page
      const uploadPromise = uploadQueue.run(async () => {
        const uploadRes = await storage.uploadPagePreview({
          albumId,
          pageId,
          blobId: pageId,
          previewBlob,
          previewWidth: origWidth,
          previewHeight: origHeight,
          filename: `${file.name} - Page ${pageNum}`,
        });

        completedUploadsCount++;
        progressCallback?.({
          currentPage: completedUploadsCount,
          totalPages,
          status: `Uploaded page ${pageNum} (${completedUploadsCount}/${totalPages})...`,
        });

        const singlePage: AlbumPage = {
          id: pageId,
          albumId,
          order: 0, // Assigned sequentially during source reassembly
          sourcePageIndex,
          sourcePageNumber,
          splitSide: 'single',
          blobId: pageId,
          width: origWidth,
          height: origHeight,
          isSpread: false,
          side: pageSide,
          filename: `${file.name} - Page ${pageNum}`,
          previewStoragePath: uploadRes.previewStoragePath,
          previewUrl: uploadRes.previewUrl,
          previewWidth: origWidth,
          previewHeight: origHeight,
          previewSizeBytes: uploadRes.previewSizeBytes,
        };

        // Put into exact source page slot
        pagesBySourceIndex[sourcePageIndex] = [singlePage];
      });

      pendingUploadTasks.push(uploadPromise);
    }
  }

  // Await all pipelined uploads to complete
  progressCallback?.({
    currentPage: totalPages,
    totalPages,
    status: 'Finalizing album previews...',
  });

  await Promise.all(pendingUploadTasks);

  // Authoritative reassembly: strictly by sourcePageIndex (0 to totalPages - 1)
  const resultPages: AlbumPage[] = [];
  let currentOrder = startOrder;

  for (let srcIdx = 0; srcIdx < totalPages; srcIdx++) {
    const pagesForSlot = pagesBySourceIndex[srcIdx];
    if (!pagesForSlot || pagesForSlot.length === 0) {
      throw new Error(`Incomplete processing: source PDF page ${srcIdx + 1} produced no pages`);
    }

    // Ensure left half appears before right half for wide spread splits
    const orderedInSlot = [...pagesForSlot].sort((a, b) => {
      if (a.splitSide === 'left' && b.splitSide === 'right') return -1;
      if (a.splitSide === 'right' && b.splitSide === 'left') return 1;
      return 0;
    });

    for (const p of orderedInSlot) {
      p.order = currentOrder++;
      resultPages.push(p);
    }
  }

  // Final deterministic sorting: primary key = order / sourcePageIndex, secondary key = left before right
  resultPages.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const diff = (a.sourcePageIndex ?? 0) - (b.sourcePageIndex ?? 0);
    if (diff !== 0) return diff;
    if (a.splitSide === 'left' && b.splitSide === 'right') return -1;
    if (a.splitSide === 'right' && b.splitSide === 'left') return 1;
    return 0;
  });

  console.log(`[PDF Processor] Successfully processed ${totalPages} source PDF pages into ${resultPages.length} physical album pages:`);
  resultPages.forEach((p) => {
    console.log(`  Page ${p.order}: sourcePage=${p.sourcePageNumber}, splitSide=${p.splitSide}, side=${p.side}`);
  });

  return resultPages;
}
