-- Enhanced Forms Schema
-- Run this in Supabase SQL Editor

-- 1. Add summary columns to document_templates
ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS summary_approved BOOLEAN DEFAULT false;

-- 2. Create consent_records table for e-signature compliance
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES applicants(id) ON DELETE CASCADE,

  -- Required acknowledgments
  esignature_consent BOOLEAN NOT NULL DEFAULT false,
  staff_edit_consent BOOLEAN NOT NULL DEFAULT false,
  accuracy_certification BOOLEAN NOT NULL DEFAULT false,

  -- Security/audit data
  ip_address TEXT,
  user_agent TEXT,
  device_info JSONB,
  consent_timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_consent_records_submission_id ON consent_records(submission_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_applicant_id ON consent_records(applicant_id);

-- 4. RLS policies for consent_records
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Allow anonymous insert (for applicants submitting consent)
CREATE POLICY "Allow anonymous insert consent_records" ON consent_records
FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous select (for checking existing consent)
CREATE POLICY "Allow anonymous select consent_records" ON consent_records
FOR SELECT TO anon USING (true);

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated full access consent_records" ON consent_records
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Add signature_data column to submissions for storing drawn signatures
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS signature_data JSONB;

-- 6. Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'document_templates'
AND column_name IN ('summary', 'summary_approved');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'consent_records';
