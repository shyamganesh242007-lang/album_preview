import React, { useState } from 'react';
import { Correction, AlbumPage } from '@/types/album';
import { Badge } from '@/components/ui/Badge';
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Eye,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface CorrectionListPanelProps {
  corrections: Correction[];
  pages: AlbumPage[];
  selectedCorrectionId?: string | null;
  onSelectCorrection: (correction: Correction) => void;
  onEditCorrection?: (correction: Correction) => void;
  onDeleteCorrection?: (correctionId: string) => void;
  onToggleResolve?: (correctionId: string, currentStatus: string) => void;
  canResolveCorrections?: boolean;
  canCreateCorrections?: boolean;
  readOnly?: boolean;
}

export const CorrectionListPanel: React.FC<CorrectionListPanelProps> = ({
  corrections,
  pages,
  selectedCorrectionId,
  onSelectCorrection,
  onEditCorrection,
  onDeleteCorrection,
  onToggleResolve,
  canResolveCorrections = true,
  canCreateCorrections = false,
  readOnly = false,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'Open' | 'Resolved'>('ALL');

  // Map pageId to human-readable page order
  const pageMap = new Map<string, number>();
  pages.forEach((p) => {
    pageMap.set(p.id, p.order);
  });

  const filteredCorrections = corrections.filter((c) => {
    if (filter === 'ALL') return true;
    return c.status === filter;
  });

  const openCount = corrections.filter((c) => c.status === 'Open').length;
  const resolvedCount = corrections.filter((c) => c.status === 'Resolved').length;

  return (
    <div className="bg-[#111522] border border-slate-800 rounded-xl flex flex-col h-full shadow-md overflow-hidden">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-800 bg-[#0d101a]/70">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Correction Notes ({corrections.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {openCount} pending
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#0d101a] p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors ${
              filter === 'ALL'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({corrections.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('Open')}
            className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors ${
              filter === 'Open'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('Resolved')}
            className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors ${
              filter === 'Resolved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredCorrections.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500">
            <p className="text-xs leading-relaxed">
              {corrections.length === 0
                ? canCreateCorrections
                  ? 'No corrections yet. Click on any photo to drop a pin and request changes.'
                  : 'No customer corrections yet. Pins placed by clients during review will appear here.'
                : 'No corrections matching this filter.'}
            </p>
          </div>
        ) : (
          filteredCorrections.map((corr, idx) => {
            const pageNumber = corr.pageNumber ?? pageMap.get(corr.pageId) ?? 1;
            const isSelected = corr.id === selectedCorrectionId;
            const isResolved = corr.status === 'Resolved';

            return (
              <div
                key={corr.id}
                onClick={() => onSelectCorrection(corr)}
                className={`p-3 rounded-lg border transition-all cursor-pointer text-xs ${
                  isSelected
                    ? 'border-purple-500 bg-purple-950/20 ring-1 ring-purple-500/60 shadow-xs'
                    : 'border-slate-800/90 bg-[#0d101a] hover:border-slate-700 hover:bg-[#141826]'
                }`}
              >
                {/* Meta Row: Page Number & Status & Category */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                      Page {pageNumber}
                    </span>
                    <span className="font-semibold text-purple-300 bg-purple-950/50 px-1.5 py-0.5 rounded text-[10px] border border-purple-800/40">
                      {corr.category}
                    </span>
                  </div>

                  <Badge variant={isResolved ? 'resolved' : 'open'}>
                    {corr.status}
                  </Badge>
                </div>

                {/* Comment Text */}
                <p className="text-slate-200 text-xs leading-relaxed mb-2 font-normal">
                  {corr.comment}
                </p>

                {/* Actions Row */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-500">
                  <span>{new Date(corr.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Only Studio can resolve corrections */}
                    {canResolveCorrections && onToggleResolve && !readOnly && (
                      <button
                        type="button"
                        onClick={() => onToggleResolve(corr.id, corr.status)}
                        className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                          isResolved ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'
                        }`}
                        title={isResolved ? 'Mark as Open' : 'Mark as Resolved'}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {onEditCorrection && !readOnly && (
                      <button
                        type="button"
                        onClick={() => onEditCorrection(corr)}
                        className="p-1 rounded text-slate-500 hover:text-purple-400 hover:bg-slate-800 transition-colors"
                        title={isResolved ? 'View Details' : 'Edit Correction'}
                      >
                        {isResolved ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <Edit2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    {onDeleteCorrection && !readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Delete this correction note?')) {
                            onDeleteCorrection(corr.id);
                          }
                        }}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Correction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
