import { AlbumSpread } from '@/utils/spreadBuilder';
import { perfLogger } from './perfLogger';

/**
 * High-performance client-side image cache and preload manager.
 * - Stores decoded images in memory for instant painting when changing spreads.
 * - Enforces an LRU bound (default: 40 images) to eliminate memory leaks.
 * - Non-blockingly preloads adjacent spreads (current, +1, -1, +2, -2).
 */
class ClientImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private pending = new Map<string, Promise<HTMLImageElement>>();
  private readonly maxEntries = 40;

  /**
   * Checks if an image URL is already in cache and decoded.
   */
  isCached(url?: string | null): boolean {
    if (!url) return false;
    return this.cache.has(url);
  }

  /**
   * Synchronously retrieves a cached HTMLImageElement if available.
   */
  getImage(url?: string | null): HTMLImageElement | null {
    if (!url) return null;
    return this.cache.get(url) || null;
  }

  /**
   * Preloads and decodes an image URL, caching the decoded result.
   */
  async preloadImage(url?: string | null): Promise<HTMLImageElement | null> {
    if (!url) return null;

    // Cache hit
    if (this.cache.has(url)) {
      perfLogger.log('image cache HIT', { url: url.slice(-30) });
      const img = this.cache.get(url)!;
      // Refresh LRU order
      this.cache.delete(url);
      this.cache.set(url, img);
      return img;
    }

    // In-flight request de-duplication
    if (this.pending.has(url)) {
      return this.pending.get(url)!;
    }

    const t0 = perfLogger.mark('image preload');
    perfLogger.log('image cache MISS', { url: url.slice(-30) });

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const cleanup = () => {
        this.pending.delete(url);
      };

      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch {
          // Decode error or unsupported; image is still loaded
        }
        cleanup();
        this.set(url, img);
        perfLogger.measure('first visible image fetch/decode duration', t0, {
          url: url.slice(-30),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        resolve(img);
      };

      img.onerror = (err) => {
        cleanup();
        reject(err);
      };

      img.src = url;
    });

    this.pending.set(url, promise);
    return promise;
  }

  /**
   * Stores an image element in cache, maintaining LRU bounds.
   */
  private set(url: string, img: HTMLImageElement) {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(url, img);
  }

  /**
   * Preloads all images for a given spread.
   */
  async preloadSpread(spread?: AlbumSpread | null): Promise<void> {
    if (!spread) return;

    const urls: string[] = [];
    if (spread.leftPage?.previewUrl) urls.push(spread.leftPage.previewUrl);
    if (spread.rightPage?.previewUrl) urls.push(spread.rightPage.previewUrl);

    if (urls.length > 0) {
      await Promise.all(urls.map((u) => this.preloadImage(u).catch(() => null)));
    }
  }

  /**
   * Explicitly ensures and awaits that all images for a destination spread
   * are fully loaded and decoded in browser GPU/memory before any physical turn begins.
   * Completely eliminates blank/white flash during page turns.
   */
  async ensureSpreadReady(spread?: AlbumSpread | null): Promise<boolean> {
    if (!spread) return true;

    const urls: string[] = [];
    const getUrl = (p?: { previewUrl?: string; imageUrl?: string } | null) =>
      p?.previewUrl || p?.imageUrl;
    const uL = getUrl(spread.leftPage);
    const uR = getUrl(spread.rightPage);
    if (uL) urls.push(uL);
    if (uR) urls.push(uR);

    if (urls.length === 0) return true;

    // Fast check: all URLs already in cache and decoded
    if (urls.every((u) => this.isCached(u))) return true;

    try {
      const results = await Promise.all(urls.map((u) => this.preloadImage(u)));
      return results.every((img) => img !== null && img.naturalWidth > 0);
    } catch {
      return false;
    }
  }

  /**
   * Preloads adjacent spreads around the current spread index.
   * Priority 1: Current spread (0 distance)
   * Priority 2: Next spread (+1) and Prev spread (-1)
   * Priority 3: Background preload (+2, -2)
   */
  preloadAdjacentSpreads(spreads: AlbumSpread[], currentIndex: number): void {
    if (!spreads || spreads.length === 0) return;

    // 1. Current spread (immediate priority)
    this.preloadSpread(spreads[currentIndex]);

    // 2. Next (+1) and Prev (-1) immediately after
    const immediateIndices = [currentIndex + 1, currentIndex - 1].filter(
      (idx) => idx >= 0 && idx < spreads.length
    );
    immediateIndices.forEach((idx) => {
      this.preloadSpread(spreads[idx]);
    });

    // 3. Background preload (+2, -2) using non-blocking microtask or idle
    const bgIndices = [currentIndex + 2, currentIndex - 2].filter(
      (idx) => idx >= 0 && idx < spreads.length
    );

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        bgIndices.forEach((idx) => this.preloadSpread(spreads[idx]));
      });
    } else {
      setTimeout(() => {
        bgIndices.forEach((idx) => this.preloadSpread(spreads[idx]));
      }, 100);
    }
  }

  /**
   * Clears the in-memory cache (e.g. on full album re-upload)
   */
  clear() {
    this.cache.clear();
    this.pending.clear();
  }
}

export const imageCache = new ClientImageCache();
