'use client';

import React, { useState } from 'react';
import { Correction, AlbumPage } from '@/types/album';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, Trash2, User, Calendar } from 'lucide-react';

interface CorrectionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  correction: Correction | null;
  pages: AlbumPage[];
  onToggleResolve?: (id: string, currentStatus: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const CorrectionDetailsModal: React.FC<CorrectionDetailsModalProps> = ({
  isOpen,
  onClose,
  correction,
  pages,
  onToggleResolve,
  onDelete,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  if (!correction) return null;

  const page = pages.find((p) => p.id === correction.pageId);
  const pageNumber = page ? page.order : 1;
  const isResolved = correction.status === 'Resolved';

  const handleResolveClick = async () => {
    if (!onToggleResolve) return;
    try {
      setIsUpdating(true);
      await onToggleResolve(correction.id, correction.status);
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!onDelete) return;
    if (confirm('Are you sure you want to delete this customer correction note?')) {
      try {
        setIsUpdating(true);
        await onDelete(correction.id);
        onClose();
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Correction Note (Page ${pageNumber})`}
      description="Customer retouching request & proofing details"
      maxWidth="md"
    >
      <div className="space-y-4 pt-1">
        {/* Header Metadata Banner */}
        <div className="flex items-center justify-between p-3 bg-[#0d101a] border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200 bg-slate-800 border border-slate-700/80 px-2 py-0.5 rounded text-xs shadow-2xs">
              Page {pageNumber}
            </span>
            <span className="font-semibold text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded text-xs border border-purple-800/40">
              {correction.category}
            </span>
          </div>
          <Badge variant={isResolved ? 'resolved' : 'open'}>
            {correction.status}
          </Badge>
        </div>

        {/* Client Request Content Box */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Customer Request
          </label>
          <div className="p-3.5 bg-purple-950/20 border border-purple-900/30 rounded-xl text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
            {correction.comment}
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 bg-[#0d101a]/80 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Submitted by</p>
              <p className="font-semibold text-slate-200">{correction.author || 'Client'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Timestamp</p>
              <p className="font-semibold text-slate-200">
                {new Date(correction.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls for Studio */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={isUpdating}
                className="p-2 text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                title="Delete note"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isUpdating}>
              Close
            </Button>

            {onToggleResolve && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleResolveClick}
                isLoading={isUpdating}
                className={
                  isResolved
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                }
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {isResolved ? 'Reopen Correction' : 'Mark as Resolved'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
