-- Company Structure Migration
-- This migration replaces states/programs with a company-based structure
-- Run this in Supabase SQL Editor

-- =====================================================
-- 1. CREATE COMPANIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e40af', -- For branding
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);

-- Insert initial companies
-- NOTE: Update logo_url values after uploading logos to Supabase Storage
INSERT INTO companies (name, slug, logo_url, primary_color) VALUES
  ('X-treme Care', 'xtreme-care', '/logos/xtreme-care.png', '#84cc16'),
  ('Complete Homecare Inc.', 'complete-homecare-inc', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare PA', 'complete-homecare-pa', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare GA', 'complete-homecare-ga', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare MO', 'complete-homecare-mo', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare NJ', 'complete-homecare-nj', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare OH', 'complete-homecare-oh', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare IN', 'complete-homecare-in', '/logos/complete-homecare.png', '#f97316'),
  ('Complete Homecare MI', 'complete-homecare-mi', '/logos/complete-homecare.png', '#f97316')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 2. ADD COMPANY REFERENCE TO DOCUMENT_TEMPLATES
-- =====================================================
ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Create index for company lookups
CREATE INDEX IF NOT EXISTS idx_document_templates_company_id ON document_templates(company_id);

-- =====================================================
-- 3. CREATE OFFICE_USERS TABLE WITH ROLES
-- =====================================================
CREATE TYPE user_role AS ENUM ('staff', 'admin', 'super_admin');

CREATE TABLE IF NOT EXISTS office_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'staff',
  company_id UUID REFERENCES companies(id), -- NULL means access to all companies (for super_admin)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_office_users_email ON office_users(email);
CREATE INDEX IF NOT EXISTS idx_office_users_company_id ON office_users(company_id);

-- =====================================================
-- 4. CREATE SUBMISSION_AUDIT_LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS submission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES office_users(id),
  action TEXT NOT NULL, -- 'created', 'field_updated', 'status_changed', 'approved', etc.
  field_name TEXT, -- Which field was changed (if applicable)
  old_value JSONB, -- Previous value
  new_value JSONB, -- New value
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_submission_audit_log_submission_id ON submission_audit_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_audit_log_user_id ON submission_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_audit_log_created_at ON submission_audit_log(created_at);

-- =====================================================
-- 5. UPDATE SUBMISSIONS TABLE
-- =====================================================
-- Add new columns for auto-save and status tracking
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES office_users(id);

-- Create index for company lookups
CREATE INDEX IF NOT EXISTS idx_submissions_company_id ON submissions(company_id);

-- =====================================================
-- 6. ADD FILLABLE PDF SUPPORT TO DOCUMENT_TEMPLATES
-- =====================================================
ALTER TABLE document_templates
ADD COLUMN IF NOT EXISTS is_fillable_pdf BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pdf_form_fields JSONB; -- Stores the actual PDF field names and their mapping

-- =====================================================
-- 6b. ADD PDF FIELD NAME TO DOCUMENT_FIELDS
-- =====================================================
ALTER TABLE document_fields
ADD COLUMN IF NOT EXISTS pdf_field_name TEXT; -- Maps to the actual PDF form field name

-- =====================================================
-- 7. RLS POLICIES FOR NEW TABLES
-- =====================================================

-- Companies table policies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous select companies" ON companies
FOR SELECT TO anon USING (active = true);

CREATE POLICY "Allow authenticated full access companies" ON companies
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Office users table policies
ALTER TABLE office_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access office_users" ON office_users
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Submission audit log policies
ALTER TABLE submission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert submission_audit_log" ON submission_audit_log
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated full access submission_audit_log" ON submission_audit_log
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- 8. VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the migration was successful

SELECT 'Companies created:' as info, count(*) as count FROM companies;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'document_templates'
AND column_name IN ('company_id', 'is_fillable_pdf', 'pdf_form_fields');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'submissions'
AND column_name IN ('company_id', 'current_step', 'total_steps', 'last_saved_at', 'approved_at', 'approved_by');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'office_users';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'submission_audit_log';
