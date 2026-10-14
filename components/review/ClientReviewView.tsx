'use client';

import React, { useState } from 'react';
import { useAlbum } from '@/hooks/useAlbum';
import { ClientReviewHeader } from '@/components/review/ClientReviewHeader';
import { ApprovalDialog } from '@/components/review/ApprovalDialog';
import { AlbumViewer } from '@/components/flipbook/AlbumViewer';
import { CorrectionListPanel } from '@/components/corrections/CorrectionListPanel';
import { AddCorrectionModal } from '@/components/corrections/AddCorrectionModal';
import { CorrectionDetailsModal } from '@/components/corrections/CorrectionDetailsModal';
import { Correction, CorrectionCategory } from '@/types/album';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertCircle, CheckCircle2, MessageSquare } from 'lucide-react';

interface ClientReviewViewProps {
  albumId: string;
}

export function ClientReviewView({ albumId }: ClientReviewViewProps) {
  const {
    album,
    loading,
    error,
    addCorrection,
    updateCorrection,
    deleteCorrection,
    resolveCorrection,
    updateStatus,
  } = useAlbum(albumId, 'client');

  // Approval modals
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [isChangesRequestedSuccessOpen, setIsChangesRequestedSuccessOpen] = useState(false);
  const [isApprovedSuccessOpen, setIsApprovedSuccessOpen] = useState(false);

  // Pin / Correction Modal state
  const [pendingPin, setPendingPin] = useState<{ pageId: string; x: number; y: number } | null>(
    null
  );
  const [activeEditingCorrection, setActiveEditingCorrection] = useState<Correction | null>(null);
  const [inspectingCorrection, setInspectingCorrection] = useState<Correction | null>(null);
  const [selectedCorrectionId, setSelectedCorrectionId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Opening your wedding album proof...</p>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-6 select-none">
        <div className="bg-[#111522] border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-md">
          <div className="h-12 w-12 bg-amber-950/40 text-amber-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-amber-800/40">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-2">Album Proof Not Found</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            This album is no longer available.
            <br />
            The review link may be invalid or the album may have been removed by the studio.
          </p>
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.close();
              }
            }}
            className="text-slate-300 hover:text-white"
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Handle clicking page to drop a pin
  const handlePageClickToPin = (pageId: string, x: number, y: number) => {
    setPendingPin({ pageId, x, y });
  };

  const handleCreateOrUpdateCorrection = async (
    category: CorrectionCategory,
    comment: string
  ) => {
    if (activeEditingCorrection) {
      await updateCorrection(activeEditingCorrection.id, { category, comment });
      setActiveEditingCorrection(null);
    } else if (pendingPin) {
      await addCorrection({
        pageId: pendingPin.pageId,
        x: pendingPin.x,
        y: pendingPin.y,
        category,
        comment,
        author: album.clientName || 'Client',
      });
      setPendingPin(null);
    }
  };

  const handleRequestChanges = async () => {
    await updateStatus('Changes Requested');
    setIsChangesRequestedSuccessOpen(true);
  };

  const handleConfirmApprove = async () => {
    await updateStatus('Approved', Date.now());
    setIsApprovedSuccessOpen(true);
  };

  const openCorrections = album.corrections.filter((c) => c.status === 'Open').length;

  const currentModalPageNumber = pendingPin
    ? album.pages.find((p) => p.id === pendingPin.pageId)?.order || 1
    : activeEditingCorrection
    ? album.pages.find((p) => p.id === activeEditingCorrection.pageId)?.order || 1
    : 1;

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col">
      {/* Client Review Header */}
      <ClientReviewHeader
        album={album}
        onRequestChanges={handleRequestChanges}
        onApproveAlbum={() => setIsApprovalOpen(true)}
      />

      {/* Main Review Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {album.pages.length === 0 ? (
          <div className="bg-[#111522] border border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto my-12 shadow-md">
            <h3 className="text-base font-bold text-slate-100 mb-2">Album pages are being prepared</h3>
            <p className="text-xs text-slate-400">
              Your studio is currently uploading and arranging your album proofs. Please check back shortly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Album Viewer / Flipbook */}
            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
              {/* Client correction guidance badge */}
              <div className="flex items-center justify-between bg-purple-950/30 border border-purple-800/40 rounded-xl px-4 py-2 text-xs text-purple-200">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  <span className="font-semibold text-purple-200">Review & Proofing Mode:</span>
                  <span className="text-purple-300">
                    Click anywhere directly on an album photo to pinpoint and submit retouching requests.
                  </span>
                </div>
              </div>

              <AlbumViewer
                pages={album.pages}
                corrections={album.corrections}
                selectedCorrectionId={selectedCorrectionId}
                canCreateCorrections={true}
                onPageClickToPin={handlePageClickToPin}
                onPinClick={(corr) => {
                  setSelectedCorrectionId(corr.id);
                  if (corr.status === 'Resolved') {
                    setInspectingCorrection(corr);
                  } else {
                    setActiveEditingCorrection(corr);
                  }
                }}
              />
            </div>

            {/* Right: Correction Notes Panel */}
            <div className="lg:col-span-4 xl:col-span-3 h-[75vh]">
              <CorrectionListPanel
                corrections={album.corrections}
                pages={album.pages}
                selectedCorrectionId={selectedCorrectionId}
                canResolveCorrections={false}
                canCreateCorrections={true}
                onSelectCorrection={(corr) => setSelectedCorrectionId(corr.id)}
                onEditCorrection={(corr) => {
                  setSelectedCorrectionId(corr.id);
                  if (corr.status === 'Resolved') {
                    setInspectingCorrection(corr);
                  } else {
                    setActiveEditingCorrection(corr);
                  }
                }}
                onDeleteCorrection={(id) => deleteCorrection(id)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Approval Confirmation Dialog */}
      <ApprovalDialog
        isOpen={isApprovalOpen}
        onClose={() => setIsApprovalOpen(false)}
        albumTitle={album.title}
        clientName={album.clientName}
        openCorrectionsCount={openCorrections}
        onConfirmApprove={handleConfirmApprove}
      />

      {/* Client Add / Edit Open Correction Pin Modal */}
      <AddCorrectionModal
        isOpen={Boolean(pendingPin || activeEditingCorrection)}
        onClose={() => {
          setPendingPin(null);
          setActiveEditingCorrection(null);
        }}
        pageNumber={currentModalPageNumber}
        initialCorrection={activeEditingCorrection}
        onSubmit={handleCreateOrUpdateCorrection}
        onDelete={
          activeEditingCorrection
            ? async () => {
                await deleteCorrection(activeEditingCorrection.id);
                setActiveEditingCorrection(null);
              }
            : undefined
        }
      />

      {/* Client Resolved Correction Inspection Modal (Read-Only) */}
      <CorrectionDetailsModal
        isOpen={Boolean(inspectingCorrection)}
        onClose={() => setInspectingCorrection(null)}
        correction={inspectingCorrection}
        pages={album.pages}
      />

      {/* Changes Requested Notification Modal */}
      <Modal
        isOpen={isChangesRequestedSuccessOpen}
        onClose={() => setIsChangesRequestedSuccessOpen(false)}
        title="Changes Requested"
        maxWidth="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="h-12 w-12 bg-amber-950/40 text-amber-400 border border-amber-800/40 rounded-full flex items-center justify-center mx-auto">
            <MessageSquare className="h-6 w-6" />
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your review status has been set to <strong className="text-slate-100">Changes Requested</strong>. The studio can now see your pins and notes to apply revisions.
          </p>
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setIsChangesRequestedSuccessOpen(false)}
          >
            Got it
          </Button>
        </div>
      </Modal>

      {/* Approved Success Notification Modal */}
      <Modal
        isOpen={isApprovedSuccessOpen}
        onClose={() => setIsApprovedSuccessOpen(false)}
        title="Album Approved!"
        maxWidth="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="h-12 w-12 bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-100">
            Thank you, {album.clientName}!
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your wedding album design is approved and marked for print manufacturing.
          </p>
          <Button
            variant="primary"
            size="md"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
            onClick={() => setIsApprovedSuccessOpen(false)}
          >
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}
