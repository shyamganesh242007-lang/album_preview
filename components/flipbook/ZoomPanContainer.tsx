import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface ZoomPanContainerProps {
  children: React.ReactNode;
  disabled?: boolean;
  onZoomChange?: (zoom: number) => void;
}

export const ZoomPanContainer: React.FC<ZoomPanContainerProps> = ({
  children,
  disabled = false,
  onZoomChange,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(1.0, Number((prev - 0.25).toFixed(2)));
      if (next === 1.0) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((prev) => {
        const next = Math.max(1.0, Math.min(3.0, Number((prev + delta).toFixed(2))));
        if (next === 1.0) setPan({ x: 0, y: 0 });
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Mouse drag panning when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 || disabled) return;
    // Only drag with left mouse button
    if (e.button !== 0) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Limit maximum pan based on zoom
    const maxPanX = (zoom - 1) * 450;
    const maxPanY = (zoom - 1) * 350;

    const newX = Math.max(-maxPanX, Math.min(maxPanX, dragStartRef.current.panX + dx));
    const newY = Math.max(-maxPanY, Math.min(maxPanY, dragStartRef.current.panY + dy));

    setPan({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center select-none ${
        zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
    >
      {/* Zoomed Content wrapper */}
      <div
        className={`flex items-center justify-center w-full h-full ${
          zoom > 1 && !isDragging ? 'transition-transform duration-100 ease-out' : ''
        }`}
        style={{
          transform: zoom > 1 ? `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})` : 'none',
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>

      {/* Floating Zoom Controls Bar */}
      <div
        className="absolute bottom-4 right-4 z-40 bg-[#111522]/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-md px-2 py-1.5 flex items-center gap-1.5 text-xs text-slate-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 1}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom Out (Ctrl -)"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span className="font-semibold text-slate-200 text-[11px] w-12 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= 3.0}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom In (Ctrl +)"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {zoom > 1 && (
          <>
            <div className="h-3.5 w-px bg-slate-800 mx-0.5" />
            <button
              type="button"
              onClick={handleReset}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
};
