import { Album, AlbumPage, AlbumStatus, Correction, StoredBlob, AlbumSourceType } from '@/types/album';
import { AlbumStorage } from './storageInterface';

const DB_NAME = 'zeebook_studio_db';
// Version bumped to 2 to trigger automatic migration for existing browser installations
const TARGET_DB_VERSION = 2;

export const ALBUMS_STORE = 'albums';
export const BLOBS_STORE = 'blobs';

interface StoreDefinition {
  name: string;
  keyPath: string;
  indices?: { name: string; keyPath: string; options?: IDBIndexParameters }[];
}

const REQUIRED_STORES: StoreDefinition[] = [
  {
    name: ALBUMS_STORE,
    keyPath: 'id',
    indices: [{ name: 'updatedAt', keyPath: 'updatedAt', options: { unique: false } }],
  },
  {
    name: BLOBS_STORE,
    keyPath: 'blobId',
  },
];

export class IndexedDBStorage implements AlbumStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens IndexedDB, ensuring all required object stores exist.
   * If any required store is missing, self-heals by upgrading the database version.
   */
  private async openAndEnsureSchema(targetVersion?: number): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const openReq = targetVersion
        ? window.indexedDB.open(DB_NAME, targetVersion)
        : window.indexedDB.open(DB_NAME);

      openReq.onupgradeneeded = (event) => {
        const db = openReq.result;
        console.log(
          `[IndexedDBStorage] Upgrade needed from v${event.oldVersion} to v${event.newVersion}`
        );

        for (const storeDef of REQUIRED_STORES) {
          if (!db.objectStoreNames.contains(storeDef.name)) {
            console.log(`[IndexedDBStorage] Creating required store: "${storeDef.name}"`);
            const store = db.createObjectStore(storeDef.name, { keyPath: storeDef.keyPath });
            if (storeDef.indices) {
              for (const idx of storeDef.indices) {
                store.createIndex(idx.name, idx.keyPath, idx.options);
              }
            }
          }
        }
      };

      openReq.onsuccess = async () => {
        const db = openReq.result;

        // Multi-tab safety: Close connection if another tab triggers an upgrade
        db.onversionchange = () => {
          console.warn('[IndexedDBStorage] Version change event received, closing connection');
          db.close();
          this.dbPromise = null;
        };

        db.onclose = () => {
          this.dbPromise = null;
        };

        // Self-healing check: Verify that ALL required stores exist in the open database
        const missing = REQUIRED_STORES.filter((s) => !db.objectStoreNames.contains(s.name));
        if (missing.length > 0) {
          console.warn(
            `[IndexedDBStorage] Database v${db.version} is missing stores: [${missing
              .map((s) => s.name)
              .join(', ')}]. Auto-upgrading...`
          );
          db.close();
          this.dbPromise = null;
          // Increment database version to force onupgradeneeded
          const nextVersion = db.version + 1;
          try {
            const upgradedDb = await this.openAndEnsureSchema(nextVersion);
            resolve(upgradedDb);
          } catch (err) {
            reject(err);
          }
          return;
        }

        resolve(db);
      };

      openReq.onerror = () => {
        this.dbPromise = null;
        reject(new Error(`Failed to open IndexedDB: ${openReq.error?.message}`));
      };

      openReq.onblocked = () => {
        console.warn(
          '[IndexedDBStorage] Database open request is blocked by another open tab. Close other tabs to proceed.'
        );
      };
    });
  }

  /**
   * Retrieves an open IDBDatabase instance, guaranteeing that all required object stores exist.
   */
  private async getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('IndexedDB is only available in browser environments'));
    }

    if (!this.dbPromise) {
      this.dbPromise = this.openAndEnsureSchema(TARGET_DB_VERSION).catch((err) => {
        this.dbPromise = null;
        throw err;
      });
    }

    const db = await this.dbPromise;

    // Extra runtime sanity check
    const missing = REQUIRED_STORES.filter((s) => !db.objectStoreNames.contains(s.name));
    if (missing.length > 0) {
      this.dbPromise = null;
      return this.getDB();
    }

    return db;
  }

  /**
   * Executes a transaction on the specified object store with automatic retry & self-healing
   */
  private async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    let db = await this.getDB();

    // Check if store is present
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`[IndexedDBStorage] Store "${storeName}" not found on active DB. Re-opening with self-healing...`);
      this.dbPromise = null;
      db = await this.getDB();
    }

    try {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      return await operation(store);
    } catch (err) {
      // If store is somehow still missing or connection was closed, reset and retry once
      const isStoreMissing =
        err instanceof Error &&
        (err.name === 'NotFoundError' || err.message.includes('object stores was not found'));

      if (isStoreMissing) {
        console.warn(`[IndexedDBStorage] Store "${storeName}" was missing during transaction. Healing schema...`);
        this.dbPromise = null;
        const freshDb = await this.getDB();
        const tx = freshDb.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        return await operation(store);
      }

      throw err;
    }
  }

  async createAlbum(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    const now = Date.now();
    const id = `album_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newAlbum: Album = {
      ...data,
      id,
      pages: data.pages || [],
      corrections: data.corrections || [],
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
    };

    return this.withStore(ALBUMS_STORE, 'readwrite', (store) => {
      return new Promise<Album>((resolve, reject) => {
        const req = store.add(newAlbum);
        req.onsuccess = () => resolve(newAlbum);
        req.onerror = () => reject(new Error(`Error saving album: ${req.error?.message}`));
      });
    });
  }

  async getAlbum(id: string): Promise<Album | null> {
    return this.withStore(ALBUMS_STORE, 'readonly', (store) => {
      return new Promise<Album | null>((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const album = (req.result as Album) || null;
          if (album?.pages) {
            album.pages.sort((a, b) => a.order - b.order);
            if (!album.sourceType && album.pages.length > 0) {
              const hasPdf = album.pages.some((p) => p.filename?.toLowerCase().includes('.pdf'));
              album.sourceType = hasPdf ? 'pdf' : 'images';
            }
          }
          resolve(album);
        };
        req.onerror = () => reject(new Error(`Error retrieving album ${id}: ${req.error?.message}`));
      });
    });
  }

  async getAlbums(): Promise<Album[]> {
    return this.withStore(ALBUMS_STORE, 'readonly', (store) => {
      return new Promise<Album[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const albums = (req.result as Album[]) || [];
          albums.forEach((a) => {
            if (a.pages) {
              a.pages.sort((p1, p2) => p1.order - p2.order);
              if (!a.sourceType && a.pages.length > 0) {
                const hasPdf = a.pages.some((p) => p.filename?.toLowerCase().includes('.pdf'));
                a.sourceType = hasPdf ? 'pdf' : 'images';
              }
            }
          });
          // Sort descending by updatedAt
          albums.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(albums);
        };
        req.onerror = () => reject(new Error(`Error retrieving albums: ${req.error?.message}`));
      });
    });
  }

  async updateAlbum(id: string, updates: Partial<Album>): Promise<Album> {
    const existing = await this.getAlbum(id);
    if (!existing) {
      throw new Error(`Album with id ${id} not found`);
    }

    // Clean up blobs of deleted pages if pages list is updated
    if (updates.pages) {
      const keptBlobIds = new Set(updates.pages.map((p) => p.blobId).filter(Boolean));
      for (const op of existing.pages || []) {
        if (op.blobId && !keptBlobIds.has(op.blobId)) {
          try {
            await this.deletePageBlob(op.blobId);
          } catch (e) {}
        }
      }
    }

    const updatedAlbum: Album = {
      ...existing,
      ...updates,
      id, // Preserve id
      updatedAt: Date.now(),
    };

    return this.withStore(ALBUMS_STORE, 'readwrite', (store) => {
      return new Promise<Album>((resolve, reject) => {
        const req = store.put(updatedAlbum);
        req.onsuccess = () => resolve(updatedAlbum);
        req.onerror = () => reject(new Error(`Error updating album ${id}: ${req.error?.message}`));
      });
    });
  }

  async replaceAlbumPages(albumId: string, newPages: AlbumPage[], sourceType?: AlbumSourceType): Promise<Album> {
    const existing = await this.getAlbum(albumId);
    if (!existing) {
      throw new Error(`Album with id ${albumId} not found`);
    }

    const oldPages = existing.pages || [];
    const oldPagesMap = new Map<string, AlbumPage>(oldPages.map((p) => [p.id, p]));
    const newPageIds = new Set(newPages.map((p) => p.id));

    // Delete obsolete blobs from IndexedDB
    for (const op of oldPages) {
      if (op.blobId && !newPageIds.has(op.blobId)) {
        try {
          await this.deletePageBlob(op.blobId);
        } catch (e) {}
      }
    }

    // Remap corrections to new pages using logical page number
    const remappedCorrections: Correction[] = (existing.corrections || []).map((c) => {
      const oldPage = oldPagesMap.get(c.pageId);
      const logicalPageNumber = c.pageNumber || oldPage?.order || 1;
      const matchingNewPage =
        newPages.find((np) => np.order === logicalPageNumber) ||
        newPages[Math.min(Math.max(0, logicalPageNumber - 1), newPages.length - 1)];

      return {
        ...c,
        pageId: matchingNewPage?.id || c.pageId,
        pageNumber: logicalPageNumber,
      };
    });

    const detectedFromPages: AlbumSourceType | undefined =
      newPages.length > 0
        ? newPages.some((p) => p.filename?.toLowerCase().includes('.pdf'))
          ? 'pdf'
          : 'images'
        : undefined;

    const finalSourceType =
      sourceType ||
      detectedFromPages ||
      existing.sourceType ||
      'images';

    const updatedAlbum: Album = {
      ...existing,
      pages: newPages,
      corrections: remappedCorrections,
      sourceType: finalSourceType,
      updatedAt: Date.now(),
    };

    return this.withStore(ALBUMS_STORE, 'readwrite', (store) => {
      return new Promise<Album>((resolve, reject) => {
        const req = store.put(updatedAlbum);
        req.onsuccess = () => resolve(updatedAlbum);
        req.onerror = () =>
          reject(new Error(`Error replacing album pages ${albumId}: ${req.error?.message}`));
      });
    });
  }

  async deleteAlbum(id: string): Promise<void> {
    const album = await this.getAlbum(id);

    // Clean up all blobs associated with this album
    if (album && album.pages) {
      for (const page of album.pages) {
        if (page.blobId) {
          try {
            await this.deletePageBlob(page.blobId);
          } catch (e) {
            console.warn(`Failed to delete blob ${page.blobId}:`, e);
          }
        }
      }
    }

    return this.withStore(ALBUMS_STORE, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error(`Error deleting album ${id}: ${req.error?.message}`));
      });
    });
  }

  async savePageBlob(blobId: string, blob: Blob): Promise<void> {
    const record: StoredBlob = {
      blobId,
      blob,
      type: blob.type,
      size: blob.size,
      createdAt: Date.now(),
    };

    return this.withStore(BLOBS_STORE, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error(`Error saving blob ${blobId}: ${req.error?.message}`));
      });
    });
  }

  async getPageBlob(blobId: string): Promise<Blob | null> {
    return this.withStore(BLOBS_STORE, 'readonly', (store) => {
      return new Promise<Blob | null>((resolve, reject) => {
        const req = store.get(blobId);
        req.onsuccess = () => {
          const record = req.result as StoredBlob | undefined;
          resolve(record ? record.blob : null);
        };
        req.onerror = () => reject(new Error(`Error retrieving blob ${blobId}: ${req.error?.message}`));
      });
    });
  }

  async deletePageBlob(blobId: string): Promise<void> {
    return this.withStore(BLOBS_STORE, 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.delete(blobId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error(`Error deleting blob ${blobId}: ${req.error?.message}`));
      });
    });
  }

  async updateCorrections(albumId: string, corrections: Correction[]): Promise<void> {
    const album = await this.getAlbum(albumId);
    if (!album) throw new Error(`Album ${albumId} not found`);

    await this.updateAlbum(albumId, {
      corrections,
      updatedAt: Date.now(),
    });
  }

  async updateStatus(
    albumId: string,
    status: AlbumStatus,
    approvedAt?: number | null
  ): Promise<void> {
    const album = await this.getAlbum(albumId);
    if (!album) throw new Error(`Album ${albumId} not found`);

    const updates: Partial<Album> = {
      status,
      updatedAt: Date.now(),
    };
    if (approvedAt !== undefined) {
      updates.approvedAt = approvedAt;
    }

    await this.updateAlbum(albumId, updates);
  }

  async uploadPagePreview(
    params: import('./storageInterface').UploadPagePreviewParams
  ): Promise<import('./storageInterface').UploadPagePreviewResult> {
    const blobKey = params.blobId || params.pageId;
    await this.savePageBlob(blobKey, params.previewBlob);

    return {
      previewStoragePath: `${params.albumId}/${params.pageId}.webp`,
      previewUrl: '',
      previewSizeBytes: params.previewBlob.size,
      previewWidth: params.previewWidth,
      previewHeight: params.previewHeight,
    };
  }
}

// Singleton storage instance
export const indexedDBStorage = new IndexedDBStorage();
