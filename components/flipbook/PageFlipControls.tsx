import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  Eye,
} from 'lucide-react';

interface PageFlipControlsProps {
  currentIndex: number;
  totalSpreads: number;
  currentLabel: string;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  isPinningActive?: boolean;
  onTogglePinning?: () => void;
  canCreateCorrections?: boolean;
  readOnly?: boolean;
}

export const PageFlipControls: React.FC<PageFlipControlsProps> = ({
  currentIndex,
  totalSpreads,
  currentLabel,
  onFirst,
  onPrev,
  onNext,
  onLast,
  isPinningActive = false,
  onTogglePinning,
  canCreateCorrections = false,
  readOnly = false,
}) => {
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= totalSpreads - 1;

  return (
    <div className="flex items-center justify-between bg-[#111522] border border-slate-800 rounded-xl px-4 py-2.5 shadow-md select-none">
      {/* Left: Role-aware pinning indicator or controls */}
      <div className="flex items-center gap-2">
        {canCreateCorrections && !readOnly ? (
          <>
            <button
              type="button"
              id="pin-mode-toggle"
              onClick={onTogglePinning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isPinningActive
                  ? 'bg-purple-600 text-white shadow-xs shadow-purple-950/50'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{isPinningActive ? 'Pin Mode Active' : 'Enable Pin Mode'}</span>
            </button>

            <div className="hidden md:flex items-center text-[11px] font-medium gap-1 ml-2">
              {isPinningActive ? (
                <span className="text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-800/40">
                  Click anywhere on photo to place correction pin
                </span>
              ) : (
                <span className="text-slate-400">Click Enable Pin Mode to drop pins</span>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span className="px-2.5 py-1 bg-slate-800/60 text-slate-300 rounded-lg text-[11px] font-medium border border-slate-700/60 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-purple-400" />
              Studio Proof Mode
            </span>
          </div>
        )}
      </div>

      {/* Middle: Spread Navigation Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onFirst}
          disabled={isFirst}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="First Page (Home)"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous Spread (Left Arrow)"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Page / Spread Badge */}
        <div className="px-3 py-1 bg-[#0d101a] border border-slate-800 rounded-md text-xs font-semibold text-slate-200 min-w-[130px] text-center">
          {currentLabel} <span className="text-slate-500 font-normal">({currentIndex + 1}/{totalSpreads})</span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next Spread (Right Arrow)"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={onLast}
          disabled={isLast}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Last Page (End)"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      {/* Right: Keyboard Shortcut hint */}
      <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
        <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 text-[10px]">←</kbd>
        <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 text-[10px]">→</kbd>
        <span>to flip</span>
      </div>
    </div>
  );
};
