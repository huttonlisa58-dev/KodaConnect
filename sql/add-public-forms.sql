-- Add slug column to document_templates for public URLs
-- Run this in Supabase SQL Editor

-- 1. Add slug column
ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Generate slugs for existing documents (converts name to URL-friendly format)
UPDATE document_templates
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'),  -- Remove special chars
    '\s+', '-', 'g'  -- Replace spaces with hyphens
  )
)
WHERE slug IS NULL;

-- 3. Make slug unique per state/program combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_state_program_slug
ON document_templates(state, program, slug);

-- 4. RLS policies for submissions (if not already created)
DO $$
BEGIN
  -- Allow anonymous insert
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Allow anonymous insert submissions'
  ) THEN
    CREATE POLICY "Allow anonymous insert submissions" ON submissions
    FOR INSERT TO anon WITH CHECK (true);
  END IF;

  -- Allow anonymous select
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Allow anonymous select submissions'
  ) THEN
    CREATE POLICY "Allow anonymous select submissions" ON submissions
    FOR SELECT TO anon USING (true);
  END IF;

  -- Allow anonymous update
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Allow anonymous update submissions'
  ) THEN
    CREATE POLICY "Allow anonymous update submissions" ON submissions
    FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Verify the slugs were created
SELECT name, state, program, slug FROM document_templates ORDER BY state, program, name;
