import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface CreateAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, clientName: string, clientEmail?: string, notes?: string) => Promise<void>;
}

export const CreateAlbumModal: React.FC<CreateAlbumModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Album title is required');
      return;
    }
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(title.trim(), clientName.trim(), clientEmail.trim() || undefined, notes.trim() || undefined);
      // Reset form
      setTitle('');
      setClientName('');
      setClientEmail('');
      setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create album');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Wedding Album"
      description="Set up an album proofing project for your client review workflow."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-950/30 p-3 text-xs text-red-300 border border-red-800/40">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Album Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Elena & Marcus — Villa Rosa Wedding"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[#0d101a] border border-slate-700/80 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Client Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Elena Vance"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[#0d101a] border border-slate-700/80 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Client Email (Optional)
          </label>
          <input
            type="email"
            placeholder="e.g. elena@example.com"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[#0d101a] border border-slate-700/80 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Internal Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. 15x30 flush-mount album, silk cover..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[#0d101a] border border-slate-700/80 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 text-slate-100 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
            Create Album
          </Button>
        </div>
      </form>
    </Modal>
  );
};
