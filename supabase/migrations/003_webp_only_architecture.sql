-- ==============================================================================
-- Migration: 003_webp_only_architecture.sql
-- Zeebook Studio Wedding Album Proofing & Review System
-- Architecture Simplification: WebP-Only Preview Storage & Correction Proofing
--
-- Preserves ALL existing albums, pages, corrections, and review history.
-- Removes obsolete original-file columns from album_pages.
-- Retains single public storage bucket 'album-previews'.
-- ==============================================================================

-- 1. Ensure Table Grants for client operations
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.albums TO anon, authenticated;
GRANT ALL ON TABLE public.album_pages TO anon, authenticated;
GRANT ALL ON TABLE public.corrections TO anon, authenticated;

-- 2. Drop obsolete dual-bucket indexes if they exist
DROP INDEX IF EXISTS public.idx_album_pages_dual_paths;

-- 3. Create index for fast WebP preview lookups
CREATE INDEX IF NOT EXISTS idx_album_pages_preview_path
  ON public.album_pages(preview_storage_path);

CREATE INDEX IF NOT EXISTS idx_album_pages_album_preview
  ON public.album_pages(album_id, preview_storage_path);

-- 4. Relax legacy not-null constraint on image_path (WebP-only uses preview_storage_path & preview_url)
ALTER TABLE public.album_pages ALTER COLUMN image_path DROP NOT NULL;

-- 5. Safely drop obsolete original-file columns from public.album_pages
-- Existing preview data (preview_storage_path, preview_url, preview_width, preview_height) is 100% preserved.
ALTER TABLE public.album_pages
  DROP COLUMN IF EXISTS original_storage_path,
  DROP COLUMN IF EXISTS original_filename,
  DROP COLUMN IF EXISTS original_mime_type,
  DROP COLUMN IF EXISTS original_size_bytes,
  DROP COLUMN IF EXISTS original_width,
  DROP COLUMN IF EXISTS original_height;

-- 6. Ensure album-previews bucket exists and is configured as public
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-previews', 'album-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

GRANT ALL ON TABLE storage.objects TO anon, authenticated;
GRANT ALL ON TABLE storage.buckets TO anon, authenticated;

-- 7. Ensure Storage RLS Policies for album-previews
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

-- 8. Clean up obsolete album-originals storage policies (Client and provider will no longer access it)
-- Note: Existing files in album-originals are NOT deleted, ensuring complete safety.
DROP POLICY IF EXISTS "Access Album Originals" ON storage.objects;
DROP POLICY IF EXISTS "Upload Album Originals" ON storage.objects;
DROP POLICY IF EXISTS "Update Album Originals" ON storage.objects;
DROP POLICY IF EXISTS "Delete Album Originals" ON storage.objects;

-- 9. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
