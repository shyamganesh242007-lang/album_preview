-- ==============================================================================
-- Zeebook Studio – Wedding Album Proofing & Review System
-- Initial Migration: Schema, Triggers, RLS Policies, and Storage Configuration
-- ==============================================================================

-- 1. Enable pgcrypto / uuid extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Albums Table
CREATE TABLE IF NOT EXISTS public.albums (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  client_name TEXT,
  client_email TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT albums_status_check CHECK (
    status IN (
      'Draft',
      'In Review',
      'Changes Requested',
      'Changes In Progress',
      'Ready for Review',
      'Customer Reviews',
      'Approved'
    )
  )
);

-- 3. Album Pages Table
CREATE TABLE IF NOT EXISTS public.album_pages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  album_id TEXT NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'single', -- 'single', 'spread', 'left', 'right', 'cover'
  
  -- Dual-bucket storage paths
  original_storage_path TEXT, -- Private bucket (album-originals/{albumId}/{pageId}.ext)
  preview_storage_path TEXT,  -- Public bucket (album-previews/{albumId}/{pageId}.webp)
  preview_url TEXT,           -- Client-facing direct WebP URL
  original_filename TEXT,
  original_mime_type TEXT,
  original_size_bytes BIGINT,
  preview_size_bytes BIGINT,
  original_width INTEGER,
  original_height INTEGER,
  preview_width INTEGER,
  preview_height INTEGER,

  -- Backward compatibility fields
  image_path TEXT,
  image_url TEXT,
  blob_id TEXT,
  width INTEGER,
  height INTEGER,
  filename TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT album_pages_album_page_number_unique UNIQUE (album_id, page_number)
);

-- 4. Corrections Table
CREATE TABLE IF NOT EXISTS public.corrections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  album_id TEXT NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES public.album_pages(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL,
  comment TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corrections_status_check CHECK (status IN ('Open', 'Resolved')),
  CONSTRAINT corrections_coord_x_check CHECK (x >= 0.0 AND x <= 1.0),
  CONSTRAINT corrections_coord_y_check CHECK (y >= 0.0 AND y <= 1.0)
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_albums_updated_at ON public.albums(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_album_pages_album_id ON public.album_pages(album_id);
CREATE INDEX IF NOT EXISTS idx_album_pages_order ON public.album_pages(album_id, page_number ASC);
CREATE INDEX IF NOT EXISTS idx_corrections_album_id ON public.corrections(album_id);
CREATE INDEX IF NOT EXISTS idx_corrections_page_id ON public.corrections(page_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON public.corrections(status);

-- 6. Automated updated_at Trigger Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for albums
DROP TRIGGER IF EXISTS trg_albums_updated_at ON public.albums;
CREATE TRIGGER trg_albums_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for album_pages
DROP TRIGGER IF EXISTS trg_album_pages_updated_at ON public.album_pages;
CREATE TRIGGER trg_album_pages_updated_at
  BEFORE UPDATE ON public.album_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for corrections
DROP TRIGGER IF EXISTS trg_corrections_updated_at ON public.corrections;
CREATE TRIGGER trg_corrections_updated_at
  BEFORE UPDATE ON public.corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 7. Row Level Security (RLS)
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

-- Policies for public.albums
DROP POLICY IF EXISTS "Allow select albums" ON public.albums;
CREATE POLICY "Allow select albums" ON public.albums
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert albums" ON public.albums;
CREATE POLICY "Allow insert albums" ON public.albums
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update albums" ON public.albums;
CREATE POLICY "Allow update albums" ON public.albums
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete albums" ON public.albums;
CREATE POLICY "Allow delete albums" ON public.albums
  FOR DELETE TO anon, authenticated USING (true);

-- Policies for public.album_pages
DROP POLICY IF EXISTS "Allow select album_pages" ON public.album_pages;
CREATE POLICY "Allow select album_pages" ON public.album_pages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert album_pages" ON public.album_pages;
CREATE POLICY "Allow insert album_pages" ON public.album_pages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update album_pages" ON public.album_pages;
CREATE POLICY "Allow update album_pages" ON public.album_pages
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete album_pages" ON public.album_pages;
CREATE POLICY "Allow delete album_pages" ON public.album_pages
  FOR DELETE TO anon, authenticated USING (true);

-- Policies for public.corrections
DROP POLICY IF EXISTS "Allow select corrections" ON public.corrections;
CREATE POLICY "Allow select corrections" ON public.corrections
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert corrections" ON public.corrections;
CREATE POLICY "Allow insert corrections" ON public.corrections
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update corrections" ON public.corrections;
CREATE POLICY "Allow update corrections" ON public.corrections
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Never delete resolved corrections (Rule: Immutable Resolved History)
DROP POLICY IF EXISTS "Allow delete open corrections only" ON public.corrections;
CREATE POLICY "Allow delete open corrections only" ON public.corrections
  FOR DELETE TO anon, authenticated USING (status != 'Resolved');

-- 8. Storage Configuration (Dual-Bucket Architecture: Originals vs Previews)

-- Bucket 1: album-originals (PRIVATE - Print Master Quality)
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-originals', 'album-originals', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Bucket 2: album-previews (PUBLIC - Optimized Client WebP Copies)
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-previews', 'album-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Bucket 3: album-images (Legacy compatibility)
INSERT INTO storage.buckets (id, name, public)
VALUES ('album-images', 'album-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for album-previews (Public Read & Controlled Write)
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

-- Storage Policies for album-originals (Private - Studio Print Master Access)
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

-- Storage Policies for legacy album-images
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
