-- ==============================================================================
-- Migration: 004_full_album_reupload.sql
-- Zeebook Studio Wedding Album Proofing & Review System
-- Full Corrected Album Re-Upload & Review-Round Correction Mapping
--
-- Preserves ALL existing albums, pages, corrections, and review history.
-- Guarantees corrections are NEVER deleted when album pages are replaced.
-- Adds page_number column to corrections for logical page mapping across review rounds.
-- Relaxes foreign key cascade so deleting old pages cannot delete corrections.
-- ==============================================================================

-- 1. Ensure page_number column exists on corrections table
ALTER TABLE public.corrections
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

-- 2. Backfill page_number from album_pages for all existing corrections
UPDATE public.corrections c
SET page_number = p.page_number
FROM public.album_pages p
WHERE c.page_id = p.id
  AND c.page_number IS NULL;

-- 3. Create index for fast lookups by album_id and page_number
CREATE INDEX IF NOT EXISTS idx_corrections_album_page_number
  ON public.corrections(album_id, page_number);

-- 4. Ensure foreign key on corrections.page_id is RESTRICT or NO ACTION rather than CASCADE,
-- so deleting old pages cannot accidentally delete customer correction history.
DO $$
BEGIN
  -- Drop existing foreign key constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'corrections_page_id_fkey'
      AND table_name = 'corrections'
  ) THEN
    ALTER TABLE public.corrections DROP CONSTRAINT corrections_page_id_fkey;
  END IF;

  -- Re-add constraint with NO ACTION / RESTRICT (corrections are re-linked before deletion)
  ALTER TABLE public.corrections
    ADD CONSTRAINT corrections_page_id_fkey
    FOREIGN KEY (page_id)
    REFERENCES public.album_pages(id)
    ON DELETE RESTRICT;
END $$;

-- 5. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
