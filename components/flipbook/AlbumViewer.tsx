import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlbumPage, Correction } from '@/types/album';
import { buildAlbumSpreads } from '@/utils/spreadBuilder';
import { PageSpread } from './PageSpread';
import { PageFlipControls } from './PageFlipControls';
import { ZoomPanContainer } from './ZoomPanContainer';
import { PhysicalPageTurnStageRef } from './PhysicalPageTurnStage';
import { imageCache } from '@/utils/imageCache';
import { perfLogger } from '@/utils/perfLogger';

interface AlbumViewerProps {
  pages: AlbumPage[];
  corrections: Correction[];
  selectedCorrectionId?: string | null;
  initialSpreadIndex?: number;
  activeSpreadIndex?: number;
  onSpreadChange?: (newIndex: number) => void;
  onPageClickToPin?: (pageId: string, x: number, y: number) => void;
  onPinClick?: (correction: Correction) => void;
  canCreateCorrections?: boolean;
  readOnly?: boolean;
}

export const AlbumViewer: React.FC<AlbumViewerProps> = ({
  pages,
  corrections,
  selectedCorrectionId,
  initialSpreadIndex,
  activeSpreadIndex,
  onSpreadChange,
  onPageClickToPin,
  onPinClick,
  canCreateCorrections = false,
  readOnly = false,
}) => {
  const spreads = useMemo(() => buildAlbumSpreads(pages), [pages]);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(() => {
    const start = activeSpreadIndex ?? initialSpreadIndex ?? 0;
    return Math.max(0, Math.min(Math.max(spreads.length - 1, 0), start));
  });
  const [zoom, setZoom] = useState<number>(1);
  const [isPinningActive, setIsPinningActive] = useState(canCreateCorrections);
  const turnStageRef = useRef<PhysicalPageTurnStageRef>(null);

  const effectivePinningActive = Boolean(canCreateCorrections && isPinningActive && !readOnly);

  // Synchronize when activeSpreadIndex prop updates externally (e.g. clicked View on a page in PageGrid)
  useEffect(() => {
    if (activeSpreadIndex !== undefined && spreads.length > 0) {
      const validIndex = Math.max(0, Math.min(spreads.length - 1, activeSpreadIndex));
      if (validIndex !== currentSpreadIndex) {
        setCurrentSpreadIndex(validIndex);
      }
    }
  }, [activeSpreadIndex, spreads.length]);

  // Ensure currentSpreadIndex stays in bounds if pages/spreads count changes
  useEffect(() => {
    if (spreads.length > 0 && currentSpreadIndex >= spreads.length) {
      const adjusted = spreads.length - 1;
      setCurrentSpreadIndex(adjusted);
      onSpreadChange?.(adjusted);
    }
  }, [spreads.length, currentSpreadIndex, onSpreadChange]);

  // Compute master inside spread aspect ratio across the album to guarantee
  // invariant album stage dimensions across all spreads without any jumping or resizing
  const masterSpreadAspectRatio = useMemo(() => {
    const insideTwoPage = spreads.find(
      (s) => !s.isCover && !s.isBackCover && s.leftPage && s.rightPage
    );
    if (insideTwoPage?.leftPage && insideTwoPage?.rightPage) {
      const wL = insideTwoPage.leftPage.previewWidth || insideTwoPage.leftPage.width || 1200;
      const hL = insideTwoPage.leftPage.previewHeight || insideTwoPage.leftPage.height || 800;
      const wR = insideTwoPage.rightPage.previewWidth || insideTwoPage.rightPage.width || 1200;
      const hR = insideTwoPage.rightPage.previewHeight || insideTwoPage.rightPage.height || 800;
      const ratio = (wL + wR) / Math.max(hL, hR);
      if (ratio > 0.5 && ratio < 4.0) return Number(ratio.toFixed(3));
    }
    return 2.0;
  }, [spreads]);

  // Preload current spread and adjacent spreads (+1, -1, +2, -2) for instant swiping
  useEffect(() => {
    if (!spreads.length) return;
    const tPreload = perfLogger.mark('preload-spreads');
    imageCache.preloadAdjacentSpreads(spreads, currentSpreadIndex);
    perfLogger.measure('adjacent spreads preload initiated', tPreload, {
      currentIndex: currentSpreadIndex,
      totalSpreads: spreads.length,
    });
  }, [spreads, currentSpreadIndex]);

  // Auto navigate to spread containing the selected correction
  // Resolves stored page reference against CURRENT album by logical page_number
  useEffect(() => {
    if (!selectedCorrectionId) return;
    const targetCorr = corrections.find((c) => c.id === selectedCorrectionId);
    if (!targetCorr) return;

    const spreadIndex = spreads.findIndex((s) => {
      if (s.leftPage?.id === targetCorr.pageId || s.rightPage?.id === targetCorr.pageId) {
        return true;
      }
      if (targetCorr.pageNumber) {
        return (
          s.leftPage?.order === targetCorr.pageNumber ||
          s.rightPage?.order === targetCorr.pageNumber
        );
      }
      return false;
    });

    if (spreadIndex !== -1 && spreadIndex !== currentSpreadIndex) {
      setCurrentSpreadIndex(spreadIndex);
      onSpreadChange?.(spreadIndex);
    }
  }, [selectedCorrectionId, corrections, spreads, currentSpreadIndex, onSpreadChange]);

  const handleSpreadChange = useCallback((newIndex: number) => {
    const valid = Math.max(0, Math.min(spreads.length - 1, newIndex));
    setCurrentSpreadIndex(valid);
    onSpreadChange?.(valid);
  }, [spreads.length, onSpreadChange]);

  const handleNext = useCallback(() => {
    if (currentSpreadIndex < spreads.length - 1) {
      if (turnStageRef.current?.isTurning()) return;
      const turned = turnStageRef.current?.turnNext();
      if (!turned && !turnStageRef.current) {
        const nextIdx = Math.min(spreads.length - 1, currentSpreadIndex + 1);
        setCurrentSpreadIndex(nextIdx);
        onSpreadChange?.(nextIdx);
      }
    }
  }, [currentSpreadIndex, spreads.length, onSpreadChange]);

  const handlePrev = useCallback(() => {
    if (currentSpreadIndex > 0) {
      if (turnStageRef.current?.isTurning()) return;
      const turned = turnStageRef.current?.turnPrev();
      if (!turned && !turnStageRef.current) {
        const prevIdx = Math.max(0, currentSpreadIndex - 1);
        setCurrentSpreadIndex(prevIdx);
        onSpreadChange?.(prevIdx);
      }
    }
  }, [currentSpreadIndex, onSpreadChange]);

  const handleFirst = useCallback(() => {
    if (turnStageRef.current?.isTurning()) return;
    if (currentSpreadIndex !== 0) {
      setCurrentSpreadIndex(0);
      onSpreadChange?.(0);
    }
  }, [currentSpreadIndex, onSpreadChange]);

  const handleLast = useCallback(() => {
    if (turnStageRef.current?.isTurning()) return;
    if (currentSpreadIndex !== spreads.length - 1) {
      const lastIdx = spreads.length - 1;
      setCurrentSpreadIndex(lastIdx);
      onSpreadChange?.(lastIdx);
    }
  }, [currentSpreadIndex, spreads.length, onSpreadChange]);

  // Keyboard navigation triggers the realistic 3D physical page turn
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleFirst();
      } else if (e.key === 'End') {
        e.preventDefault();
        handleLast();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleFirst, handleLast]);

  if (spreads.length === 0) {
    return (
      <div className="bg-[#111522] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
        <p className="text-sm font-medium">No pages have been uploaded to this album yet.</p>
      </div>
    );
  }

  const currentSpread = spreads[currentSpreadIndex] || spreads[0];
  const nextSpread = spreads[currentSpreadIndex + 1];
  const prevSpread = spreads[currentSpreadIndex - 1];

  return (
    <div className="flex flex-col gap-4 w-full h-full select-none">
      {/* Physical Album Spread Viewport with Smooth Zoom & Pan */}
      <div className="relative w-full h-[68vh] min-h-[480px] bg-radial-[ellipse_at_center] from-[#141826] via-[#0d1018] to-[#06080e] rounded-2xl border border-slate-800/90 shadow-[inset_0_2px_14px_rgba(0,0,0,0.8)] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        <ZoomPanContainer onZoomChange={setZoom}>
          <PageSpread
            spread={currentSpread}
            nextSpread={nextSpread}
            prevSpread={prevSpread}
            corrections={corrections}
            selectedCorrectionId={selectedCorrectionId}
            onPageClickToPin={canCreateCorrections ? onPageClickToPin : undefined}
            onPinClick={onPinClick}
            isPinningActive={effectivePinningActive}
            canCreateCorrections={canCreateCorrections}
            isZoomed={zoom > 1}
            onSpreadChange={handleSpreadChange}
            turnStageRef={turnStageRef}
            masterSpreadAspectRatio={masterSpreadAspectRatio}
          />
        </ZoomPanContainer>
      </div>

      {/* Controls toolbar */}
      <PageFlipControls
        currentIndex={currentSpreadIndex}
        totalSpreads={spreads.length}
        currentLabel={currentSpread.label}
        onFirst={handleFirst}
        onPrev={handlePrev}
        onNext={handleNext}
        onLast={handleLast}
        isPinningActive={effectivePinningActive}
        onTogglePinning={() => setIsPinningActive(!isPinningActive)}
        canCreateCorrections={canCreateCorrections}
        readOnly={readOnly}
      />
    </div>
  );
};
