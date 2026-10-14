import React, { useState, useEffect } from 'react';
import { Correction, CorrectionCategory } from '@/types/album';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MessageSquare, Trash2, CheckCircle2 } from 'lucide-react';

const CATEGORIES: CorrectionCategory[] = [
  'Photo Correction',
  'Text Correction',
  'Design Correction',
  'Color Correction',
  'Layout Correction',
  'Other',
];

interface AddCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageNumber: number;
  initialCorrection?: Correction | null;
  onSubmit: (category: CorrectionCategory, comment: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onToggleResolve?: () => Promise<void>;
}

export const AddCorrectionModal: React.FC<AddCorrectionModalProps> = ({
  isOpen,
  onClose,
  pageNumber,
  initialCorrection,
  onSubmit,
  onDelete,
  onToggleResolve,
}) => {
  const [category, setCategory] = useState<CorrectionCategory>('Photo Correction');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialCorrection) {
      setCategory(initialCorrection.category);
      setComment(initialCorrection.comment);
    } else {
      setCategory('Photo Correction');
      setComment('');
    }
  }, [initialCorrection, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      await onSubmit(category || 'Photo Correction', comment.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = Boolean(initialCorrection);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Correction on Page ${pageNumber}` : `Add Correction Pin (Page ${pageNumber})`}
      description="Pinpoint the exact retouching or correction detail requested."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Category
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-2 text-xs font-medium rounded-lg text-left border transition-all ${
                  category === cat
                    ? 'border-purple-500 bg-purple-950/40 text-purple-300 ring-1 ring-purple-500/60'
                    : 'border-slate-800 bg-[#0d101a] text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Correction Details & Instructions
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Please soften the glare on groom's lapel, or swap with shot #402..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[#0d101a] border border-slate-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100 resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div>
            {isEditing && (
              <div className="flex items-center gap-1">
                {onDelete && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('Delete this correction pin?')) {
                        await onDelete();
                        onClose();
                      }
                    }}
                    className="p-2 text-rose-400 hover:bg-rose-950/30 rounded-md transition-colors"
                    title="Delete Pin"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {onToggleResolve && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onToggleResolve();
                      onClose();
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors ${
                      initialCorrection?.status === 'Resolved'
                        ? 'border-amber-800/40 text-amber-300 bg-amber-950/30 hover:bg-amber-950/50'
                        : 'border-emerald-800/40 text-emerald-300 bg-emerald-950/30 hover:bg-emerald-950/50'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {initialCorrection?.status === 'Resolved' ? 'Mark Open' : 'Mark Resolved'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              {isEditing ? 'Save Changes' : 'Place Pin'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
