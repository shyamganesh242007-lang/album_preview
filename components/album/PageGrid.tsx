import React from 'react';
import { AlbumPage } from '@/types/album';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { Trash2, Eye } from 'lucide-react';

interface PageGridProps {
  pages: AlbumPage[];
  onSelectPage: (page: AlbumPage, index: number) => void;
  onDeletePage?: (pageId: string, page: AlbumPage) => void;
  allowDelete?: boolean;
}

const PageThumbnail: React.FC<{
  page: AlbumPage;
  index: number;
  onSelect: (page: AlbumPage, index: number) => void;
  onDelete?: (page: AlbumPage) => void;
  allowDelete?: boolean;
}> = ({ page, index, onSelect, onDelete, allowDelete = false }) => {
  const hasPreviewUrl = Boolean(page.previewUrl);
  const { url: localUrl, loading: localLoading } = useBlobUrl(hasPreviewUrl ? null : page.blobId);
  const displayUrl = page.previewUrl || localUrl;
  const loading = !displayUrl && (hasPreviewUrl ? false : localLoading);

  return (
    <div className="bg-[#111522] rounded-xl border border-slate-800 overflow-hidden shadow-sm hover:border-slate-700 transition-all group flex flex-col">
      <div
        className="relative aspect-4/3 bg-[#0d101a] flex items-center justify-center cursor-pointer overflow-hidden"
        onClick={() => onSelect(page, index)}
      >
        {loading ? (
          <div className="animate-pulse bg-slate-800 w-full h-full" />
        ) : displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={`Page ${page.order}`}
            className="w-full h-full object-contain p-1 group-hover:scale-102 transition-transform duration-200"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-slate-500">Image unavailable</span>
        )}

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
          <button
            type="button"
            className="p-2 bg-slate-800 text-slate-200 rounded-lg shadow-sm hover:bg-purple-600 hover:text-white transition-colors"
            title="Inspect in Flipbook"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(page, index);
            }}
          >
            <Eye className="h-4 w-4" />
          </button>

          {allowDelete && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Are you sure you want to delete Page ${page.order}? This will remove the page from the album.`)) {
                  onDelete(page);
                }
              }}
              className="p-2 bg-slate-800 text-slate-200 rounded-lg shadow-sm hover:bg-rose-600 hover:text-white transition-colors"
              title="Delete page"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Page Order Badge */}
        <div className="absolute top-2 left-2">
          <span className="bg-slate-950/85 backdrop-blur-xs text-white text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm border border-slate-800/60">
            Page {page.order}
          </span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-2.5 bg-[#111522] flex items-center justify-between text-xs border-t border-slate-800/80">
        <span
          className="text-slate-300 font-medium truncate max-w-[130px]"
          title={page.filename || `Page ${page.order}`}
        >
          {page.filename || `Page ${page.order}`}
        </span>
        <span className="shrink-0">
          {(page.side === 'cover' || page.side === 'front_cover') && (
            <span className="text-[10px] font-semibold text-purple-300 bg-purple-950/40 border border-purple-800/40 px-1.5 py-0.5 rounded">
              Cover
            </span>
          )}
          {(page.side === 'back-cover' || page.side === 'back_cover') && (
            <span className="text-[10px] font-semibold text-violet-300 bg-violet-950/40 border border-violet-800/40 px-1.5 py-0.5 rounded">
              Back Cover
            </span>
          )}
          {page.side === 'left' && (
            <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/40 border border-sky-800/40 px-1.5 py-0.5 rounded">
              Left
            </span>
          )}
          {page.side === 'right' && (
            <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
              Right
            </span>
          )}
          {page.side === 'single' && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/50 px-1.5 py-0.5 rounded">
              Single
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

export const PageGrid: React.FC<PageGridProps> = ({
  pages,
  onSelectPage,
  onDeletePage,
  allowDelete = false,
}) => {
  if (pages.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-sm">No pages in this album yet. Upload pages using the button above.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {pages.map((page, index) => (
        <PageThumbnail
          key={page.id}
          page={page}
          index={index}
          allowDelete={allowDelete}
          onSelect={onSelectPage}
          onDelete={onDeletePage ? (p) => onDeletePage(p.id, p) : undefined}
        />
      ))}
    </div>
  );
};
