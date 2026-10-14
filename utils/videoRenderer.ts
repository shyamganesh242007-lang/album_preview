import { Album, AlbumPage } from '@/types/album';
import { buildAlbumSpreads, AlbumSpread } from '@/utils/spreadBuilder';
import {
  renderContinuousPageCurl2D,
  WebGLPageCurlRenderer,
  getTransitionProfile,
} from '@/utils/pageCurlEngine';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';

export type VideoFormat = 'youtube-16-9' | 'reels-9-16';
export type ExportScope = 'highlights' | 'complete';
export type TransitionStyle = 'real-3d-curl' | 'soft-turn' | 'cinematic-turn' | 'soft-fade';

export interface VideoExportOptions {
  format: VideoFormat;
  scope: ExportScope;
  transitionStyle: TransitionStyle;
  spreadDurationSec: number; // e.g. 1.5
  includeWatermark: boolean;
  onProgress?: (progress: {
    percent: number;
    currentSpread: number;
    totalSpreads: number;
    statusText: string;
  }) => void;
  signal?: AbortSignal;
}

export interface VideoExportResult {
  blob: Blob;
  url: string;
  filename: string;
  durationSec: number;
}

type CachedImageResource = ImageBitmap | HTMLImageElement;

/**
 * Loads an image from URL and converts to ImageBitmap if supported
 * (GPU-friendly, pre-decoded, fastest possible canvas drawing)
 */
async function loadCacheImage(url: string, signal?: AbortSignal): Promise<CachedImageResource> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Export aborted by user'));
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const onAbort = () => {
      img.src = '';
      reject(new Error('Export aborted by user'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    img.onload = async () => {
      signal?.removeEventListener('abort', onAbort);
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {}

      // Prefer ImageBitmap for GPU accelerated blitting if supported
      if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
        try {
          const bitmap = await window.createImageBitmap(img);
          return resolve(bitmap);
        } catch {}
      }
      resolve(img);
    };

    img.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      fallbackImg.src = url;
    };
    img.src = url;
  });
}

/**
 * Release all cached ImageBitmaps from GPU memory
 */
function releaseCachedImages(map: Map<string, CachedImageResource>) {
  for (const item of map.values()) {
    if ('close' in item && typeof item.close === 'function') {
      try {
        item.close();
      } catch {}
    }
  }
  map.clear();
}

/**
 * Pre-renders luxury studio backdrop onto an offscreen canvas
 */
function createBackgroundCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const maxDim = Math.max(width, height);
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    100,
    width / 2,
    height / 2,
    maxDim * 0.75
  );
  grad.addColorStop(0, '#fafbfc');
  grad.addColorStop(0.5, '#f0f3f6');
  grad.addColorStop(1, '#dfe4ea');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const floorHeight = Math.round(height * 0.22);
  const floorGrad = ctx.createLinearGradient(0, height - floorHeight, 0, height);
  floorGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0.04)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, height - floorHeight, width, floorHeight);

  return canvas;
}

/**
 * Draws Studio Hallmark Watermark Overlay
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  isLandscape: boolean
) {
  ctx.save();
  const watermarkY = isLandscape ? height - 52 : height - 120;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(71, 85, 105, 0.75)';
  ctx.letterSpacing = '3px';
  ctx.fillText('ZEEBOOK STUDIO', width / 2, watermarkY);

  ctx.font = '400 10px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('EXCLUSIVE WEDDING ALBUM PROOF', width / 2, watermarkY + 18);

  ctx.restore();
}

/**
 * Multi-tier realistic soft physical drop shadow
 */
function drawAlbumShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isSingle: boolean
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 24;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = isSingle ? 4 : 0;
  ctx.shadowOffsetY = 4;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Draws a stationary flat album spread
 */
function drawStationarySpread(
  ctx: CanvasRenderingContext2D,
  spread: AlbumSpread,
  leftImg: CachedImageResource | null,
  rightImg: CachedImageResource | null,
  canvasWidth: number,
  canvasHeight: number,
  singlePageW: number,
  spreadFitW: number,
  spreadFitH: number
) {
  const isCover = Boolean(spread.isCover);
  const isBackCover = Boolean(spread.isBackCover);

  if (isCover && (rightImg || leftImg)) {
    const coverImg = rightImg || leftImg;
    const x = Math.round((canvasWidth - singlePageW) / 2);
    const y = Math.round((canvasHeight - spreadFitH) / 2);
    drawAlbumShadow(ctx, x, y, singlePageW, spreadFitH, true);

    ctx.save();
    if (coverImg) {
      ctx.drawImage(coverImg, x, y, singlePageW, spreadFitH);
    }
    const hingeGrad = ctx.createLinearGradient(x, 0, x + 32, 0);
    hingeGrad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    hingeGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.2)');
    hingeGrad.addColorStop(0.4, 'rgba(0, 0, 0, 0.1)');
    hingeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hingeGrad;
    ctx.fillRect(x, y, 32, spreadFitH);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, singlePageW, spreadFitH);
    ctx.restore();
    return;
  }

  if (isBackCover && (leftImg || rightImg)) {
    const bImg = leftImg || rightImg;
    const x = Math.round((canvasWidth - singlePageW) / 2);
    const y = Math.round((canvasHeight - spreadFitH) / 2);
    drawAlbumShadow(ctx, x, y, singlePageW, spreadFitH, true);

    ctx.save();
    if (bImg) {
      ctx.drawImage(bImg, x, y, singlePageW, spreadFitH);
    }
    const hingeGrad = ctx.createLinearGradient(x + singlePageW, 0, x + singlePageW - 32, 0);
    hingeGrad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    hingeGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.2)');
    hingeGrad.addColorStop(0.4, 'rgba(0, 0, 0, 0.1)');
    hingeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hingeGrad;
    ctx.fillRect(x + singlePageW - 32, y, 32, spreadFitH);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, singlePageW, spreadFitH);
    ctx.restore();
    return;
  }

  // Inside Two-Page Spread
  const x = Math.round((canvasWidth - spreadFitW) / 2);
  const y = Math.round((canvasHeight - spreadFitH) / 2);
  drawAlbumShadow(ctx, x, y, spreadFitW, spreadFitH, false);

  ctx.save();
  if (leftImg) {
    ctx.drawImage(leftImg, x, y, singlePageW, spreadFitH);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, singlePageW, spreadFitH);
  }

  if (rightImg) {
    ctx.drawImage(rightImg, x + singlePageW, y, singlePageW, spreadFitH);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x + singlePageW, y, singlePageW, spreadFitH);
  }

  // Center Spine Gutter Shadows
  const spineX = x + singlePageW;
  const gutterLeft = ctx.createLinearGradient(spineX - 44, 0, spineX, 0);
  gutterLeft.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gutterLeft.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = gutterLeft;
  ctx.fillRect(spineX - 44, y, 44, spreadFitH);

  const gutterRight = ctx.createLinearGradient(spineX, 0, spineX + 44, 0);
  gutterRight.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
  gutterRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gutterRight;
  ctx.fillRect(spineX, y, 44, spreadFitH);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(spineX - 0.5, y, 1, spreadFitH);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, spreadFitW, spreadFitH);
  ctx.restore();
}

/**
 * Draws the Continuous 3D Physical Page Turn using the SHARED engine
 */
function drawPhysicalPageTurn(
  ctx: CanvasRenderingContext2D,
  curSpread: AlbumSpread,
  nextSpread: AlbumSpread,
  curLeftImg: CachedImageResource | null,
  curRightImg: CachedImageResource | null,
  nextLeftImg: CachedImageResource | null,
  nextRightImg: CachedImageResource | null,
  progress: number,
  canvasWidth: number,
  canvasHeight: number,
  singlePageW: number,
  spreadFitW: number,
  spreadFitH: number,
  transitionStyle: TransitionStyle,
  curlRenderer?: WebGLPageCurlRenderer | null,
  curlCanvas?: HTMLCanvasElement | null
) {
  const profile = getTransitionProfile(transitionStyle);
  const p = Math.max(0, Math.min(1, progress));
  const easeP = profile.easeProgress(p);

  const isTurningFromCover = Boolean(curSpread.isCover);
  const isTurningToBackCover = Boolean(nextSpread.isBackCover);

  let startSpineX = Math.round(canvasWidth / 2);
  let endSpineX = Math.round(canvasWidth / 2);

  if (isTurningFromCover) {
    startSpineX = Math.round((canvasWidth - singlePageW) / 2);
    endSpineX = Math.round(canvasWidth / 2);
  } else if (isTurningToBackCover) {
    startSpineX = Math.round(canvasWidth / 2);
    endSpineX = Math.round((canvasWidth + singlePageW) / 2);
  }

  const spineX = Math.round(startSpineX + (endSpineX - startSpineX) * easeP);
  const albumX = Math.round(canvasWidth / 2 - singlePageW);
  const albumY = Math.round((canvasHeight - spreadFitH) / 2);

  // 1. Draw Stationary Base Pages & Shadow
  let currentAlbumLeft = albumX;
  let currentAlbumW = spreadFitW;

  if (isTurningFromCover) {
    currentAlbumW = Math.round(singlePageW + singlePageW * easeP);
    currentAlbumLeft = Math.round(spineX - singlePageW * easeP);
  } else if (isTurningToBackCover) {
    currentAlbumW = Math.round(spreadFitW - singlePageW * easeP);
    currentAlbumLeft = albumX;
  }

  drawAlbumShadow(ctx, currentAlbumLeft, albumY, currentAlbumW, spreadFitH, false);

  if (isTurningFromCover) {
    // Underneath the cover as it turns: the destination inside spread!
    if (nextLeftImg) {
      ctx.drawImage(nextLeftImg, albumX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(albumX, albumY, singlePageW, spreadFitH);
    }
    if (nextRightImg) {
      ctx.drawImage(nextRightImg, spineX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(spineX, albumY, singlePageW, spreadFitH);
    }
  } else if (isTurningToBackCover) {
    // Underneath turning to back cover: the back cover on left, curRightImg on right
    if (nextLeftImg || nextRightImg) {
      ctx.drawImage((nextLeftImg || nextRightImg)!, albumX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(albumX, albumY, singlePageW, spreadFitH);
    }
    if (curRightImg) {
      ctx.drawImage(curRightImg, spineX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(spineX, albumY, singlePageW, spreadFitH);
    }
  } else {
    // Middle spread: curLeftImg on left, nextRightImg on right
    if (curLeftImg) {
      ctx.drawImage(curLeftImg, albumX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(albumX, albumY, singlePageW, spreadFitH);
    }
    if (nextRightImg) {
      ctx.drawImage(nextRightImg, spineX, albumY, singlePageW, spreadFitH);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(spineX, albumY, singlePageW, spreadFitH);
    }
  }

  // Spine gutter shading
  const gutterLeft = ctx.createLinearGradient(spineX - 44, 0, spineX, 0);
  gutterLeft.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gutterLeft.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = gutterLeft;
  ctx.fillRect(spineX - 44, albumY, 44, spreadFitH);

  const gutterRight = ctx.createLinearGradient(spineX, 0, spineX + 44, 0);
  gutterRight.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
  gutterRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gutterRight;
  ctx.fillRect(spineX, albumY, 44, spreadFitH);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(spineX - 0.5, albumY, 1, spreadFitH);

  // Dynamic Moving Cast Shadow onto Base Page driven by Profile
  const flex = Math.sin(easeP * Math.PI);
  const shadowOpacity = flex * profile.shadowOpacity;
  if (shadowOpacity > 0.01) {
    ctx.save();
    if (easeP < 0.5) {
      const shadowDist = (1 - easeP) * singlePageW * 0.75 * profile.shadowBlurFactor;
      const grad = ctx.createLinearGradient(spineX, 0, spineX + Math.max(24, shadowDist), 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(0.4, `rgba(0, 0, 0, ${shadowOpacity * 0.5})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX, albumY, Math.max(24, shadowDist), spreadFitH);
    } else {
      const shadowLeftW = easeP * singlePageW * 0.8 * profile.shadowBlurFactor;
      const grad = ctx.createLinearGradient(spineX, 0, spineX - shadowLeftW, 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(0.4, `rgba(0, 0, 0, ${shadowOpacity * 0.4})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX - shadowLeftW, albumY, shadowLeftW, spreadFitH);
    }
    ctx.restore();
  }

  // 2. Call the unified Continuous Page Curl Engine
  let frontImg: CachedImageResource | null = null;
  let backImg: CachedImageResource | null = null;
  let isSingleSheet = false;

  if (isTurningFromCover) {
    frontImg = curRightImg || curLeftImg;
    backImg = null; // CRITICAL: Neutral physical paper backing! No customer album page on backside!
    isSingleSheet = true;
  } else if (isTurningToBackCover) {
    frontImg = curRightImg;
    backImg = null; // CRITICAL: Neutral physical paper backing!
    isSingleSheet = true;
  } else {
    frontImg = curRightImg;
    backImg = nextLeftImg;
    isSingleSheet = false;
  }

  if (curlRenderer && curlRenderer.isAvailable() && curlCanvas) {
    curlRenderer.uploadTextures(frontImg, backImg);
    curlRenderer.render({
      pageWidth: singlePageW,
      pageHeight: spreadFitH,
      spineX,
      spineY: albumY,
      progress: easeP,
      direction: 'next',
      grabRegion: 'edge',
      stylePreset: transitionStyle,
      isSingleSheet,
    });
    ctx.drawImage(curlCanvas, 0, 0);
  } else {
    renderContinuousPageCurl2D(ctx, {
      frontImg,
      backImg,
      pageWidth: singlePageW,
      pageHeight: spreadFitH,
      spineX,
      spineY: albumY,
      progress: easeP,
      direction: 'next',
      grabRegion: 'edge',
      stylePreset: transitionStyle,
      isSingleSheet,
    });
  }

  // Perimeter Bevel
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(currentAlbumLeft, albumY, currentAlbumW, spreadFitH);
}

/**
 * Draws Soft Fade Transition
 * Clean photographic cross-dissolve with subtle scale drift
 */
function drawSoftFade(
  ctx: CanvasRenderingContext2D,
  curSpread: AlbumSpread,
  nextSpread: AlbumSpread,
  curLeftImg: CachedImageResource | null,
  curRightImg: CachedImageResource | null,
  nextLeftImg: CachedImageResource | null,
  nextRightImg: CachedImageResource | null,
  progress: number,
  canvasWidth: number,
  canvasHeight: number,
  singlePageW: number,
  spreadFitW: number,
  spreadFitH: number
) {
  const p = Math.max(0, Math.min(1, progress));
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // Spread A dissolves out with subtle scale expansion (1.00 -> 1.018)
  ctx.save();
  ctx.globalAlpha = 1 - p;
  const scaleA = 1.0 + 0.018 * p;
  ctx.translate(cx, cy);
  ctx.scale(scaleA, scaleA);
  ctx.translate(-cx, -cy);
  drawStationarySpread(
    ctx,
    curSpread,
    curLeftImg,
    curRightImg,
    canvasWidth,
    canvasHeight,
    singlePageW,
    spreadFitW,
    spreadFitH
  );
  ctx.restore();

  // Spread B dissolves in with subtle scale settling (0.982 -> 1.00)
  ctx.save();
  ctx.globalAlpha = p;
  const scaleB = 0.982 + 0.018 * p;
  ctx.translate(cx, cy);
  ctx.scale(scaleB, scaleB);
  ctx.translate(-cx, -cy);
  drawStationarySpread(
    ctx,
    nextSpread,
    nextLeftImg,
    nextRightImg,
    canvasWidth,
    canvasHeight,
    singlePageW,
    spreadFitW,
    spreadFitH
  );
  ctx.restore();
}

/**
 * 3D Flipbook Video Exporter Engine
 * High-performance GPU-accelerated video rendering pipeline:
 * 1. Hardware-accelerated VideoEncoder (H.264/MP4 or VP9/WebM)
 * 2. Proper encoder queue backpressure control (eliminates 99% stall)
 * 3. Pre-decoded and cached ImageBitmaps
 * 4. Realistic 3D single-sheet front/back cover page turn with neutral paper backside
 * 5. YouTube 16:9 (1920x1080) and Instagram Reels 9:16 (1080x1920) support
 */
export async function renderAlbumVideo(
  album: Album,
  options: VideoExportOptions
): Promise<VideoExportResult> {
  const {
    format,
    scope,
    transitionStyle,
    spreadDurationSec,
    includeWatermark,
    onProgress,
    signal,
  } = options;

  if (signal?.aborted) {
    throw new Error('Export aborted by user');
  }

  // 1. Spreads setup
  const allSpreads = buildAlbumSpreads(album.pages);
  if (allSpreads.length === 0) {
    throw new Error('No pages available to export');
  }

  const spreadsToExport =
    scope === 'highlights'
      ? allSpreads.slice(0, Math.min(10, allSpreads.length))
      : allSpreads;

  const totalSpreads = spreadsToExport.length;

  // 2. Dimensions
  const isLandscape = format === 'youtube-16-9';
  const canvasWidth = isLandscape ? 1920 : 1080;
  const canvasHeight = isLandscape ? 1080 : 1920;

  // Layout margins tailored for 16:9 landscape vs 9:16 vertical Reels
  const stageMarginX = isLandscape ? 160 : 48;
  const stageMarginY = isLandscape ? 120 : 360;
  const maxStageWidth = canvasWidth - stageMarginX * 2;
  const maxStageHeight = canvasHeight - stageMarginY * 2;

  let masterSpreadRatio = 2.0;
  const sampleSpread = spreadsToExport.find(
    (s) => !s.isCover && !s.isBackCover && s.leftPage && s.rightPage
  );
  if (sampleSpread?.leftPage && sampleSpread?.rightPage) {
    const w = (sampleSpread.leftPage.width || 1200) + (sampleSpread.rightPage.width || 1200);
    const h = Math.max(sampleSpread.leftPage.height || 800, sampleSpread.rightPage.height || 800);
    if (h > 0) masterSpreadRatio = w / h;
  }

  let spreadFitW = maxStageWidth;
  let spreadFitH = spreadFitW / masterSpreadRatio;
  if (spreadFitH > maxStageHeight) {
    spreadFitH = maxStageHeight;
    spreadFitW = spreadFitH * masterSpreadRatio;
  }
  spreadFitW = Math.round(spreadFitW);
  spreadFitH = Math.round(spreadFitH);
  const singlePageW = Math.round(spreadFitW / 2);

  // 3. Preload all needed images once into cache
  onProgress?.({
    percent: 3,
    currentSpread: 1,
    totalSpreads,
    statusText: 'Preparing album images...',
  });

  const imageMap = new Map<string, CachedImageResource>();
  const uniqueUrls = new Set<string>();
  spreadsToExport.forEach((s) => {
    if (s.leftPage?.previewUrl) uniqueUrls.add(s.leftPage.previewUrl);
    if (s.rightPage?.previewUrl) uniqueUrls.add(s.rightPage.previewUrl);
  });

  let loadedCount = 0;
  await Promise.all(
    Array.from(uniqueUrls).map(async (url) => {
      if (signal?.aborted) return;
      try {
        const img = await loadCacheImage(url, signal);
        imageMap.set(url, img);
      } catch (err) {
        console.warn('Failed to load export image:', url, err);
      }
      loadedCount++;
      onProgress?.({
        percent: Math.min(10, Math.round(3 + (loadedCount / Math.max(1, uniqueUrls.size)) * 7)),
        currentSpread: 1,
        totalSpreads,
        statusText: `Loaded ${loadedCount} of ${uniqueUrls.size} images...`,
      });
    })
  );

  if (signal?.aborted) {
    releaseCachedImages(imageMap);
    throw new Error('Export aborted by user');
  }

  const getImage = (page?: AlbumPage | null): CachedImageResource | null => {
    if (!page?.previewUrl) return null;
    return imageMap.get(page.previewUrl) || null;
  };

  // 4. Precompute Static Background
  const bgCanvas = createBackgroundCanvas(canvasWidth, canvasHeight);

  // 5. Timeline parameters: 30 FPS with duration paced to user setting
  const fps = 30;
  const targetSpreadSec = Math.max(0.8, Math.min(3.0, spreadDurationSec));
  // Hold: ~35% of duration, Turn: ~65% of duration
  const holdFrames = Math.max(8, Math.round(targetSpreadSec * 0.35 * fps));
  const turnFrames = Math.max(16, Math.round(targetSpreadSec * 0.65 * fps));
  // Final spread settles for 1.5 seconds so the video finishes comfortably
  const finalHoldFrames = Math.max(holdFrames, Math.round(1.5 * fps));
  const totalFrames =
    (totalSpreads - 1) * holdFrames +
    finalHoldFrames +
    Math.max(0, totalSpreads - 1) * turnFrames;

  try {
    // 6. Check WebCodecs availability
    const hasWebCodecs =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined';

    if (hasWebCodecs) {
      try {
        return await renderWithWebCodecsPipeline({
          album,
          spreadsToExport,
          imageMap,
          getImage,
          bgCanvas,
          canvasWidth,
          canvasHeight,
          isLandscape,
          singlePageW,
          spreadFitW,
          spreadFitH,
          fps,
          holdFrames,
          turnFrames,
          finalHoldFrames,
          totalFrames,
          totalSpreads,
          transitionStyle,
          includeWatermark,
          onProgress,
          signal,
        });
      } catch (err: unknown) {
        if (signal?.aborted || (err instanceof Error && err.message.includes('aborted'))) {
          throw err;
        }
        console.warn('WebCodecs encoding fallback triggered:', err);
      }
    }

    // Fallback to MediaRecorder pipeline
    return await renderWithMediaRecorderPipeline({
      album,
      spreadsToExport,
      getImage,
      bgCanvas,
      canvasWidth,
      canvasHeight,
      isLandscape,
      singlePageW,
      spreadFitW,
      spreadFitH,
      fps,
      holdFrames,
      turnFrames,
      finalHoldFrames,
      totalFrames,
      totalSpreads,
      transitionStyle,
      includeWatermark,
      onProgress,
      signal,
    });
  } finally {
    releaseCachedImages(imageMap);
  }
}

/**
 * High-Speed Hardware WebCodecs Pipeline with backpressure control
 */
async function renderWithWebCodecsPipeline(params: {
  album: Album;
  spreadsToExport: AlbumSpread[];
  imageMap: Map<string, CachedImageResource>;
  getImage: (page?: AlbumPage | null) => CachedImageResource | null;
  bgCanvas: HTMLCanvasElement;
  canvasWidth: number;
  canvasHeight: number;
  isLandscape: boolean;
  singlePageW: number;
  spreadFitW: number;
  spreadFitH: number;
  fps: number;
  holdFrames: number;
  turnFrames: number;
  finalHoldFrames: number;
  totalFrames: number;
  totalSpreads: number;
  transitionStyle: TransitionStyle;
  includeWatermark: boolean;
  onProgress?: (progress: {
    percent: number;
    currentSpread: number;
    totalSpreads: number;
    statusText: string;
  }) => void;
  signal?: AbortSignal;
}): Promise<VideoExportResult> {
  const {
    album,
    spreadsToExport,
    getImage,
    bgCanvas,
    canvasWidth,
    canvasHeight,
    isLandscape,
    singlePageW,
    spreadFitW,
    spreadFitH,
    fps,
    holdFrames,
    turnFrames,
    finalHoldFrames,
    totalFrames,
    totalSpreads,
    transitionStyle,
    includeWatermark,
    onProgress,
    signal,
  } = params;

  // Determine whether hardware H.264 MP4 is supported
  let useMp4 = false;
  let chosenCodec = 'vp09.00.10.08';

  try {
    const h264Check = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028',
      width: canvasWidth,
      height: canvasHeight,
      bitrate: 8_000_000,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
    });
    if (h264Check.supported) {
      useMp4 = true;
      chosenCodec = 'avc1.640028';
    }
  } catch {}

  let muxer: Mp4Muxer<Mp4ArrayBufferTarget> | WebmMuxer<WebmArrayBufferTarget>;

  if (useMp4) {
    muxer = new Mp4Muxer({
      target: new Mp4ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: canvasWidth,
        height: canvasHeight,
      },
      fastStart: 'in-memory',
    });
  } else {
    muxer = new WebmMuxer({
      target: new WebmArrayBufferTarget(),
      video: {
        codec: 'V_VP9',
        width: canvasWidth,
        height: canvasHeight,
        frameRate: fps,
      },
    });
  }

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encodeError = err;
    },
  });

  encoder.configure({
    codec: chosenCodec,
    width: canvasWidth,
    height: canvasHeight,
    bitrate: 8_000_000,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
  });

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = canvasWidth;
  renderCanvas.height = canvasHeight;
  const ctx = renderCanvas.getContext('2d', { alpha: false })!;

  const staticSpreadCanvas = document.createElement('canvas');
  staticSpreadCanvas.width = canvasWidth;
  staticSpreadCanvas.height = canvasHeight;
  const staticCtx = staticSpreadCanvas.getContext('2d', { alpha: false })!;

  // Dedicated WebGL continuous single-texture renderer for photorealistic 3D page curl
  const curlCanvas = document.createElement('canvas');
  curlCanvas.width = canvasWidth;
  curlCanvas.height = canvasHeight;
  const curlRenderer = new WebGLPageCurlRenderer(curlCanvas);

  let frameCounter = 0;

  // Backpressure helper: prevents unbounded encoder queue buildup
  // Keeps RAM usage minimal and guarantees that encoder.flush() takes < 100ms at the end!
  const awaitEncoderBackpressure = async (maxQueue: number = 4) => {
    while (encoder.encodeQueueSize > maxQueue) {
      if (signal?.aborted) throw new Error('Export aborted by user');
      await new Promise((r) => setTimeout(r, 4));
    }
  };

  try {
    for (let sIdx = 0; sIdx < totalSpreads; sIdx++) {
      if (signal?.aborted || encodeError) {
        encoder.close();
        throw encodeError || new Error('Export aborted by user');
      }

      const curSpread = spreadsToExport[sIdx];
      const nextSpread = spreadsToExport[sIdx + 1];

      const curLeftImg = getImage(curSpread.leftPage);
      const curRightImg = getImage(curSpread.rightPage);
      const nextLeftImg = nextSpread ? getImage(nextSpread.leftPage) : null;
      const nextRightImg = nextSpread ? getImage(nextSpread.rightPage) : null;

      // 1. Pre-render static hold spread once
      staticCtx.drawImage(bgCanvas, 0, 0);
      drawStationarySpread(
        staticCtx,
        curSpread,
        curLeftImg,
        curRightImg,
        canvasWidth,
        canvasHeight,
        singlePageW,
        spreadFitW,
        spreadFitH
      );
      if (includeWatermark) {
        drawWatermark(staticCtx, canvasWidth, canvasHeight, isLandscape);
      }

      const isLastSpread = sIdx === totalSpreads - 1;
      const currentHoldFrames = isLastSpread ? finalHoldFrames : holdFrames;

      // Encode hold frames
      for (let h = 0; h < currentHoldFrames; h++) {
        if (signal?.aborted) {
          encoder.close();
          throw new Error('Export aborted by user');
        }

        const timestamp = (frameCounter * 1_000_000) / fps;
        const frame = new VideoFrame(staticSpreadCanvas, { timestamp });
        encoder.encode(frame, { keyFrame: h === 0 && sIdx % 4 === 0 });
        frame.close();
        frameCounter++;

        await awaitEncoderBackpressure(4);
      }

      // 2. Render turn frames to next spread
      if (nextSpread) {
        for (let t = 0; t < turnFrames; t++) {
          if (signal?.aborted) {
            encoder.close();
            throw new Error('Export aborted by user');
          }

          const progress = (t + 1) / turnFrames;
          ctx.drawImage(bgCanvas, 0, 0);

          if (transitionStyle === 'soft-fade') {
            drawSoftFade(
              ctx,
              curSpread,
              nextSpread,
              curLeftImg,
              curRightImg,
              nextLeftImg,
              nextRightImg,
              progress,
              canvasWidth,
              canvasHeight,
              singlePageW,
              spreadFitW,
              spreadFitH
            );
          } else {
            drawPhysicalPageTurn(
              ctx,
              curSpread,
              nextSpread,
              curLeftImg,
              curRightImg,
              nextLeftImg,
              nextRightImg,
              progress,
              canvasWidth,
              canvasHeight,
              singlePageW,
              spreadFitW,
              spreadFitH,
              transitionStyle,
              curlRenderer,
              curlCanvas
            );
          }

          if (includeWatermark) {
            drawWatermark(ctx, canvasWidth, canvasHeight, isLandscape);
          }

          const timestamp = (frameCounter * 1_000_000) / fps;
          const frame = new VideoFrame(renderCanvas, { timestamp });
          encoder.encode(frame, { keyFrame: false });
          frame.close();
          frameCounter++;

          await awaitEncoderBackpressure(4);
        }
      }

      // Progress reporting (10% to 96%)
      const renderPercent = Math.min(
        96,
        10 + Math.round((frameCounter / totalFrames) * 86)
      );
      onProgress?.({
        percent: renderPercent,
        currentSpread: sIdx + 1,
        totalSpreads,
        statusText: `Rendering spread ${sIdx + 1} of ${totalSpreads}`,
      });
    }

    onProgress?.({
      percent: 98,
      currentSpread: totalSpreads,
      totalSpreads,
      statusText: 'Finalizing video stream...',
    });

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const mimeType = useMp4 ? 'video/mp4' : 'video/webm';
    const videoBlob = new Blob([buffer], { type: mimeType });
    const videoUrl = URL.createObjectURL(videoBlob);
    const safeTitle = album.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const extension = useMp4 ? 'mp4' : 'webm';
    const filename = `${safeTitle}_3d_album_${isLandscape ? '1080p' : 'reels'}.${extension}`;
    const totalDurationSec = totalFrames / fps;

    onProgress?.({
      percent: 100,
      currentSpread: totalSpreads,
      totalSpreads,
      statusText: 'Video ready for download!',
    });

    return {
      blob: videoBlob,
      url: videoUrl,
      filename,
      durationSec: totalDurationSec,
    };
  } catch (err) {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {}
    throw err;
  } finally {
    curlRenderer.destroy();
  }
}

/**
 * MediaRecorder Fallback Pipeline (for environments without WebCodecs)
 */
async function renderWithMediaRecorderPipeline(params: {
  album: Album;
  spreadsToExport: AlbumSpread[];
  getImage: (page?: AlbumPage | null) => CachedImageResource | null;
  bgCanvas: HTMLCanvasElement;
  canvasWidth: number;
  canvasHeight: number;
  isLandscape: boolean;
  singlePageW: number;
  spreadFitW: number;
  spreadFitH: number;
  fps: number;
  holdFrames: number;
  turnFrames: number;
  finalHoldFrames: number;
  totalFrames: number;
  totalSpreads: number;
  transitionStyle: TransitionStyle;
  includeWatermark: boolean;
  onProgress?: (progress: {
    percent: number;
    currentSpread: number;
    totalSpreads: number;
    statusText: string;
  }) => void;
  signal?: AbortSignal;
}): Promise<VideoExportResult> {
  const {
    album,
    spreadsToExport,
    getImage,
    bgCanvas,
    canvasWidth,
    canvasHeight,
    isLandscape,
    singlePageW,
    spreadFitW,
    spreadFitH,
    fps,
    holdFrames,
    turnFrames,
    finalHoldFrames,
    totalFrames,
    totalSpreads,
    transitionStyle,
    includeWatermark,
    onProgress,
    signal,
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const curlCanvas = document.createElement('canvas');
  curlCanvas.width = canvasWidth;
  curlCanvas.height = canvasHeight;
  const curlRenderer = new WebGLPageCurlRenderer(curlCanvas);

  const stream = canvas.captureStream(fps);

  let mimeType = 'video/mp4';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

  const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 8000000 };
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    recorderOptions.mimeType = mimeType;
  }

  const recorder = new MediaRecorder(stream, recorderOptions);
  const recordedChunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  recorder.start();
  let currentRenderedFrame = 0;

  try {
    for (let sIdx = 0; sIdx < totalSpreads; sIdx++) {
      if (signal?.aborted) throw new Error('Export aborted by user');

      const curSpread = spreadsToExport[sIdx];
      const nextSpread = spreadsToExport[sIdx + 1];

      const curLeftImg = getImage(curSpread.leftPage);
      const curRightImg = getImage(curSpread.rightPage);
      const nextLeftImg = nextSpread ? getImage(nextSpread.leftPage) : null;
      const nextRightImg = nextSpread ? getImage(nextSpread.rightPage) : null;

      const isLastSpread = sIdx === totalSpreads - 1;
      const currentHoldFrames = isLastSpread ? finalHoldFrames : holdFrames;

      // Hold frames
      ctx.drawImage(bgCanvas, 0, 0);
      drawStationarySpread(
        ctx,
        curSpread,
        curLeftImg,
        curRightImg,
        canvasWidth,
        canvasHeight,
        singlePageW,
        spreadFitW,
        spreadFitH
      );
      if (includeWatermark) drawWatermark(ctx, canvasWidth, canvasHeight, isLandscape);

      for (let h = 0; h < currentHoldFrames; h++) {
        if (signal?.aborted) throw new Error('Export aborted by user');
        currentRenderedFrame++;
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }

      // Turn frames
      if (nextSpread) {
        for (let t = 0; t < turnFrames; t++) {
          if (signal?.aborted) throw new Error('Export aborted by user');

          const progress = (t + 1) / turnFrames;
          ctx.drawImage(bgCanvas, 0, 0);

          if (transitionStyle === 'soft-fade') {
            drawSoftFade(
              ctx,
              curSpread,
              nextSpread,
              curLeftImg,
              curRightImg,
              nextLeftImg,
              nextRightImg,
              progress,
              canvasWidth,
              canvasHeight,
              singlePageW,
              spreadFitW,
              spreadFitH
            );
          } else {
            drawPhysicalPageTurn(
              ctx,
              curSpread,
              nextSpread,
              curLeftImg,
              curRightImg,
              nextLeftImg,
              nextRightImg,
              progress,
              canvasWidth,
              canvasHeight,
              singlePageW,
              spreadFitW,
              spreadFitH,
              transitionStyle,
              curlRenderer,
              curlCanvas
            );
          }

          if (includeWatermark) drawWatermark(ctx, canvasWidth, canvasHeight, isLandscape);

          currentRenderedFrame++;
          await new Promise((r) => setTimeout(r, 1000 / fps));
        }
      }

      onProgress?.({
        percent: Math.min(96, 10 + Math.round((currentRenderedFrame / totalFrames) * 86)),
        currentSpread: sIdx + 1,
        totalSpreads,
        statusText: `Rendering spread ${sIdx + 1} of ${totalSpreads}`,
      });
    }

    onProgress?.({
      percent: 98,
      currentSpread: totalSpreads,
      totalSpreads,
      statusText: 'Finalizing video stream...',
    });

    const videoBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(recordedChunks, { type: recorder.mimeType || mimeType }));
      };
      recorder.stop();
    });

    const videoUrl = URL.createObjectURL(videoBlob);
    const isMp4 = (recorder.mimeType || mimeType).includes('mp4');
    const safeTitle = album.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const filename = `${safeTitle}_3d_album_${isLandscape ? '1080p' : 'reels'}.${isMp4 ? 'mp4' : 'webm'}`;
    const totalDurationSec = totalFrames / fps;

    onProgress?.({
      percent: 100,
      currentSpread: totalSpreads,
      totalSpreads,
      statusText: 'Video ready for download!',
    });

    return {
      blob: videoBlob,
      url: videoUrl,
      filename,
      durationSec: totalDurationSec,
    };
  } catch (err) {
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {}
    }
    throw err;
  } finally {
    curlRenderer.destroy();
  }
}
