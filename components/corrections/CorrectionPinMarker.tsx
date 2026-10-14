import React from 'react';
import { Correction } from '@/types/album';
import { Check, MessageSquare, AlertCircle } from 'lucide-react';

interface CorrectionPinMarkerProps {
  correction: Correction;
  index: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  readOnly?: boolean;
  style?: React.CSSProperties;
}

export const CorrectionPinMarker: React.FC<CorrectionPinMarkerProps> = ({
  correction,
  index,
  isSelected,
  onClick,
  style,
}) => {
  const isResolved = correction.status === 'Resolved';

  return (
    <button
      type="button"
      style={{
        left: `${correction.x * 100}%`,
        top: `${correction.y * 100}%`,
        ...style,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group bg-transparent border-0 p-0 text-left"
      title={`Correction Pin #${index + 1}: [${correction.category}] ${correction.comment}`}
      aria-label={`Correction pin #${index + 1}`}
      data-testid="correction-pin"
    >
      {/* Outer Pulse ring when selected */}
      {isSelected && (
        <span className="absolute -inset-2 rounded-full bg-purple-500/30 animate-ping pointer-events-none" />
      )}

      {/* Pin Badge */}
      <div
        className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shadow-md transition-all duration-200 border-2 ${
          isSelected
            ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-slate-950 scale-125 z-30'
            : 'group-hover:scale-115'
        } ${
          isResolved
            ? 'bg-emerald-500 border-white text-white'
            : 'bg-amber-500 border-white text-white'
        }`}
      >
        {isResolved ? (
          <Check className="h-3 w-3 stroke-[3]" />
        ) : (
          <span>{index + 1}</span>
        )}
      </div>

      {/* Micro-hover preview tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30">
        <div className="bg-slate-950/95 text-white text-[11px] px-2.5 py-1 rounded shadow-lg max-w-[200px] text-center whitespace-normal leading-tight backdrop-blur-xs border border-slate-800">
          <span className="font-semibold block text-purple-300">{correction.category}</span>
          <span className="line-clamp-2">{correction.comment}</span>
        </div>
        <div className="w-2 h-2 bg-slate-950/95 rotate-45 -mt-1 border-r border-b border-slate-800" />
      </div>
    </button>
  );
};
