import { Album, AlbumPage, AlbumStatus, Correction, AlbumSourceType } from '@/types/album';
import { AlbumStorage, UploadPagePreviewParams, UploadPagePreviewResult } from './storageInterface';
import { supabase, isSupabaseConfigured } from '@/services/supabase/client';
import { indexedDBStorage } from './indexedDbStorage';
import { perfLogger } from '@/utils/perfLogger';
import { imageCache } from '@/utils/imageCache';

function encodeNotesWithSourceType(
  notes: string | null | undefined,
  sourceType: 'images' | 'pdf' | undefined
): string | null {
  const cleanNotes = (notes || '').replace(/<!--sourceType:(images|pdf)-->\s*/g, '').trim();
  if (!sourceType) return cleanNotes || null;
  const tag = `<!--sourceType:${sourceType}-->`;
  return cleanNotes ? `${tag}\n${cleanNotes}` : tag;
}

function parseNotesSourceType(notes: string | null | undefined): 'images' | 'pdf' | undefined {
  if (!notes) return undefined;
  const match = notes.match(/<!--sourceType:(images|pdf)-->/);
  return match ? (match[1] as 'images' | 'pdf') : undefined;
}

function cleanNotesForDisplay(notes: string | null | undefined): string | undefined {
  if (!notes) return undefined;
  const cleaned = notes.replace(/<!--sourceType:(images|pdf)-->\s*/g, '').trim();
  return cleaned || undefined;
}

export class SupabaseStorage implements AlbumStorage {
  private memoryBlobCache = new Map<string, Blob>();

  /**
   * Generates a stable UUID or ID for albums and pages
   */
  private generateId(prefix?: string): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const rand = Math.random().toString(36).substring(2, 9);
    return prefix ? `${prefix}_${Date.now()}_${rand}` : `${Date.now()}_${rand}`;
  }

  async createAlbum(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    const id = this.generateId('album');
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. Please verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local'
      );
    }

    try {
      const encodedNotes = encodeNotesWithSourceType(data.notes, data.sourceType);
      const { error: albumError } = await supabase.from('albums').insert({
        id,
        title: data.title,
        client_name: data.clientName,
        client_email: data.clientEmail || null,
        status: data.status || 'Draft',
        notes: encodedNotes,
        approved_at: data.approvedAt ? new Date(data.approvedAt).toISOString() : null,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (albumError) {
        console.error('[SupabaseStorage] albums insert error:', albumError);
        throw new Error(
          `[Supabase Error] Failed to create album in remote database: ${albumError.message} (code: ${albumError.code})`
        );
      }

      // Insert pages if provided
      if (data.pages && data.pages.length > 0) {
        const pageRows = data.pages.map((p, idx) => ({
          id: p.id || this.generateId('page'),
          album_id: id,
          page_number: p.order || idx + 1,
          page_type: p.side || 'single',
          preview_storage_path: p.previewStoragePath || null,
          preview_url: p.previewUrl || null,
          preview_width: p.previewWidth || p.width || 0,
          preview_height: p.previewHeight || p.height || 0,
          preview_size_bytes: p.previewSizeBytes || null,
          // Compatibility fields for legacy columns
          image_path: p.previewStoragePath || `pages/${p.blobId}.webp`,
          image_url: p.previewUrl || null,
          blob_id: p.blobId || null,
          width: p.previewWidth || p.width || 0,
          height: p.previewHeight || p.height || 0,
          filename: p.filename || null,
        }));

        const { error: pagesError } = await supabase.from('album_pages').insert(pageRows);
        if (pagesError) {
          console.error('[SupabaseStorage] album_pages insert error:', pagesError);
          throw new Error(
            `[Supabase Error] Failed to insert album pages: ${pagesError.message} (code: ${pagesError.code})`
          );
        }
      }

      const createdAlbum: Album = {
        ...data,
        id,
        pages: data.pages || [],
        corrections: data.corrections || [],
        createdAt: now,
        updatedAt: now,
        approvedAt: data.approvedAt || null,
      };

      // Mirror locally in IndexedDB as read cache
      indexedDBStorage.updateAlbum(id, createdAlbum).catch(() => {});

      return createdAlbum;
    } catch (err) {
      console.error('[SupabaseStorage] createAlbum exception:', err);
      throw err;
    }
  }

  async getAlbum(id: string): Promise<Album | null> {
    if (!isSupabaseConfigured) {
      return indexedDBStorage.getAlbum(id);
    }

    try {
      const { data: albumRow, error: albumError } = await supabase
        .from('albums')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (albumError) {
        console.error(`[SupabaseStorage] getAlbum(${id}) query error:`, albumError);
        throw new Error(
          `[Supabase Error] Failed to fetch album ${id}: ${albumError.message} (code: ${albumError.code})`
        );
      }

      if (!albumRow) {
        // Fall back to local indexedDB ONLY for demo albums
        if (id.startsWith('demo_')) {
          return indexedDBStorage.getAlbum(id);
        }
        return null;
      }

      // Query album pages
      const { data: pageRows, error: pageError } = await supabase
        .from('album_pages')
        .select('*')
        .eq('album_id', id)
        .order('page_number', { ascending: true });

      if (pageError) {
        console.warn(`[SupabaseStorage] album_pages query error:`, pageError.message);
      }

      // Query album corrections
      const { data: corrRows, error: corrError } = await supabase
        .from('corrections')
        .select('*')
        .eq('album_id', id)
        .order('created_at', { ascending: true });

      if (corrError) {
        console.warn(`[SupabaseStorage] corrections query error:`, corrError.message);
      }

      const pages: AlbumPage[] = (pageRows || []).map((r) => {
        let previewUrl = r.preview_url;
        if (!previewUrl && r.preview_storage_path) {
          previewUrl = supabase.storage
            .from('album-previews')
            .getPublicUrl(r.preview_storage_path).data.publicUrl;
        }

        const splitSide =
          r.page_type === 'left'
            ? 'left'
            : r.page_type === 'right'
            ? 'right'
            : 'single';

        return {
          id: r.id,
          albumId: r.album_id,
          order: r.page_number,
          splitSide,
          blobId: r.blob_id || r.id,
          width: r.preview_width || r.width || 0,
          height: r.preview_height || r.height || 0,
          isSpread:
            r.page_type === 'spread' || r.page_type === 'left' || r.page_type === 'right',
          side: r.page_type,
          filename: r.filename || undefined,
          previewStoragePath: r.preview_storage_path || undefined,
          previewUrl: previewUrl || r.image_url || undefined,
          previewWidth: r.preview_width || r.width || 0,
          previewHeight: r.preview_height || r.height || 0,
          previewSizeBytes: r.preview_size_bytes || undefined,
          imagePath: r.preview_storage_path || r.image_path,
          imageUrl: previewUrl || r.image_url || undefined,
        };
      });

      // Strict deterministic ascending order
      pages.sort((a, b) => a.order - b.order);

      const pageIdToOrderMap = new Map<string, number>();
      pages.forEach((p) => pageIdToOrderMap.set(p.id, p.order));

      const corrections: Correction[] = (corrRows || []).map((r) => ({
        id: r.id,
        pageId: r.page_id,
        pageNumber: r.page_number || pageIdToOrderMap.get(r.page_id) || 1,
        x: r.x,
        y: r.y,
        category: r.category,
        comment: r.comment || '',
        status: r.status,
        author: r.author || undefined,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime(),
      }));

      let sourceType: 'images' | 'pdf' | undefined = parseNotesSourceType(albumRow.notes);
      if (!sourceType) {
        const hasPdf = pages.some((p) => p.filename?.toLowerCase().includes('.pdf'));
        if (hasPdf) {
          sourceType = 'pdf';
        } else if (pages.length > 0) {
          sourceType = 'images';
        }
      }

      const album: Album = {
        id: albumRow.id,
        title: albumRow.title,
        clientName: albumRow.client_name || '',
        clientEmail: albumRow.client_email || undefined,
        status: albumRow.status,
        pages,
        corrections,
        createdAt: new Date(albumRow.created_at).getTime(),
        updatedAt: new Date(albumRow.updated_at).getTime(),
        approvedAt: albumRow.approved_at ? new Date(albumRow.approved_at).getTime() : null,
        notes: cleanNotesForDisplay(albumRow.notes),
        sourceType,
      };

      return album;
    } catch (err) {
      console.warn(`[SupabaseStorage] getAlbum exception:`, err);
      return indexedDBStorage.getAlbum(id);
    }
  }

  async getAlbums(): Promise<Album[]> {
    if (!isSupabaseConfigured) {
      return indexedDBStorage.getAlbums();
    }

    try {
      const { data: albumRows, error: albumError } = await supabase
        .from('albums')
        .select('*')
        .order('updated_at', { ascending: false });

      if (albumError) {
        console.error('[SupabaseStorage] getAlbums query error:', albumError);
        throw new Error(
          `[Supabase Error] Failed to fetch albums from remote database: ${albumError.message} (code: ${albumError.code})`
        );
      }

      if (!albumRows || albumRows.length === 0) {
        const local = await indexedDBStorage.getAlbums();
        return local.filter((a) => a.id.startsWith('demo_'));
      }

      const albumIds = albumRows.map((a) => a.id);

      const [{ data: allPages }, { data: allCorrections }] = await Promise.all([
        supabase
          .from('album_pages')
          .select('*')
          .in('album_id', albumIds)
          .order('page_number', { ascending: true }),
        supabase
          .from('corrections')
          .select('*')
          .in('album_id', albumIds)
          .order('created_at', { ascending: true }),
      ]);

      const pagesMap = new Map<string, AlbumPage[]>();
      (allPages || []).forEach((r) => {
        const list = pagesMap.get(r.album_id) || [];
        let previewUrl = r.preview_url;
        if (!previewUrl && r.preview_storage_path) {
          previewUrl = supabase.storage
            .from('album-previews')
            .getPublicUrl(r.preview_storage_path).data.publicUrl;
        }

        const splitSide =
          r.page_type === 'left'
            ? 'left'
            : r.page_type === 'right'
            ? 'right'
            : 'single';

        list.push({
          id: r.id,
          albumId: r.album_id,
          order: r.page_number,
          splitSide,
          blobId: r.blob_id || r.id,
          width: r.preview_width || r.width || 0,
          height: r.preview_height || r.height || 0,
          isSpread:
            r.page_type === 'spread' || r.page_type === 'left' || r.page_type === 'right',
          side: r.page_type,
          filename: r.filename || undefined,
          previewStoragePath: r.preview_storage_path || undefined,
          previewUrl: previewUrl || r.image_url || undefined,
          previewWidth: r.preview_width || r.width || 0,
          previewHeight: r.preview_height || r.height || 0,
          previewSizeBytes: r.preview_size_bytes || undefined,
          imagePath: r.preview_storage_path || r.image_path,
          imageUrl: previewUrl || r.image_url || undefined,
        });
        pagesMap.set(r.album_id, list);
      });

      const corrMap = new Map<string, Correction[]>();
      (allCorrections || []).forEach((r) => {
        const list = corrMap.get(r.album_id) || [];
        const albumPages = pagesMap.get(r.album_id) || [];
        const matchingPage = albumPages.find((p) => p.id === r.page_id);
        list.push({
          id: r.id,
          pageId: r.page_id,
          pageNumber: r.page_number || matchingPage?.order || 1,
          x: r.x,
          y: r.y,
          category: r.category,
          comment: r.comment || '',
          status: r.status,
          author: r.author || undefined,
          createdAt: new Date(r.created_at).getTime(),
          updatedAt: new Date(r.updated_at).getTime(),
        });
        corrMap.set(r.album_id, list);
      });

      const albumsList: Album[] = albumRows.map((row) => {
        const pList = (pagesMap.get(row.id) || []).sort((a, b) => a.order - b.order);
        let sourceType: 'images' | 'pdf' | undefined = parseNotesSourceType(row.notes);
        if (!sourceType) {
          const hasPdf = pList.some((p) => p.filename?.toLowerCase().includes('.pdf'));
          if (hasPdf) {
            sourceType = 'pdf';
          } else if (pList.length > 0) {
            sourceType = 'images';
          }
        }

        return {
          id: row.id,
          title: row.title,
          clientName: row.client_name || '',
          clientEmail: row.client_email || undefined,
          status: row.status,
          pages: pList,
          corrections: corrMap.get(row.id) || [],
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
          approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : null,
          notes: cleanNotesForDisplay(row.notes),
          sourceType,
        };
      });

      // Merge only local demo albums from IndexedDB
      try {
        const localAlbums = await indexedDBStorage.getAlbums();
        const existingIds = new Set(albumsList.map((a) => a.id));
        for (const la of localAlbums) {
          if (la.id.startsWith('demo_') && !existingIds.has(la.id)) {
            albumsList.push(la);
          }
        }
      } catch (e) {
        // non-fatal
      }

      albumsList.sort((a, b) => b.updatedAt - a.updatedAt);
      return albumsList;
    } catch (err) {
      console.error('[SupabaseStorage] getAlbums exception:', err);
      throw err;
    }
  }

  async updateAlbum(id: string, updates: Partial<Album>): Promise<Album> {
    const nowIso = new Date().toISOString();

    if (!isSupabaseConfigured) {
      return indexedDBStorage.updateAlbum(id, updates);
    }

    try {
      const dbUpdates: Record<string, any> = {
        updated_at: nowIso,
      };

      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.clientName !== undefined) dbUpdates.client_name = updates.clientName;
      if (updates.clientEmail !== undefined) dbUpdates.client_email = updates.clientEmail;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.notes !== undefined || updates.sourceType !== undefined) {
        let currentNotes = updates.notes;
        let currentSourceType = updates.sourceType;
        if (currentNotes === undefined || !currentSourceType) {
          const { data: curr } = await supabase.from('albums').select('notes').eq('id', id).maybeSingle();
          if (currentNotes === undefined) {
            currentNotes = curr?.notes || undefined;
          }
          if (!currentSourceType && curr?.notes) {
            currentSourceType = parseNotesSourceType(curr.notes);
          }
        }
        dbUpdates.notes = encodeNotesWithSourceType(currentNotes, currentSourceType);
      }
      if (updates.approvedAt !== undefined) {
        dbUpdates.approved_at = updates.approvedAt
          ? new Date(updates.approvedAt).toISOString()
          : null;
      }

      const { error: albumErr } = await supabase.from('albums').update(dbUpdates).eq('id', id);
      if (albumErr) {
        console.error(`[SupabaseStorage] updateAlbum error:`, albumErr);
        throw new Error(
          `[Supabase Error] Failed to update album in remote database: ${albumErr.message} (code: ${albumErr.code})`
        );
      }

      // If pages are updated (e.g. reorder or add or delete)
      if (updates.pages !== undefined) {
        if (updates.pages.length > 0) {
          const keptPageIds = new Set(updates.pages.map((p) => p.id));
          const { data: existingRows } = await supabase
            .from('album_pages')
            .select('id, preview_storage_path, image_path, blob_id')
            .eq('album_id', id);

          const toDeleteRows = (existingRows || []).filter((r) => !keptPageIds.has(r.id));
          if (toDeleteRows.length > 0) {
            const deleteIds = toDeleteRows.map((r) => r.id);
            const deletePaths: string[] = [];
            for (const r of toDeleteRows) {
              if (r.preview_storage_path) deletePaths.push(r.preview_storage_path);
              deletePaths.push(`previews/${id}/${r.id}.webp`);
              if (r.image_path) deletePaths.push(r.image_path);
              if (r.blob_id) deletePaths.push(`pages/${r.blob_id}.webp`);
            }

            // Before deleting pages, remap any corrections referencing deleteIds to the first kept page
            // so PostgreSQL foreign key cascade / RESTRICT NEVER deletes correction history or blocks deletion
            const firstKeptPageId = updates.pages[0]?.id;
            if (firstKeptPageId) {
              await supabase
                .from('corrections')
                .update({ page_id: firstKeptPageId, updated_at: nowIso })
                .eq('album_id', id)
                .in('page_id', deleteIds);
            }

            const { error: delErr } = await supabase
              .from('album_pages')
              .delete()
              .in('id', deleteIds);
            if (delErr) {
              console.error('[SupabaseStorage] album_pages delete error:', delErr);
            }

            const uniquePaths = Array.from(new Set(deletePaths.filter(Boolean)));
            if (uniquePaths.length > 0) {
              supabase.storage.from('album-previews').remove(uniquePaths).catch(() => {});
            }
          }

          // 2. Prepare remaining page rows
          const pageRows = updates.pages.map((p, idx) => ({
            id: p.id,
            album_id: id,
            page_number: p.order || idx + 1,
            page_type: p.side || 'single',
            preview_storage_path: p.previewStoragePath || null,
            preview_url: p.previewUrl || null,
            preview_width: p.previewWidth || p.width || 0,
            preview_height: p.previewHeight || p.height || 0,
            preview_size_bytes: p.previewSizeBytes || null,
            image_path: p.previewStoragePath || `pages/${p.blobId}.webp`,
            image_url: p.previewUrl || null,
            blob_id: p.blobId || null,
            width: p.previewWidth || p.width || 0,
            height: p.previewHeight || p.height || 0,
            filename: p.filename || null,
            updated_at: nowIso,
          }));

          // Shift existing pages to temporary negative page numbers first to clear slots and avoid UNIQUE (album_id, page_number) collision
          const tempPageRows = pageRows.map((row, idx) => ({
            ...row,
            page_number: -(idx + 1),
          }));
          const { error: tempErr } = await supabase
            .from('album_pages')
            .upsert(tempPageRows, { onConflict: 'id' });
          if (tempErr) {
            console.error('[SupabaseStorage] album_pages temp shift error:', tempErr);
          }

          // Upsert final page rows with exact positive page numbers and metadata matching by primary key 'id'
          const { error: pageUpsertErr } = await supabase
            .from('album_pages')
            .upsert(pageRows, { onConflict: 'id' });
          if (pageUpsertErr) {
            console.error('[SupabaseStorage] album_pages upsert error:', pageUpsertErr);
            throw new Error(
              `[Supabase Error] Failed to save album pages: ${pageUpsertErr.message} (code: ${pageUpsertErr.code})`
            );
          }
        } else {
          // All pages removed
          const { data: existingRows } = await supabase
            .from('album_pages')
            .select('preview_storage_path, image_path, blob_id')
            .eq('album_id', id);
          const deletePaths: string[] = [];
          for (const r of existingRows || []) {
            if (r.preview_storage_path) deletePaths.push(r.preview_storage_path);
            if (r.image_path) deletePaths.push(r.image_path);
            if (r.blob_id) deletePaths.push(`pages/${r.blob_id}.webp`);
          }

          await supabase.from('album_pages').delete().eq('album_id', id);
          const uniquePaths = Array.from(new Set(deletePaths.filter(Boolean)));
          if (uniquePaths.length > 0) {
            await supabase.storage.from('album-previews').remove(uniquePaths).catch(() => {});
          }
        }
      }

      // If corrections are updated
      if (updates.corrections !== undefined) {
        await this.updateCorrections(id, updates.corrections);
      }

      const refreshed = await this.getAlbum(id);
      if (!refreshed) {
        throw new Error(`Album ${id} not found after update`);
      }

      // Mirror locally in IndexedDB as read cache
      indexedDBStorage.updateAlbum(id, refreshed).catch(() => {});

      return refreshed;
    } catch (err) {
      console.error(`[SupabaseStorage] updateAlbum exception:`, err);
      throw err;
    }
  }

  /**
   * Safely replaces the entire album pages collection with a newly uploaded full album.
   * - Preserves album identity, URL, metadata, and 100% of customer correction history.
   * - Remaps corrections to matching new pages using logical page_number.
   * - Cleans up obsolete old preview WebP files in album-previews only after success.
   * - Never appends pages.
   */
  async replaceAlbumPages(albumId: string, newPages: AlbumPage[], sourceType?: AlbumSourceType): Promise<Album> {
    const t0 = perfLogger.mark('replaceAlbumPages');
    const nowIso = new Date().toISOString();

    if (!isSupabaseConfigured) {
      return indexedDBStorage.replaceAlbumPages(albumId, newPages, sourceType);
    }

    try {
      // 1. Fetch current album state to obtain existing pages and corrections
      const currentAlbum = await this.getAlbum(albumId);
      if (!currentAlbum) {
        throw new Error(`Album ${albumId} not found`);
      }

      const oldPages = currentAlbum.pages || [];
      const oldPagesByOrder = new Map<number, AlbumPage>();
      oldPages.forEach((p) => oldPagesByOrder.set(p.order, p));

      const existingCorrections = currentAlbum.corrections || [];

      // Collect old preview storage paths to clean up later in background
      const oldPreviewPaths = oldPages
        .map((p) => p.previewStoragePath)
        .filter(Boolean) as string[];

      // 2. Prepare atomic batch page rows, preserving existing primary key IDs for matching page_number
      // This strictly respects PostgreSQL UNIQUE (album_id, page_number) and maintains FK stability
      const pageRows = newPages.map((np, idx) => {
        const pageNum = np.order || idx + 1;
        const existingPageForNumber = oldPagesByOrder.get(pageNum);
        const pageId = existingPageForNumber ? existingPageForNumber.id : (np.id || this.generateId('page'));

        return {
          id: pageId,
          album_id: albumId,
          page_number: pageNum,
          page_type: np.side || 'single',
          preview_storage_path: np.previewStoragePath || null,
          preview_url: np.previewUrl || null,
          preview_width: np.previewWidth || np.width || 0,
          preview_height: np.previewHeight || np.height || 0,
          preview_size_bytes: np.previewSizeBytes || null,
          image_path: np.previewStoragePath || `pages/${np.blobId}.webp`,
          image_url: np.previewUrl || null,
          blob_id: np.blobId || null,
          width: np.previewWidth || np.width || 0,
          height: np.previewHeight || np.height || 0,
          filename: np.filename || null,
          updated_at: nowIso,
        };
      });

      // Execute single atomic batch upsert for ALL pages in one HTTP request
      const { error: upsertErr } = await supabase
        .from('album_pages')
        .upsert(pageRows, { onConflict: 'album_id,page_number' });

      if (upsertErr) {
        console.error('[SupabaseStorage] Batch upsert album_pages error:', upsertErr);
        throw new Error(`Failed to save album pages: ${upsertErr.message}`);
      }

      const finalPages: AlbumPage[] = newPages.map((np, idx) => {
        const pageNum = np.order || idx + 1;
        const matchedRow = pageRows[idx];
        return {
          ...np,
          id: matchedRow.id,
          order: pageNum,
          previewUrl: matchedRow.preview_url || np.previewUrl,
        };
      });

      // 3. Delete any extra pages from old album if new album has fewer pages
      if (oldPages.length > newPages.length) {
        const extraPages = oldPages.filter((op) => op.order > newPages.length);
        if (extraPages.length > 0) {
          const extraPageIds = extraPages.map((p) => p.id);
          const lastValidPageId = finalPages[finalPages.length - 1]?.id;

          // Before deleting, remap any corrections on extra pages to the last valid page
          if (lastValidPageId) {
            await supabase
              .from('corrections')
              .update({ page_id: lastValidPageId, updated_at: nowIso })
              .eq('album_id', albumId)
              .in('page_id', extraPageIds);
          }

          await supabase.from('album_pages').delete().in('id', extraPageIds);
        }
      }

      // 4. Remap corrections in parallel if any page references shifted
      let remappedCorrections = existingCorrections;
      if (existingCorrections.length > 0) {
        const finalPageByOrder = new Map<number, AlbumPage>();
        finalPages.forEach((p) => finalPageByOrder.set(p.order, p));

        const correctionUpdates: { id: string; page_id: string; page_number: number }[] = [];

        remappedCorrections = existingCorrections.map((c) => {
          const oldPage = oldPages.find((p) => p.id === c.pageId);
          const targetPageNum = c.pageNumber || oldPage?.order || 1;
          const matchingPage =
            finalPageByOrder.get(targetPageNum) ||
            finalPages[Math.min(Math.max(0, targetPageNum - 1), finalPages.length - 1)];

          if (matchingPage && matchingPage.id !== c.pageId) {
            correctionUpdates.push({
              id: c.id,
              page_id: matchingPage.id,
              page_number: targetPageNum,
            });
            return {
              ...c,
              pageId: matchingPage.id,
              pageNumber: targetPageNum,
            };
          }
          return {
            ...c,
            pageNumber: targetPageNum,
          };
        });

        if (correctionUpdates.length > 0) {
          await Promise.all(
            correctionUpdates.map((u) =>
              supabase
                .from('corrections')
                .update({ page_id: u.page_id, page_number: u.page_number, updated_at: nowIso })
                .eq('id', u.id)
            )
          );
        }
      }

      // 5. Invalidate client image cache on album replacement
      imageCache.clear();

      // 6. Clean up obsolete old WebP preview files in storage bucket 'album-previews' in background
      const newPreviewPaths = new Set(
        finalPages.map((p) => p.previewStoragePath).filter(Boolean) as string[]
      );
      const obsoletePathsToDelete = oldPreviewPaths.filter((path) => !newPreviewPaths.has(path));

      if (obsoletePathsToDelete.length > 0) {
        // Non-blocking background purge
        supabase.storage
          .from('album-previews')
          .remove(obsoletePathsToDelete)
          .catch((e) => {
            console.warn('[SupabaseStorage] Non-fatal error removing old preview files:', e);
          });
      }

      const detectedFromPages: AlbumSourceType | undefined =
        newPages.length > 0
          ? newPages.some((p) => p.filename?.toLowerCase().includes('.pdf'))
            ? 'pdf'
            : 'images'
          : undefined;

      const finalSourceType =
        sourceType ||
        detectedFromPages ||
        currentAlbum.sourceType ||
        'images';
      const updatedNotes = encodeNotesWithSourceType(currentAlbum.notes, finalSourceType);

      await supabase
        .from('albums')
        .update({ updated_at: nowIso, notes: updatedNotes })
        .eq('id', albumId);

      // 8. Assemble refreshed album in memory directly to return immediately
      const refreshed: Album = {
        ...currentAlbum,
        pages: finalPages,
        corrections: remappedCorrections,
        notes: cleanNotesForDisplay(updatedNotes),
        sourceType: finalSourceType,
        updatedAt: Date.now(),
      };

      // Non-blocking local IndexedDB sync
      indexedDBStorage.replaceAlbumPages(albumId, finalPages, finalSourceType).catch(() => {});

      perfLogger.measure('replaceAlbumPages total database save duration', t0, {
        pages: finalPages.length,
      });

      return refreshed;
    } catch (err) {
      console.error('[SupabaseStorage] replaceAlbumPages exception:', err);
      throw err;
    }
  }

  async deleteAlbum(id: string): Promise<void> {
    try {
      const album = await this.getAlbum(id);
      if (album && album.pages) {
        const previewPaths: string[] = [];
        album.pages.forEach((p) => {
          if (p.previewStoragePath) previewPaths.push(p.previewStoragePath);
        });

        if (previewPaths.length > 0) {
          await supabase.storage.from('album-previews').remove(previewPaths);
        }
      }
      await supabase.from('albums').delete().eq('id', id);
    } catch (err) {
      console.warn(`[SupabaseStorage] deleteAlbum error:`, err);
    }

    try {
      await indexedDBStorage.deleteAlbum(id);
    } catch (e) {}
  }

  // ==========================================
  // WebP-Only Preview Storage Upload
  // ==========================================
  async uploadPagePreview(params: UploadPagePreviewParams): Promise<UploadPagePreviewResult> {
    const previewPath = `${params.albumId}/${params.pageId}.webp`;

    // 1. Mirror in memory (bounded LRU-style) & local IndexedDB for immediate rendering
    if (params.blobId) {
      if (this.memoryBlobCache.size > 20) {
        const oldestKey = this.memoryBlobCache.keys().next().value;
        if (oldestKey) this.memoryBlobCache.delete(oldestKey);
      }
      this.memoryBlobCache.set(params.blobId, params.previewBlob);
      indexedDBStorage.savePageBlob(params.blobId, params.previewBlob).catch(() => {});
    }

    if (!isSupabaseConfigured) {
      return {
        previewStoragePath: previewPath,
        previewUrl: '',
        previewSizeBytes: params.previewBlob.size,
        previewWidth: params.previewWidth,
        previewHeight: params.previewHeight,
      };
    }

    // 2. Upload WebP preview to bucket 'album-previews'
    const { error: prevErr } = await supabase.storage
      .from('album-previews')
      .upload(previewPath, params.previewBlob, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (prevErr) {
      console.error('[SupabaseStorage] upload preview error:', prevErr);
      throw new Error(
        `[Supabase Storage Error] Failed to upload preview to album-previews: ${prevErr.message}`
      );
    }

    const { data: pubData } = supabase.storage.from('album-previews').getPublicUrl(previewPath);
    const previewUrl = pubData.publicUrl;

    return {
      previewStoragePath: previewPath,
      previewUrl,
      previewSizeBytes: params.previewBlob.size,
      previewWidth: params.previewWidth,
      previewHeight: params.previewHeight,
    };
  }

  async savePageBlob(blobId: string, blob: Blob): Promise<void> {
    this.memoryBlobCache.set(blobId, blob);

    try {
      await indexedDBStorage.savePageBlob(blobId, blob);
    } catch (e) {}
  }

  /**
   * Client-facing page blob retriever: downloads from 'album-previews' or local cache
   */
  async getPageBlob(blobId: string): Promise<Blob | null> {
    // 1. Check in-memory cache
    if (this.memoryBlobCache.has(blobId)) {
      return this.memoryBlobCache.get(blobId)!;
    }

    // 2. Check local IndexedDB cache
    try {
      const localBlob = await indexedDBStorage.getPageBlob(blobId);
      if (localBlob) {
        this.memoryBlobCache.set(blobId, localBlob);
        return localBlob;
      }
    } catch (e) {
      // ignore
    }

    if (!isSupabaseConfigured) return null;

    // 3. Download from Supabase Storage bucket 'album-previews'
    try {
      const { data: previewData, error: prevErr } = await supabase.storage
        .from('album-previews')
        .download(`pages/${blobId}.webp`);
      if (!prevErr && previewData) {
        this.memoryBlobCache.set(blobId, previewData);
        indexedDBStorage.savePageBlob(blobId, previewData).catch(() => {});
        return previewData;
      }
      return null;
    } catch (err) {
      console.warn(`[SupabaseStorage] Exception downloading blob ${blobId}:`, err);
      return null;
    }
  }

  async deletePageBlob(blobId: string): Promise<void> {
    this.memoryBlobCache.delete(blobId);

    try {
      await indexedDBStorage.deletePageBlob(blobId);
    } catch (e) {}

    if (!isSupabaseConfigured) return;

    try {
      await supabase.storage.from('album-previews').remove([`pages/${blobId}.webp`]);
    } catch (err) {
      console.warn(`[SupabaseStorage] Error deleting blob ${blobId} from storage:`, err);
    }
  }

  async updateCorrections(albumId: string, corrections: Correction[]): Promise<void> {
    // Mirror in IndexedDB
    try {
      await indexedDBStorage.updateCorrections(albumId, corrections);
    } catch (e) {}

    if (!isSupabaseConfigured) return;

    try {
      // 1. Query existing corrections from Supabase
      const { data: existingRows } = await supabase
        .from('corrections')
        .select('*')
        .eq('album_id', albumId);

      const existingMap = new Map((existingRows || []).map((r) => [r.id, r]));

      // 2. Prepare upsert rows
      const upsertRows = corrections.map((c) => {
        const existing = existingMap.get(c.id);
        return {
          id: c.id,
          album_id: albumId,
          page_id: c.pageId,
          x: c.x,
          y: c.y,
          category: c.category,
          comment: c.comment || '',
          status: c.status,
          author: c.author || null,
          created_at: existing
            ? existing.created_at
            : new Date(c.createdAt || Date.now()).toISOString(),
          updated_at: new Date(c.updatedAt || Date.now()).toISOString(),
        };
      });

      if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('corrections')
          .upsert(upsertRows, { onConflict: 'id' });
        if (upsertErr) {
          console.error('[SupabaseStorage] corrections upsert error:', upsertErr);
          throw new Error(
            `[Supabase Database Error] Failed to save corrections: ${upsertErr.message}`
          );
        }
      }

      // 3. For any correction removed by client before submission:
      // NEVER delete resolved corrections (Rule: Immutable Resolved History)
      const incomingIds = new Set(corrections.map((c) => c.id));
      for (const [id, row] of existingMap.entries()) {
        if (!incomingIds.has(id)) {
          if (row.status !== 'Resolved') {
            await supabase.from('corrections').delete().eq('id', id);
          } else {
            console.log(`[SupabaseStorage] Retaining resolved correction ${id}`);
          }
        }
      }

      // 4. Update album updated_at timestamp
      await supabase
        .from('albums')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', albumId);
    } catch (err) {
      console.error('[SupabaseStorage] updateCorrections exception:', err);
      throw err;
    }
  }

  async updateStatus(
    albumId: string,
    status: AlbumStatus,
    approvedAt?: number | null
  ): Promise<void> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Mirror to IndexedDB
    try {
      await indexedDBStorage.updateStatus(albumId, status, approvedAt);
    } catch (e) {}

    if (!isSupabaseConfigured) return;

    try {
      const dbUpdates: Record<string, any> = {
        status,
        updated_at: nowIso,
      };

      if (approvedAt !== undefined) {
        dbUpdates.approved_at = approvedAt ? new Date(approvedAt).toISOString() : null;
      } else if (status === 'Approved') {
        dbUpdates.approved_at = nowIso;
      }

      const { error } = await supabase.from('albums').update(dbUpdates).eq('id', albumId);
      if (error) {
        console.error(`[SupabaseStorage] updateStatus(${albumId}) error:`, error);
        throw new Error(
          `[Supabase Database Error] Failed to update album status: ${error.message}`
        );
      }
    } catch (err) {
      console.error('[SupabaseStorage] updateStatus exception:', err);
      throw err;
    }
  }
}

export const supabaseStorage = new SupabaseStorage();
