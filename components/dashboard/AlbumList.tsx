import React from 'react';
import Link from 'next/link';
import { Album } from '@/types/album';
import { Badge, getStatusBadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BookOpen, ExternalLink, Trash2, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface AlbumListProps {
  albums: Album[];
  loading: boolean;
  onDeleteAlbum: (id: string, title: string) => void;
  onCreateClick: () => void;
  onLoadDemo?: () => void;
}

export const AlbumList: React.FC<AlbumListProps> = ({
  albums,
  loading,
  onDeleteAlbum,
  onCreateClick,
  onLoadDemo,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-[#111522] rounded-xl border border-slate-800 p-5">
            <div className="h-4 bg-slate-800 rounded w-3/4 mb-3"></div>
            <div className="h-3 bg-slate-800/60 rounded w-1/2 mb-6"></div>
            <div className="h-28 bg-slate-800/40 rounded mb-4"></div>
            <div className="h-8 bg-slate-800 rounded w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="bg-[#111522] border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-md my-8">
        <div className="h-16 w-16 bg-purple-950/40 text-purple-400 border border-purple-800/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpen className="h-8 w-8 stroke-[1.75]" />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-2">No albums created yet</h3>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Create your first wedding album proof to upload panoramic spreads, review pages, share with your clients, and collect precision pin corrections.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={onCreateClick} variant="primary" size="md">
            Create Your First Album
          </Button>
          {onLoadDemo && (
            <Button onClick={onLoadDemo} variant="outline" size="md">
              Load Demo Wedding Album
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {albums.map((album) => {
        const pageCount = album.pages?.length || 0;
        const totalCorrections = album.corrections?.length || 0;
        const openCorrections = album.corrections?.filter((c) => c.status === 'Open').length || 0;

        return (
          <div
            key={album.id}
            className="bg-[#111522] border border-slate-800/90 rounded-xl hover:border-slate-700 transition-all flex flex-col justify-between overflow-hidden shadow-md hover:shadow-lg shadow-black/40 group"
          >
            {/* Top section */}
            <div className="p-5 border-b border-slate-800/80">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="font-semibold text-slate-100 group-hover:text-purple-400 transition-colors line-clamp-1">
                  {album.title}
                </h4>
                {album.status === 'Approved' ? (
                  <div className="flex flex-col items-end">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      Approved by Client
                    </span>
                    {album.approvedAt && (
                      <span className="text-[11px] text-emerald-400 font-medium mt-1">
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
                  </div>
                ) : (
                  <Badge variant={getStatusBadgeVariant(album.status)}>
                    {album.status}
                  </Badge>
                )}
              </div>

              <p className="text-xs text-slate-400 font-medium">
                Client: <span className="text-slate-200">{album.clientName}</span>
              </p>

              {album.clientEmail && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{album.clientEmail}</p>
              )}
            </div>

            {/* Metrics preview */}
            <div className="px-5 py-4 bg-[#0d101a]/70 flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5" title={`${pageCount} Pages`}>
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  <strong className="text-slate-200">{pageCount}</strong> {pageCount === 1 ? 'page' : 'pages'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {openCorrections > 0 ? (
                  <span className="flex items-center gap-1 text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {openCorrections} open
                  </span>
                ) : totalCorrections > 0 ? (
                  <span className="flex items-center gap-1 text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                    <CheckCircle2 className="h-3 w-3" />
                    All resolved
                  </span>
                ) : (
                  <span className="text-slate-500">0 corrections</span>
                )}
              </div>

              <div className="flex items-center gap-1 text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                <span>{new Date(album.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Actions footer */}
            <div className="p-4 bg-[#111522] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Link href={`/album/${album.id}`} className="flex-1">
                  <Button variant="primary" size="sm" className="w-full">
                    Studio Proof
                  </Button>
                </Link>

                <Link href={`/review/${album.id}`} target="_blank" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    Client Review
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => onDeleteAlbum(album.id, album.title)}
                title="Delete album"
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
