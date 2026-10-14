import React, { useState, useEffect } from 'react';
import { AlbumPage } from '@/types/album';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { ArrowUp, ArrowDown, Trash2, GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface PageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: AlbumPage[];
  onSaveOrder: (reorderedPages: AlbumPage[]) => Promise<void>;
  onDeletePage: (pageId: string) => Promise<void>;
  allowDelete?: boolean;
}

const PageRow: React.FC<{
  page: AlbumPage;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  allowDelete?: boolean;
}> = ({ page, index, total, onMoveUp, onMoveDown, onDelete, allowDelete = true }) => {
  const hasPreviewUrl = Boolean(page.previewUrl);
  const { url: localUrl } = useBlobUrl(hasPreviewUrl ? null : page.blobId);
  const displayUrl = page.previewUrl || localUrl;

  return (
    <div className="flex items-center justify-between p-3 bg-[#0d101a] border border-slate-800/90 rounded-lg hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-slate-600" />
        <div className="h-12 w-16 bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-slate-800 shrink-0">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt={`Page ${index + 1}`} className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-500">P.{index + 1}</span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-200">Page {index + 1}</span>
            <Badge variant={page.side === 'cover' || page.side === 'front_cover' || page.side === 'back-cover' || page.side === 'back_cover' ? 'blue' : 'neutral'}>
              {page.side === 'back-cover' || page.side === 'back_cover'
                ? 'Back Cover'
                : page.side === 'cover' || page.side === 'front_cover'
                ? 'Cover'
                : page.side === 'left'
                ? 'Left'
                : page.side === 'right'
                ? 'Right'
                : 'Single'}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
            {page.filename || `Page ID: ${page.id.substring(0, 10)}...`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={index === 0}
          onClick={onMoveUp}
          className="p-1.5 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move Earlier"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="p-1.5 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move Later"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        {allowDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 ml-2"
            title="Delete Page"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export const PageManagerModal: React.FC<PageManagerModalProps> = ({
  isOpen,
  onClose,
  pages,
  onSaveOrder,
  onDeletePage,
  allowDelete = true,
}) => {
  const [reorderedList, setReorderedList] = useState<AlbumPage[]>(pages);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setReorderedList(pages);
  }, [pages]);

  const movePage = (fromIndex: number, toIndex: number) => {
    const list = [...reorderedList];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    setReorderedList(list);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSaveOrder(reorderedList);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Album Pages"
      description="Reorder album pages, change layout sequencing, or remove unneeded pages."
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {reorderedList.map((page, idx) => (
            <PageRow
              key={page.id}
              page={page}
              index={idx}
              total={reorderedList.length}
              allowDelete={allowDelete}
              onMoveUp={() => movePage(idx, idx - 1)}
              onMoveDown={() => movePage(idx, idx + 1)}
              onDelete={async () => {
                if (confirm(`Are you sure you want to delete Page ${idx + 1}?`)) {
                  await onDeletePage(page.id);
                }
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <span className="text-xs text-slate-400 font-medium">
            Total {reorderedList.length} {reorderedList.length === 1 ? 'page' : 'pages'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="md" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleSave} isLoading={isSaving}>
              Save Sequence
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
