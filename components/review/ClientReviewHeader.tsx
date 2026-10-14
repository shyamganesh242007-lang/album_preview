import React from 'react';
import { Album, AlbumStatus } from '@/types/album';
import { Badge, getStatusBadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, AlertOctagon, Heart, BookOpen } from 'lucide-react';

interface ClientReviewHeaderProps {
  album: Album;
  onRequestChanges: () => void;
  onApproveAlbum: () => void;
  isSubmitting?: boolean;
}

export const ClientReviewHeader: React.FC<ClientReviewHeaderProps> = ({
  album,
  onRequestChanges,
  onApproveAlbum,
  isSubmitting = false,
}) => {
  const isApproved = album.status === 'Approved';

  return (
    <header className="bg-[#0b0e17]/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
          {/* Left: Branding & Album Greeting */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-purple-950/50">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 leading-tight">
                  {album.title}
                </h1>
                <Badge variant={getStatusBadgeVariant(album.status)}>
                  {album.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Wedding Album Proof for{' '}
                <span className="font-semibold text-slate-200">{album.clientName}</span>
                {album.approvedAt && (
                  <span className="ml-1 text-emerald-400 font-medium">
                    • Approved on {new Date(album.approvedAt).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right: Review Approval Actions */}
          <div className="flex items-center gap-2.5">
            {isApproved ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Album Approved & Finalized</span>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="md"
                  onClick={onRequestChanges}
                  disabled={isSubmitting}
                  className="text-amber-300 border-amber-800/60 hover:bg-amber-950/30"
                >
                  <AlertOctagon className="h-4 w-4 mr-1 text-amber-400" />
                  Request Changes
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={onApproveAlbum}
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve Album
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
