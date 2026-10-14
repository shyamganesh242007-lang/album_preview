-- ==============================================================================
-- Migration: 002_dual_bucket_upgrade.sql
-- Safe, Non-Destructive Upgrade for Zeebook Studio Dual-Bucket Architecture
-- Preserves existing data, albums, pages, corrections.
-- ==============================================================================

-- 1. Grant table-level access to anon & authenticated roles for client operations
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.albums TO anon, authenticated;
GRANT ALL ON TABLE public.album_pages TO anon, authenticated;
GRANT ALL ON TABLE public.corrections TO anon, authenticated;

-- 2. Safely add dual-bucket metadata columns to public.album_pages (Non-destructive)
ALTER TABLE public.album_pages
  ADD COLUMN IF NOT EXISTS original_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS preview_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS original_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS preview_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS original_width INTEGER,
  ADD COLUMN IF NOT EXISTS original_height INTEGER,
  ADD COLUMN IF NOT EXISTS preview_width INTEGER,
  ADD COLUMN IF NOT EXISTS preview_height INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure performance indexes exist
CREATE INDEX IF NOT EXISTS idx_album_pages_dual_paths
  ON public.album_pages(original_storage_path, preview_storage_path);

-- 3. Configure Row Level Security (RLS) policies for Albums
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select albums" ON public.albums;
CREATE POLICY "Public select albums" ON public.albums
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert albums" ON public.albums;
CREATE POLICY "Public insert albums" ON public.albums
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public update albums" ON public.albums;
CREATE POLICY "Public update albums" ON public.albums
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete albums" ON public.albums;
CREATE POLICY "Public delete albums" ON public.albums
  FOR DELETE TO anon, authenticated USING (true);

-- 4. Configure Row Level Security (RLS) policies for Album Pages
ALTER TABLE public.album_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select album_pages" ON public.album_pages;
CREATE POLICY "Public select album_pages" ON public.album_pages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert album_pages" ON public.album_pages;
CREATE POLICY "Public insert album_pages" ON public.album_pages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public update album_pages" ON public.album_pages;
CREATE POLICY "Public update album_pages" ON public.album_pages
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete album_pages" ON public.album_pages;
CREATE POLICY "Public delete album_pages" ON public.album_pages
  FOR DELETE TO anon, authenticated USING (true);

-- 5. Configure Row Level Security (RLS) policies for Corrections
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select corrections" ON public.corrections;
CREATE POLICY "Public select corrections" ON public.corrections
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert corrections" ON public.corrections;
CREATE POLICY "Public insert corrections" ON public.corrections
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public update corrections" ON public.corrections;
CREATE POLICY "Public update corrections" ON public.corrections
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete corrections" ON public.corrections;
CREATE POLICY "Public delete corrections" ON public.corrections
  FOR DELETE TO anon, authenticated USING (true);

-- 6. Provision Supabase Storage Buckets (Safe, idempotent upsert)
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-originals', 'album-originals', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('album-previews', 'album-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('album-images', 'album-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Grant permissions on storage schema
GRANT ALL ON TABLE storage.objects TO anon, authenticated;
GRANT ALL ON TABLE storage.buckets TO anon, authenticated;

-- 7. Storage RLS Policies for album-previews (Public web previews)
DROP POLICY IF EXISTS "Public Read Album Previews" ON storage.objects;
CREATE POLICY "Public Read Album Previews" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'album-previews');

DROP POLICY IF EXISTS "Upload Album Previews" ON storage.objects;
CREATE POLICY "Upload Album Previews" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'album-previews');

DROP POLICY IF EXISTS "Update Album Previews" ON storage.objects;
CREATE POLICY "Update Album Previews" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'album-previews');

DROP POLICY IF EXISTS "Delete Album Previews" ON storage.objects;
CREATE POLICY "Delete Album Previews" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'album-previews');

-- 8. Storage RLS Policies for album-originals (Studio Print Master Access)
DROP POLICY IF EXISTS "Access Album Originals" ON storage.objects;
CREATE POLICY "Access Album Originals" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'album-originals');

DROP POLICY IF EXISTS "Upload Album Originals" ON storage.objects;
CREATE POLICY "Upload Album Originals" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'album-originals');

DROP POLICY IF EXISTS "Update Album Originals" ON storage.objects;
CREATE POLICY "Update Album Originals" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'album-originals');

DROP POLICY IF EXISTS "Delete Album Originals" ON storage.objects;
CREATE POLICY "Delete Album Originals" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'album-originals');

-- 9. Storage RLS Policies for legacy album-images
DROP POLICY IF EXISTS "Public Access Album Images" ON storage.objects;
CREATE POLICY "Public Access Album Images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'album-images');

DROP POLICY IF EXISTS "Public Upload Album Images" ON storage.objects;
CREATE POLICY "Public Upload Album Images" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'album-images');

DROP POLICY IF EXISTS "Public Update Album Images" ON storage.objects;
CREATE POLICY "Public Update Album Images" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'album-images');

DROP POLICY IF EXISTS "Public Delete Album Images" ON storage.objects;
CREATE POLICY "Public Delete Album Images" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'album-images');

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
