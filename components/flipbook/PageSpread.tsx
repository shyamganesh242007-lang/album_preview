import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { AlbumSpread } from '@/utils/spreadBuilder';
import { Correction, AlbumPage } from '@/types/album';
import {
  PhysicalPageTurnStage,
  PhysicalPageTurnStageRef,
} from './PhysicalPageTurnStage';

interface PageSpreadProps {
  spread: AlbumSpread;
  nextSpread?: AlbumSpread;
  prevSpread?: AlbumSpread;
  corrections: Correction[];
  selectedCorrectionId?: string | null;
  onPageClickToPin?: (pageId: string, x: number, y: number) => void;
  onPinClick?: (correction: Correction) => void;
  isPinningActive?: boolean;
  canCreateCorrections?: boolean;
  isZoomed?: boolean;
  onSpreadChange?: (newIndex: number) => void;
  turnStageRef?: React.Ref<PhysicalPageTurnStageRef>;
  masterSpreadAspectRatio?: number;
}

export const PageSpread: React.FC<PageSpreadProps> = ({
  spread,
  nextSpread,
  prevSpread,
  corrections,
  selectedCorrectionId,
  onPageClickToPin,
  onPinClick,
  isPinningActive = true,
  canCreateCorrections = false,
  isZoomed = false,
  onSpreadChange,
  turnStageRef,
  masterSpreadAspectRatio,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure parent viewport container dimensions
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ w: rect.width, h: rect.height });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Determine Spread Mode
  const isFrontCover = Boolean(spread.isCover);
  const isBackCover = Boolean(spread.isBackCover);
  const isInsideTwoPageSpread = !isFrontCover && !isBackCover && Boolean(spread.leftPage && spread.rightPage);

  // Reference Pages
  const coverPage: AlbumPage | undefined = isFrontCover ? (spread.rightPage || spread.leftPage) : undefined;
  const backCoverPage: AlbumPage | undefined = isBackCover ? (spread.leftPage || spread.rightPage) : undefined;

  // Invariant aspect ratio across all spreads (Front Cover, Inside Spreads, Back Cover)
  // Strictly eliminates container resizing, layout shifts, and pop-up/down jumps
  const aspectRatio = useMemo(() => {
    if (masterSpreadAspectRatio && masterSpreadAspectRatio > 0) {
      return masterSpreadAspectRatio;
    }
    return 2.0;
  }, [masterSpreadAspectRatio]);

  // Compute exact pixel dimensions that maximize viewport while strictly preserving aspect ratio
  const { fitWidth, fitHeight } = useMemo(() => {
    if (!viewportSize.w || !viewportSize.h) {
      return { fitWidth: undefined, fitHeight: undefined };
    }
    const paddingX = 40;
    const paddingY = 36;
    const availW = Math.max(260, viewportSize.w - paddingX);
    const availH = Math.max(200, viewportSize.h - paddingY);

    let w = availW;
    let h = availW / aspectRatio;

    if (h > availH) {
      h = availH;
      w = availH * aspectRatio;
    }

    return {
      fitWidth: Math.round(w),
      fitHeight: Math.round(h),
    };
  }, [viewportSize.w, viewportSize.h, aspectRatio]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center w-full h-full select-none"
    >
      {fitWidth && fitHeight && (
        <PhysicalPageTurnStage
          ref={turnStageRef}
          currentSpread={spread}
          nextSpread={nextSpread}
          prevSpread={prevSpread}
          corrections={corrections}
          selectedCorrectionId={selectedCorrectionId}
          onPageClickToPin={canCreateCorrections ? onPageClickToPin : undefined}
          onPinClick={onPinClick}
          isPinningActive={isPinningActive}
          canCreateCorrections={canCreateCorrections}
          fitWidth={fitWidth}
          fitHeight={fitHeight}
          isZoomed={isZoomed}
          onSpreadChange={onSpreadChange || (() => {})}
        />
      )}
    </div>
  );
};
