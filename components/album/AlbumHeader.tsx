import React, { useState } from 'react';
import Link from 'next/link';
import { Album, AlbumStatus } from '@/types/album';
import { Badge, getStatusBadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft,
  Share2,
  Upload,
  BookOpen,
  LayoutGrid,
  Check,
  ExternalLink,
  SlidersHorizontal,
  Video,
} from 'lucide-react';

interface AlbumHeaderProps {
  album: Album;
  activeView: 'flipbook' | 'grid';
  onViewChange: (view: 'flipbook' | 'grid') => void;
  onOpenUpload: () => void;
  onOpenPageManager: () => void;
  onOpenVideoExport?: () => void;
  onStatusChange: (status: AlbumStatus) => Promise<void>;
}

export const AlbumHeader: React.FC<AlbumHeaderProps> = ({
  album,
  activeView,
  onViewChange,
  onOpenUpload,
  onOpenPageManager,
  onOpenVideoExport,
  onStatusChange,
}) => {
  const [copied, setCopied] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const copyClientReviewLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/review/${album.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleStatusSelect = async (newStatus: AlbumStatus) => {
    try {
      setIsChangingStatus(true);
      await onStatusChange(newStatus);
    } finally {
      setIsChangingStatus(false);
    }
  };

  return (
    <header className="bg-[#0b0e17]/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between py-3 gap-3">
          {/* Left: Back & Album details */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 leading-tight">
                  {album.title}
                </h1>
                {album.status === 'Approved' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Approved by Client
                  </span>
                ) : (
                  <Badge variant={getStatusBadgeVariant(album.status)}>
                    {album.status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Client: <span className="font-medium text-slate-200">{album.clientName}</span> •{' '}
                {album.pages.length} {album.pages.length === 1 ? 'Page' : 'Pages'} •{' '}
                {album.corrections.filter((c) => c.status === 'Open').length} open corrections
                {album.status === 'Approved' && album.approvedAt && (
                  <span className="ml-1 text-emerald-400 font-medium">
                    • Approved:{' '}
                    {new Date(album.approvedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {', '}
                    {new Date(album.approvedAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {/* View switcher */}
            <div className="flex items-center bg-[#0d101a] p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => onViewChange('flipbook')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'flipbook'
                    ? 'bg-[#181d2e] text-purple-400 shadow-xs border border-purple-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Album Flip
              </button>
              <button
                type="button"
                onClick={() => onViewChange('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === 'grid'
                    ? 'bg-[#181d2e] text-purple-400 shadow-xs border border-purple-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Page Grid
              </button>
            </div>

            {/* Status indicator / Studio workflow select */}
            {album.status === 'Approved' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs font-semibold">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Approved by Client</span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={album.status}
                  disabled={isChangingStatus}
                  onChange={(e) => handleStatusSelect(e.target.value as AlbumStatus)}
                  className="text-xs font-medium bg-[#111522] border border-slate-700/80 text-slate-200 py-1.5 px-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="Draft" className="bg-[#111522] text-slate-200">Draft</option>
                  <option value="In Review" className="bg-[#111522] text-slate-200">In Review</option>
                  <option value="Changes Requested" className="bg-[#111522] text-slate-200">Changes Requested</option>
                  <option value="Changes In Progress" className="bg-[#111522] text-slate-200">Changes In Progress</option>
                  <option value="Ready for Review" className="bg-[#111522] text-slate-200">Ready for Review</option>
                </select>
              </div>
            )}

            {/* Page Manager */}
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenPageManager}
              title="Reorder and manage pages"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Manage Pages
            </Button>

            {/* Upload */}
            <Button variant="outline" size="sm" onClick={onOpenUpload}>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>

            {/* Share / Copy Client link */}
            <Button variant="outline" size="sm" onClick={copyClientReviewLink}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  Share Review Link
                </>
              )}
            </Button>

            {/* Export Video */}
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenVideoExport}
              title="Export 3D Flipbook presentation video"
            >
              <Video className="h-3.5 w-3.5" />
              Export Video
            </Button>

            {/* Direct Open Client Review */}
            <Link href={`/review/${album.id}`} target="_blank">
              <Button variant="primary" size="sm">
                Client View
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
