import React, { useRef, useState, useEffect } from 'react';
import { AlbumPage, Correction } from '@/types/album';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { CorrectionPinMarker } from './CorrectionPinMarker';
import { imageCache } from '@/utils/imageCache';

interface PageContainerWithPinsProps {
  page: AlbumPage;
  corrections: Correction[];
  selectedCorrectionId?: string | null;
  onPageClickToPin?: (pageId: string, x: number, y: number) => void;
  onPinClick?: (correction: Correction) => void;
  isPinningActive?: boolean;
  canCreateCorrections?: boolean;
  onNaturalDimensions?: (width: number, height: number) => void;
}

export const PageContainerWithPins: React.FC<PageContainerWithPinsProps> = ({
  page,
  corrections,
  selectedCorrectionId,
  onPageClickToPin,
  onPinClick,
  isPinningActive = true,
  canCreateCorrections = false,
  onNaturalDimensions,
}) => {
  // Client Review displays ONLY optimized WebP preview (from album-previews public bucket or local preview blob)
  const hasPreviewUrl = Boolean(page.previewUrl);
  const { url: localUrl, loading: blobLoading, error: blobError } = useBlobUrl(
    hasPreviewUrl ? null : page.blobId
  );
  const displayUrl = page.previewUrl || localUrl;
  const [isLoaded, setIsLoaded] = useState<boolean>(() => imageCache.isCached(displayUrl));

  useEffect(() => {
    if (displayUrl) {
      if (imageCache.isCached(displayUrl)) {
        setIsLoaded(true);
      } else {
        setIsLoaded(false);
        imageCache.preloadImage(displayUrl).then(() => {
          setIsLoaded(true);
        }).catch(() => {});
      }
    }
  }, [displayUrl]);

  const loading = !isLoaded && (hasPreviewUrl ? false : blobLoading);
  const error = blobError;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Enforce role separation: reject pin creation if viewer cannot create corrections
    if (!canCreateCorrections || !onPageClickToPin || !isPinningActive) return;
    const container = e.currentTarget;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Calculate normalized coordinates clamped between 0.01 and 0.99
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    const x = Math.max(0.01, Math.min(0.99, Number(rawX.toFixed(4))));
    const y = Math.max(0.01, Math.min(0.99, Number(rawY.toFixed(4))));

    onPageClickToPin(page.id, x, y);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`relative w-full h-full select-none overflow-hidden ${
        canCreateCorrections && isPinningActive ? 'cursor-crosshair' : 'cursor-default'
      }`}
    >
      {/* Loading state - only when blobUrl is resolving without a preview */}
      {!displayUrl && blobLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 animate-pulse text-slate-400 text-xs pointer-events-none">
          <span className="tabular-nums font-medium text-slate-400">Loading page {page.order}...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/40 text-red-400 text-xs p-4 text-center">
          Failed to load image
        </div>
      )}

      {/* Actual Page Image (Client WebP Preview) */}
      {displayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={`Page ${page.order}`}
          className="w-full h-full object-fill pointer-events-none select-none block"
          draggable={false}
          onLoad={(e) => {
            setIsLoaded(true);
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              onNaturalDimensions?.(img.naturalWidth, img.naturalHeight);
            }
          }}
        />
      )}

      {/* Render pins on this page (Resolved corrections remain historical records in panel unless explicitly selected) */}
      {corrections
        .filter((c) => c.status !== 'Resolved' || c.id === selectedCorrectionId)
        .map((corr, idx) => (
          <CorrectionPinMarker
            key={corr.id}
            correction={corr}
            index={idx}
            isSelected={corr.id === selectedCorrectionId}
            onClick={() => onPinClick?.(corr)}
          />
        ))}
    </div>
  );
};
