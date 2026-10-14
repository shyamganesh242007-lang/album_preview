import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { processImageFile } from '@/utils/imageProcessing';
import { processPdfFile, PdfProcessProgress } from '@/utils/pdfProcessor';
import { AlbumPage } from '@/types/album';
import { perfLogger } from '@/utils/perfLogger';

export type UploadMode = 'replace-full-album' | 'replace-version' | 'add-images' | 'initial';

interface UploadDropzoneProps {
  albumId: string;
  currentPageCount: number;
  mode?: UploadMode;
  onReplaceFullAlbum?: (
    pages: AlbumPage[],
    detectedSourceType: 'images' | 'pdf'
  ) => Promise<void>;
  onAddMoreImages?: (pages: AlbumPage[]) => Promise<void>;
  onPagesUploaded?: (
    pages: AlbumPage[],
    isFullAlbum: boolean,
    detectedSourceType: 'images' | 'pdf'
  ) => Promise<void>;
  onClose?: () => void;
}

interface UploadTask {
  id: string;
  filename: string;
  size: number;
  progress: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  message?: string;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  albumId,
  currentPageCount,
  onReplaceFullAlbum,
  onAddMoreImages,
  onPagesUploaded,
  mode = 'initial',
  onClose,
}) => {
  const isAddImagesMode = mode === 'add-images';
  const [isDragging, setIsDragging] = useState(false);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [markFirstAsCover, setMarkFirstAsCover] = useState(true);
  const [markLastAsBackCover, setMarkLastAsBackCover] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    if (isAddImagesMode) {
      const hasPdf = Array.from(fileList).some(
        (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
      );
      if (hasPdf) {
        alert('PDF files cannot be added via Add More Images. Only JPG, JPEG, and PNG images are allowed.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    const files = Array.from(fileList).filter((f) => {
      const ext = f.name.toLowerCase();
      const isImg =
        ext.endsWith('.jpg') ||
        ext.endsWith('.jpeg') ||
        ext.endsWith('.png') ||
        f.type === 'image/jpeg' ||
        f.type === 'image/png';
      return isAddImagesMode ? isImg : isImg || ext.endsWith('.pdf') || f.type === 'application/pdf';
    });

    if (files.length === 0) {
      alert(isAddImagesMode ? 'Please upload JPG or PNG images.' : 'Please upload JPG, JPEG, PNG, or PDF files.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Natural alphanumeric sort so page1, page2, ... page10 stay in correct sequence
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const newTasks: UploadTask[] = files.map((f, i) => ({
      id: `task_${Date.now()}_${i}`,
      filename: f.name,
      size: f.size,
      progress: 0,
      status: 'pending',
    }));

    setTasks((prev) => [...prev, ...newTasks]);
    setIsProcessing(true);

    const isFullAlbum = !isAddImagesMode;

    const detectedSourceType: 'images' | 'pdf' = isAddImagesMode
      ? 'images'
      : files.some((f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
      ? 'pdf'
      : 'images';

    const tUploadStart = perfLogger.mark('upload-processing');
    const results: AlbumPage[][] = new Array(files.length);

    // Controlled concurrency worker pool (concurrency = 3)
    const CONCURRENCY = Math.min(3, files.length);
    let nextIndex = 0;

    const processFileIndex = async (i: number) => {
      const file = files[i];
      const taskId = newTasks[i].id;

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'processing', progress: 30 } : t))
      );

      try {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          const pages = await processPdfFile(
            file,
            albumId,
            1, // order will be sequentially assigned across all pages
            {
              markFirstAsCover,
              markLastAsBackCover,
            },
            (progress: PdfProcessProgress) => {
              const pct = Math.round((progress.currentPage / progress.totalPages) * 100);
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        progress: pct,
                        message: progress.status,
                      }
                    : t
                )
              );
            }
          );
          results[i] = pages;
        } else {
          // Automatic Role Determination:
          // 1. Cover: First page of album or marked cover (always SINGLE)
          // 2. Back Cover: Last page of album or marked back/final (always SINGLE)
          // 3. Middle Pages: Automatically split if wide spread, single if normal
          let isCover = false;
          let isBackCover = false;

          const lowerName = file.name.toLowerCase();
          const nameHasCover = lowerName.includes('cover') && !lowerName.includes('back');
          const nameHasBack =
            lowerName.includes('back') || lowerName.includes('final') || lowerName.includes('end');

          if (!isAddImagesMode && isFullAlbum) {
            if (files.length === 1) {
              // Single image in empty album: treated as Cover unless named back
              isCover = !nameHasBack && markFirstAsCover;
              isBackCover = nameHasBack && markLastAsBackCover;
            } else {
              if (i === 0 && markFirstAsCover) {
                isCover = true;
              } else if (i === files.length - 1 && markLastAsBackCover) {
                isBackCover = true;
              } else if (nameHasBack) {
                isBackCover = true;
              } else if (nameHasCover) {
                isCover = true;
              }
            }
          } else {
            // Incremental single image added to an existing album
            if (nameHasCover) {
              isCover = true;
            } else if (nameHasBack) {
              isBackCover = true;
            }
          }

          const pages = await processImageFile(
            file,
            albumId,
            1, // order will be sequentially normalized
            {
              isCover,
              isBackCover,
              sourcePageIndex: i,
              sourcePageNumber: i + 1,
            },
            (stepMsg) => {
              const pct = stepMsg.includes('Uploading')
                ? 70
                : stepMsg.includes('Generating')
                ? 45
                : stepMsg.includes('Splitting')
                ? 25
                : 15;
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        message: `${stepMsg} (${i + 1}/${files.length})`,
                        progress: pct,
                      }
                    : t
                )
              );
            }
          );
          results[i] = pages;
        }

        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'done',
                  progress: 100,
                  message: `Page ${i + 1} of ${files.length} complete`,
                }
              : t
          )
        );
      } catch (err) {
        console.error('Error processing file:', file.name, err);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'error',
                  message: err instanceof Error ? err.message : 'Processing failed',
                }
              : t
          )
        );
      }
    };

    // Run workers concurrently
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (nextIndex < files.length) {
        const i = nextIndex++;
        await processFileIndex(i);
      }
    });

    await Promise.all(workers);
    perfLogger.measure('upload processing completed', tUploadStart, { files: files.length });

    // Flatten and assign strict sequential page order
    const generatedPages: AlbumPage[] = [];
    let currentOrder = isAddImagesMode ? currentPageCount + 1 : 1;
    for (const pageGroup of results) {
      if (pageGroup) {
        for (const p of pageGroup) {
          p.order = currentOrder++;
          generatedPages.push(p);
        }
      }
    }

    if (generatedPages.length > 0) {
      const tDbSave = perfLogger.mark('database-save');
      // Update task summary so the user knows database save is finalizing
      setTasks((prev) =>
        prev.map((t) => ({ ...t, message: 'Saving album to cloud database...' }))
      );

      if (isAddImagesMode) {
        if (onAddMoreImages) {
          await onAddMoreImages(generatedPages);
        } else if (onPagesUploaded) {
          await onPagesUploaded(generatedPages, false, 'images');
        }
      } else {
        if (onReplaceFullAlbum) {
          await onReplaceFullAlbum(generatedPages, detectedSourceType);
        } else if (onPagesUploaded) {
          await onPagesUploaded(generatedPages, true, detectedSourceType);
        }
      }

      perfLogger.measure('database save completed', tDbSave, {
        pages: generatedPages.length,
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsProcessing(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="bg-[#111522] border border-slate-800 rounded-xl p-6 shadow-md">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            {isAddImagesMode
              ? 'Add More Images'
              : mode === 'replace-version'
              ? 'Upload New Version (PDF)'
              : 'Upload Album Pages & Spreads'}
          </h3>
          <p className="text-xs text-slate-400">
            {isAddImagesMode
              ? 'Select JPG or PNG photos to append to this album. Existing pages and corrections remain untouched.'
              : mode === 'replace-version'
              ? 'Upload a corrected multi-page PDF to replace the current album version in place. Customer corrections and album link are preserved.'
              : 'JPG, PNG, or multi-page PDF to replace the current album pages in place. Spreads are automatically detected. Customer corrections and review links are preserved.'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Drag & drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-purple-500 bg-purple-950/25 ring-2 ring-purple-500/20'
            : 'border-slate-700/80 hover:border-slate-600 bg-[#0d101a]/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={
            isAddImagesMode
              ? '.jpg,.jpeg,.png,image/jpeg,image/png'
              : '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'
          }
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
            }
          }}
        />

        <div className="h-12 w-12 bg-[#161b2a] rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs border border-slate-700 text-purple-400">
          <UploadCloud className="h-6 w-6" />
        </div>

        <p className="text-sm font-semibold text-slate-200">
          Drag & drop album files here, or <span className="text-purple-400 underline">browse</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isAddImagesMode
            ? 'Supports high-resolution JPG and PNG photos'
            : 'Supports high-resolution JPG, PNG, and PDF album exports'}
        </p>

        {!isAddImagesMode && (
          <div
            className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="inline-flex items-center gap-2 bg-[#111522] px-3 py-1.5 rounded-lg border border-slate-700/80 cursor-pointer shadow-sm hover:border-slate-600">
              <input
                type="checkbox"
                id="markCover"
                checked={markFirstAsCover}
                onChange={(e) => setMarkFirstAsCover(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700"
              />
              <span className="font-medium text-slate-300">First PDF page as Front Cover (Single)</span>
            </label>
            <label className="inline-flex items-center gap-2 bg-[#111522] px-3 py-1.5 rounded-lg border border-slate-700/80 cursor-pointer shadow-sm hover:border-slate-600">
              <input
                type="checkbox"
                id="markBackCover"
                checked={markLastAsBackCover}
                onChange={(e) => setMarkLastAsBackCover(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700"
              />
              <span className="font-medium text-slate-300">Last PDF page as Back Cover (Single)</span>
            </label>
          </div>
        )}

        {isAddImagesMode ? (
          <p className="text-[11px] text-purple-300 bg-purple-950/40 border border-purple-800/40 rounded-md py-1 px-2.5 mt-3 inline-block">
            New images will be appended after existing pages. All existing pages and customer corrections remain intact.
          </p>
        ) : currentPageCount > 0 ? (
          <p className="text-[11px] text-purple-300 bg-purple-950/40 border border-purple-800/40 rounded-md py-1 px-2.5 mt-3 inline-block">
            Re-uploading replaces album pages with this new version. All customer corrections and review links are permanently preserved.
          </p>
        ) : null}
      </div>

      {/* Queue Progress List with Overall Summary */}
      {tasks.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <span>Overall Progress</span>
            <span className="font-semibold text-purple-400">
              {tasks.filter((t) => t.status === 'done').length} / {tasks.length} files complete
            </span>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-3 rounded-lg bg-[#0d101a] border border-slate-800/80 text-xs"
            >
              <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                {task.filename.toLowerCase().endsWith('.pdf') ? (
                  <FileText className="h-4 w-4 text-rose-400 shrink-0" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />
                )}
                <div className="truncate">
                  <p className="font-medium text-slate-200 truncate">{task.filename}</p>
                  <p className="text-[11px] text-slate-400">
                    {(task.size / (1024 * 1024)).toFixed(2)} MB • {task.message || task.status}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {task.status === 'processing' && (
                  <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-purple-600 h-1.5 transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
                {task.status === 'done' && (
                  <span className="flex items-center text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Ready
                  </span>
                )}
                {task.status === 'error' && (
                  <span className="flex items-center text-rose-400 font-medium">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Failed
                  </span>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
};
