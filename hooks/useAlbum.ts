import { useState, useEffect, useCallback } from 'react';
import { Album, AlbumPage, AlbumStatus, Correction, AlbumSourceType } from '@/types/album';
import { storage } from '@/services/storage';
import { supabase, isSupabaseConfigured } from '@/services/supabase/client';

export type UserRole = 'studio' | 'client';

export function useAlbum(albumId: string, role: UserRole = 'client') {
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlbum = useCallback(async () => {
    if (!albumId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await storage.getAlbum(albumId);
      if (!data) {
        setError(`Album with ID "${albumId}" was not found.`);
        setAlbum(null);
      } else {
        if (data.pages) {
          data.pages.sort((a, b) => a.order - b.order);
        }
        setAlbum(data);
      }
    } catch (err) {
      console.error('Failed to load album:', err);
      setError(err instanceof Error ? err.message : 'Failed to load album');
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    loadAlbum();
  }, [loadAlbum]);

  // Supabase Realtime synchronization across devices and tabs with debouncing
  useEffect(() => {
    if (!albumId || !isSupabaseConfigured) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadAlbum();
      }, 250);
    };

    const channel = supabase
      .channel(`realtime_album_${albumId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'albums', filter: `id=eq.${albumId}` },
        debouncedLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'corrections', filter: `album_id=eq.${albumId}` },
        debouncedLoad
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [albumId, loadAlbum]);

  const addPages = async (newPages: AlbumPage[], sourceType?: AlbumSourceType) => {
    if (!album) return;
    const updatedPages = [...album.pages, ...newPages].map((page, idx) => ({
      ...page,
      order: idx + 1,
    }));
    const finalSourceType = sourceType || album.sourceType || 'images';
    const updated = await storage.updateAlbum(album.id, {
      pages: updatedPages,
      sourceType: finalSourceType,
    });
    setAlbum(updated);
    return updated;
  };

  const replaceAlbumPages = async (newPages: AlbumPage[], sourceType?: AlbumSourceType) => {
    if (!album) return;
    const detectedFromPages: AlbumSourceType | undefined =
      newPages.length > 0
        ? newPages.some((p) => p.filename?.toLowerCase().includes('.pdf'))
          ? 'pdf'
          : 'images'
        : undefined;
    const finalSourceType = sourceType || detectedFromPages || album.sourceType || 'images';
    const updated = await storage.replaceAlbumPages(album.id, newPages, finalSourceType);
    setAlbum(updated);
    return updated;
  };

  const updatePageOrder = async (reorderedPages: AlbumPage[]) => {
    if (!album) return;
    const updatedPages = reorderedPages.map((page, idx) => ({
      ...page,
      order: idx + 1,
    }));
    const updated = await storage.updateAlbum(album.id, { pages: updatedPages });
    setAlbum(updated);
    return updated;
  };

  const deletePage = async (pageId: string) => {
    if (!album) return;
    const targetPage = album.pages.find((p) => p.id === pageId);
    if (!targetPage) {
      console.warn('[useAlbum] targetPage not found for pageId:', pageId);
      return;
    }
    if (targetPage?.blobId) {
      try {
        await storage.deletePageBlob(targetPage.blobId);
      } catch (e) {
        console.warn('Failed to delete blob', e);
      }
    }

    const remainingPages = album.pages
      .filter((p) => p.id !== pageId)
      .map((page, idx) => ({ ...page, order: idx + 1 }));

    // Preserve ALL corrections! Remap deleted page corrections to the first remaining page
    // and ensure historical pageNumber is preserved so history is never lost or corrupted.
    const firstKeptPageId = remainingPages[0]?.id;
    const preservedCorrections = album.corrections.map((c) => {
      if (c.pageId === pageId) {
        return {
          ...c,
          pageNumber: c.pageNumber ?? targetPage?.order ?? 1,
          pageId: firstKeptPageId || c.pageId,
        };
      }
      return c;
    });

    const updated = await storage.updateAlbum(album.id, {
      pages: remainingPages,
      corrections: preservedCorrections,
    });
    setAlbum(updated);
    return updated;
  };

  // Client ONLY can create corrections. Studio is strictly rejected.
  const addCorrection = async (
    correction: Omit<Correction, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ) => {
    if (role === 'studio') {
      throw new Error('Unauthorized: Studio/Provider is not permitted to create client corrections.');
    }
    if (!album) return;
    const now = Date.now();
    const targetPage = album.pages.find((p) => p.id === correction.pageId);
    const newCorr: Correction = {
      ...correction,
      id: `corr_${now}_${Math.random().toString(36).substring(2, 7)}`,
      pageNumber: targetPage?.order || 1,
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    };

    const updatedCorrections = [...album.corrections, newCorr];
    const updated = { ...album, corrections: updatedCorrections, updatedAt: now };
    setAlbum(updated);
    await storage.updateCorrections(album.id, updatedCorrections);
    return newCorr;
  };

  const updateCorrection = async (correctionId: string, updates: Partial<Correction>) => {
    if (!album) return;
    const target = album.corrections.find((c) => c.id === correctionId);
    if (!target) return;

    // Client cannot resolve or modify resolved status
    if (role === 'client' && updates.status && updates.status !== target.status) {
      throw new Error('Unauthorized: Clients cannot resolve or reopen corrections.');
    }

    const updatedCorrections = album.corrections.map((c) => {
      if (c.id === correctionId) {
        return { ...c, ...updates, updatedAt: Date.now() };
      }
      return c;
    });

    const updated = { ...album, corrections: updatedCorrections, updatedAt: Date.now() };
    setAlbum(updated);
    await storage.updateCorrections(album.id, updatedCorrections);
  };

  // Resolved corrections must NEVER be deleted
  const deleteCorrection = async (correctionId: string) => {
    if (!album) return;
    const target = album.corrections.find((c) => c.id === correctionId);
    if (target && target.status === 'Resolved') {
      throw new Error('Resolved corrections are permanent historical records and cannot be deleted.');
    }

    const updatedCorrections = album.corrections.filter((c) => c.id !== correctionId);
    const updated = { ...album, corrections: updatedCorrections, updatedAt: Date.now() };
    setAlbum(updated);
    await storage.updateCorrections(album.id, updatedCorrections);
  };

  // Studio can resolve/reopen corrections. Client cannot.
  const resolveCorrection = async (correctionId: string, resolved: boolean = true) => {
    if (role === 'client') {
      throw new Error('Unauthorized: Clients cannot resolve or reopen corrections.');
    }
    return updateCorrection(correctionId, {
      status: resolved ? 'Resolved' : 'Open',
    });
  };

  const updateStatus = async (status: AlbumStatus, approvedAt?: number | null) => {
    if (!album) return;
    const updates: Partial<Album> = { status, updatedAt: Date.now() };
    if (approvedAt !== undefined) {
      updates.approvedAt = approvedAt;
    }
    setAlbum((prev) => (prev ? { ...prev, ...updates } : null));
    await storage.updateStatus(album.id, status, approvedAt);
  };

  return {
    album,
    loading,
    error,
    refresh: loadAlbum,
    addPages,
    replaceAlbumPages,
    updatePageOrder,
    deletePage,
    addCorrection,
    updateCorrection,
    deleteCorrection,
    resolveCorrection,
    updateStatus,
  };
}
