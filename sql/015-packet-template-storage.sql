-- 015-packet-template-storage.sql
-- Add template PDF storage and field position map to form_packets
-- This enables Phase 4: PDF Template Fill (overlay data onto original PDF)

-- Store the original uploaded PDF as base64 for template overlay
ALTER TABLE form_packets ADD COLUMN IF NOT EXISTS template_pdf_base64 TEXT;

-- Store field-to-position mapping: { field_id: { label, positions: [{page, x, y, width, height}] } }
ALTER TABLE form_packets ADD COLUMN IF NOT EXISTS field_position_map JSONB DEFAULT '{}'::jsonb;

-- Make company_id nullable (super_admin has null company_id)
ALTER TABLE form_packets ALTER COLUMN company_id DROP NOT NULL;

-- Drop the foreign key constraint on company_id so null is allowed
-- (The constraint name may vary; use DO block to handle gracefully)
DO $$
BEGIN
  ALTER TABLE form_packets DROP CONSTRAINT IF EXISTS fk_form_packets_company;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Re-add as nullable foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_form_packets_company_nullable'
  ) THEN
    ALTER TABLE form_packets
      ADD CONSTRAINT fk_form_packets_company_nullable
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
