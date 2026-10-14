import { useState, useEffect, useCallback } from 'react';
import { Album } from '@/types/album';
import { storage } from '@/services/storage';

export function useAlbums() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlbums = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await storage.getAlbums();
      setAlbums(data);
    } catch (err) {
      console.error('Failed to load albums:', err);
      setError(err instanceof Error ? err.message : 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  const createAlbum = async (title: string, clientName: string, clientEmail?: string, notes?: string) => {
    try {
      const newAlbum = await storage.createAlbum({
        title,
        clientName,
        clientEmail,
        notes,
        status: 'Draft',
        pages: [],
        corrections: [],
        approvedAt: null,
      });
      await loadAlbums();
      return newAlbum;
    } catch (err) {
      console.error('Failed to create album:', err);
      throw err;
    }
  };

  const deleteAlbum = async (id: string) => {
    try {
      await storage.deleteAlbum(id);
      await loadAlbums();
    } catch (err) {
      console.error('Failed to delete album:', err);
      throw err;
    }
  };

  return {
    albums,
    loading,
    error,
    createAlbum,
    deleteAlbum,
    refresh: loadAlbums,
  };
}
