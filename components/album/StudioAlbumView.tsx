'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlbum } from '@/hooks/useAlbum';
import { AlbumHeader } from '@/components/album/AlbumHeader';
import { UploadDropzone } from '@/components/album/UploadDropzone';
import { PageGrid } from '@/components/album/PageGrid';
import { PageManagerModal } from '@/components/album/PageManagerModal';
import { VideoExporterModal } from '@/components/album/VideoExporterModal';
import { AlbumViewer } from '@/components/flipbook/AlbumViewer';
import { CorrectionListPanel } from '@/components/corrections/CorrectionListPanel';
import { CorrectionDetailsModal } from '@/components/corrections/CorrectionDetailsModal';
import { Correction, AlbumPage } from '@/types/album';
import { buildAlbumSpreads } from '@/utils/spreadBuilder';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface StudioAlbumViewProps {
  albumId: string;
}

export function StudioAlbumView({ albumId }: StudioAlbumViewProps) {
  const router = useRouter();

  const {
    album,
    loading,
    error,
    addPages,
    replaceAlbumPages,
    updatePageOrder,
    deletePage,
    deleteCorrection,
    resolveCorrection,
    updateStatus,
  } = useAlbum(albumId, 'studio');

  const [activeView, setActiveView] = useState<'flipbook' | 'grid'>('flipbook');
  const [activeSpreadIndex, setActiveSpreadIndex] = useState<number>(0);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'replace-full-album' | 'replace-version' | 'add-images' | 'initial'>('initial');
  const [isPageManagerOpen, setIsPageManagerOpen] = useState(false);
  const [isVideoExportOpen, setIsVideoExportOpen] = useState(false);

  // Studio can inspect existing corrections and resolve them (NO pin creation)
  const [inspectingCorrection, setInspectingCorrection] = useState<Correction | null>(null);
  const [selectedCorrectionId, setSelectedCorrectionId] = useState<string | null>(null);

  const handleSelectPage = (page: AlbumPage) => {
    if (!album) return;
    const spreads = buildAlbumSpreads(album.pages);
    const targetSpreadIndex = spreads.findIndex(
      (s) =>
        s.leftPage?.id === page.id ||
        s.rightPage?.id === page.id ||
        s.leftPage?.order === page.order ||
        s.rightPage?.order === page.order
    );
    if (targetSpreadIndex !== -1) {
      setActiveSpreadIndex(targetSpreadIndex);
    }
    setActiveView('flipbook');
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      await deletePage(pageId);
    } catch (err) {
      console.error('Failed to delete page:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete page');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Loading album proof...</p>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-6">
        <div className="bg-[#111522] border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-md">
          <div className="h-12 w-12 bg-red-950/30 text-red-400 rounded-xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-1">Album Not Found</h2>
          <p className="text-xs text-slate-400 mb-6">
            {error || 'The requested album does not exist in your local storage library.'}
          </p>
          <Button variant="primary" size="md" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const isPdfAlbum =
    album.sourceType === 'pdf' ||
    (!album.sourceType && album.pages.some((p) => p.filename?.toLowerCase().includes('.pdf')));
  const isImageAlbum = !isPdfAlbum;

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col">
      {/* Studio Header */}
      <AlbumHeader
        album={album}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenUpload={() => {
          setUploadMode('replace-full-album');
          setIsUploadOpen(true);
        }}
        onOpenPageManager={() => setIsPageManagerOpen(true)}
        onOpenVideoExport={() => setIsVideoExportOpen(true)}
        onStatusChange={async (newStatus) => {
          await updateStatus(newStatus);
        }}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {album.pages.length === 0 ? (
          /* Empty Album State: Prompt for upload */
          <div className="max-w-2xl mx-auto my-8">
            <UploadDropzone
              albumId={album.id}
              currentPageCount={album.pages.length}
              mode="initial"
              onReplaceFullAlbum={async (newPages, detectedSourceType) => {
                await replaceAlbumPages(newPages, detectedSourceType);
                setIsUploadOpen(false);
              }}
              onAddMoreImages={async (newPages) => {
                await addPages(newPages, 'images');
                setIsUploadOpen(false);
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Album Viewer / Flipbook or Grid */}
            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
              {activeView === 'flipbook' ? (
                <AlbumViewer
                  pages={album.pages}
                  corrections={album.corrections}
                  selectedCorrectionId={selectedCorrectionId}
                  activeSpreadIndex={activeSpreadIndex}
                  onSpreadChange={setActiveSpreadIndex}
                  canCreateCorrections={false}
                  onPinClick={(corr) => {
                    setSelectedCorrectionId(corr.id);
                    setInspectingCorrection(corr);
                  }}
                />
              ) : (
                <div className="bg-[#111522] p-6 rounded-2xl border border-slate-800 shadow-md">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-slate-100">
                      All Album Pages ({album.pages.length})
                    </h3>
                    {isImageAlbum ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUploadMode('add-images');
                          setIsUploadOpen(true);
                        }}
                      >
                        Add More Images
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUploadMode('replace-version');
                          setIsUploadOpen(true);
                        }}
                      >
                        Upload New Version
                      </Button>
                    )}
                  </div>
                  <PageGrid
                    pages={album.pages}
                    allowDelete={isImageAlbum}
                    onSelectPage={handleSelectPage}
                    onDeletePage={isImageAlbum ? handleDeletePage : undefined}
                  />
                </div>
              )}
            </div>

            {/* Right: Correction Notes Panel */}
            <div className="lg:col-span-4 xl:col-span-3 h-[75vh]">
              <CorrectionListPanel
                corrections={album.corrections}
                pages={album.pages}
                selectedCorrectionId={selectedCorrectionId}
                canResolveCorrections={true}
                canCreateCorrections={false}
                onSelectCorrection={(corr) => setSelectedCorrectionId(corr.id)}
                onEditCorrection={(corr) => {
                  setSelectedCorrectionId(corr.id);
                  setInspectingCorrection(corr);
                }}
                onDeleteCorrection={(id) => deleteCorrection(id)}
                onToggleResolve={(id, status) => resolveCorrection(id, status !== 'Resolved')}
              />
            </div>
          </div>
        )}
      </main>

      {/* Upload Modal (if triggered via header button or Add More Images / Upload New Version) */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title={
          uploadMode === 'add-images'
            ? 'Add More Images'
            : uploadMode === 'replace-version'
            ? 'Upload New Version (PDF)'
            : 'Upload Album Pages & Spreads'
        }
        maxWidth="2xl"
      >
        <UploadDropzone
          albumId={album.id}
          currentPageCount={album.pages.length}
          mode={uploadMode}
          onReplaceFullAlbum={async (newPages, detectedSourceType) => {
            await replaceAlbumPages(newPages, detectedSourceType);
            setIsUploadOpen(false);
          }}
          onAddMoreImages={async (newPages) => {
            await addPages(newPages, 'images');
            setIsUploadOpen(false);
          }}
          onClose={() => setIsUploadOpen(false)}
        />
      </Modal>

      {/* Page Manager Modal (Reorder/Delete) */}
      <PageManagerModal
        isOpen={isPageManagerOpen}
        onClose={() => setIsPageManagerOpen(false)}
        pages={album.pages}
        allowDelete={isImageAlbum}
        onSaveOrder={async (newOrder) => {
          await updatePageOrder(newOrder);
        }}
        onDeletePage={async (id) => {
          if (isImageAlbum) {
            await deletePage(id);
          }
        }}
      />

      {/* Studio Inspection & Resolve Modal (NO pin creation) */}
      <CorrectionDetailsModal
        isOpen={Boolean(inspectingCorrection)}
        onClose={() => setInspectingCorrection(null)}
        correction={inspectingCorrection}
        pages={album.pages}
        onToggleResolve={async (id, currentStatus) => {
          await resolveCorrection(id, currentStatus !== 'Resolved');
        }}
        onDelete={async (id) => {
          await deleteCorrection(id);
        }}
      />

      {/* 3D Flipbook Video Exporter Modal */}
      <VideoExporterModal
        isOpen={isVideoExportOpen}
        onClose={() => setIsVideoExportOpen(false)}
        album={album}
      />
    </div>
  );
}
