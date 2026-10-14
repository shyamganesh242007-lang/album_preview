import { useEffect, useState } from 'react';
import { storage } from '@/services/storage';

/**
 * Hook to retrieve a Blob by blobId from storage, convert it to an Object URL,
 * and automatically revoke the Object URL upon change or unmount.
 */
export function useBlobUrl(blobId: string | null | undefined): {
  url: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!blobId) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);

    storage
      .getPageBlob(blobId)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          setError(new Error(`Blob not found: ${blobId}`));
          setLoading(false);
          return;
        }

        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [blobId]);

  return { url, loading, error };
}

/**
 * Hook to batch load and cache Blob URLs for an entire list of pages,
 * revoking all of them cleanly when unmounting.
 */
export function useAlbumBlobs(blobIds: string[]): {
  urls: Record<string, string>;
  loading: boolean;
} {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Serialize IDs for stable dependency tracking
  const idsKey = blobIds.join(',');

  useEffect(() => {
    if (!blobIds.length) {
      setUrls({});
      setLoading(false);
      return;
    }

    let isMounted = true;
    const allocatedUrls: string[] = [];

    async function loadAll() {
      setLoading(true);
      const map: Record<string, string> = {};

      for (const id of blobIds) {
        try {
          const blob = await storage.getPageBlob(id);
          if (blob && isMounted) {
            const u = URL.createObjectURL(blob);
            allocatedUrls.push(u);
            map[id] = u;
          }
        } catch (e) {
          console.error(`Failed to load blob ${id}`, e);
        }
      }

      if (isMounted) {
        setUrls(map);
        setLoading(false);
      }
    }

    loadAll();

    return () => {
      isMounted = false;
      allocatedUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [idsKey]);

  return { urls, loading };
}
