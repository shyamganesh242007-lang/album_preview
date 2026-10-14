import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface ApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  albumTitle: string;
  clientName: string;
  openCorrectionsCount: number;
  onConfirmApprove: () => Promise<void>;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  isOpen,
  onClose,
  albumTitle,
  clientName,
  openCorrectionsCount,
  onConfirmApprove,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirmApprove();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Wedding Album Design"
      maxWidth="md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-emerald-950/25 rounded-xl border border-emerald-800/40 text-emerald-300 text-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <p>
            You are approving the layout and pages for <strong>{albumTitle}</strong>.
          </p>
        </div>

        {openCorrectionsCount > 0 && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-950/25 rounded-xl border border-amber-800/40 text-amber-300 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Note: You have <strong>{openCorrectionsCount} open correction notes</strong>. Approving will signal to the studio that the album is ready for print production.
            </p>
          </div>
        )}

        <p className="text-xs text-slate-300 leading-relaxed">
          Please verify that you have flipped through all spreads and inspected details. Once confirmed, your approval timestamp will be recorded.
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800/80">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50"
          >
            Confirm & Approve Album
          </Button>
        </div>
      </div>
    </Modal>
  );
};
