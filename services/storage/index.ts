import { AlbumStorage } from './storageInterface';
import { supabaseStorage } from './supabaseStorage';
import { indexedDBStorage } from './indexedDbStorage';

// Supabase is the cloud source of truth, with IndexedDB retained for local demo/cache
export const storage: AlbumStorage = supabaseStorage;

export * from './storageInterface';
export * from './supabaseStorage';
export * from './indexedDbStorage';
