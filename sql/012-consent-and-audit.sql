-- Migration 012: Consent records, signature metadata, and submission edit history
-- Run this in your Supabase SQL editor
-- NOTE: submission_id in form_submissions is TEXT, not UUID

-- 1. Consent Records Table
-- Stores consent given by applicants during form submission
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id UUID REFERENCES applicants(id),
  submission_id TEXT REFERENCES form_submissions(submission_id),
  consent_type TEXT NOT NULL CHECK (consent_type IN ('esignature', 'staff_edit')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT,
  consent_text TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up consent by submission
CREATE INDEX IF NOT EXISTS idx_consent_records_submission_id ON consent_records(submission_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_applicant_id ON consent_records(applicant_id);

-- 2. Submission Edit History Table
-- Tracks every field-level change made by office staff
CREATE TABLE IF NOT EXISTS submission_edit_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES form_submissions(submission_id),
  edited_by TEXT NOT NULL DEFAULT 'office_staff',
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_id TEXT NOT NULL,
  field_label TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Index for looking up edit history by submission
CREATE INDEX IF NOT EXISTS idx_edit_history_submission_id ON submission_edit_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_edit_history_edited_at ON submission_edit_history(edited_at DESC);

-- 3. Signature Metadata Table
-- Stores e-signature security captures for legal defensibility
CREATE TABLE IF NOT EXISTS signature_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT REFERENCES form_submissions(submission_id),
  applicant_id UUID REFERENCES applicants(id),
  field_id TEXT NOT NULL,
  signing_session_id TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  timezone TEXT,
  user_agent TEXT,
  screen_resolution TEXT,
  device_pixel_ratio NUMERIC,
  platform TEXT,
  language TEXT,
  is_touch_device BOOLEAN DEFAULT false,
  geolocation JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up signature metadata
CREATE INDEX IF NOT EXISTS idx_signature_metadata_submission_id ON signature_metadata(submission_id);

-- 4. Add consent_records JSONB column to form_submissions
-- This stores a quick reference copy of consent data alongside the submission
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS consent_records JSONB DEFAULT NULL;

-- 5. Add signature_metadata JSONB column to form_submissions
-- Quick reference for all signature security data
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS signature_metadata JSONB DEFAULT NULL;
