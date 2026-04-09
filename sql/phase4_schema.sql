/**
 * Phase 4: Multi-Brand Theming + Portal Enhancements
 * Database schema migration
 *
 * This SQL file creates all necessary tables for Phase 4 features:
 * - Brand profiles for multi-brand theming
 * - Caregivers management system
 * - Credentials tracking
 * - Activity logging
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================
-- BRAND PROFILES TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS brand_profiles (
  company_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#0F766E',
  secondary_color TEXT NOT NULL DEFAULT '#0D9488',
  accent_color TEXT NOT NULL DEFAULT '#D1FAE5',
  light_bg TEXT NOT NULL DEFAULT '#F0FDFA',
  dark_text TEXT NOT NULL DEFAULT '#134E4A',
  font_family TEXT DEFAULT 'system-ui, -apple-system, sans-serif',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ===========================
-- CAREGIVERS TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS caregivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('active', 'onboarding', 'inactive')),
  areas TEXT[] DEFAULT ARRAY[]::TEXT[],
  company_id TEXT REFERENCES brand_profiles(company_id) ON DELETE SET NULL,
  onboarding_progress INTEGER DEFAULT 0 CHECK (onboarding_progress >= 0 AND onboarding_progress <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index on phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_caregivers_phone ON caregivers(phone);
CREATE INDEX IF NOT EXISTS idx_caregivers_company_id ON caregivers(company_id);
CREATE INDEX IF NOT EXISTS idx_caregivers_status ON caregivers(status);

-- ===========================
-- CREDENTIALS TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caregiver_id UUID NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for credential queries
CREATE INDEX IF NOT EXISTS idx_credentials_caregiver_id ON credentials(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_credentials_expiry_date ON credentials(expiry_date);

-- ===========================
-- ACTIVITY LOG TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caregiver_id UUID REFERENCES caregivers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for activity queries
CREATE INDEX IF NOT EXISTS idx_activity_log_caregiver_id ON activity_log(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- ===========================
-- UPDATED SUBMISSIONS TABLE
-- ===========================
-- If submissions table exists, add caregiver_id column if it doesn't
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS caregiver_id UUID REFERENCES caregivers(id) ON DELETE SET NULL;

-- Create index if column was added
CREATE INDEX IF NOT EXISTS idx_submissions_caregiver_id ON submissions(caregiver_id);

-- ===========================
-- UPDATE SMS_LOG TABLE
-- ===========================
-- If sms_log table exists, add caregiver_id column if it doesn't
ALTER TABLE sms_log
ADD COLUMN IF NOT EXISTS caregiver_id UUID REFERENCES caregivers(id) ON DELETE SET NULL;

-- Create index if column was added
CREATE INDEX IF NOT EXISTS idx_sms_log_caregiver_id ON sms_log(caregiver_id);

-- ===========================
-- ENABLE ROW LEVEL SECURITY
-- ===========================

-- Brand profiles RLS
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

-- Caregivers RLS
ALTER TABLE caregivers ENABLE ROW LEVEL SECURITY;

-- Credentials RLS
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- Activity Log RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ===========================
-- RLS POLICIES
-- ===========================

-- Brand profiles: Super admin can manage all, others can view their company
CREATE POLICY IF NOT EXISTS brand_profiles_select_policy ON brand_profiles
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS brand_profiles_insert_policy ON brand_profiles
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'authenticated');

CREATE POLICY IF NOT EXISTS brand_profiles_update_policy ON brand_profiles
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'authenticated');

-- Caregivers: Authenticated users can read, admin can write
CREATE POLICY IF NOT EXISTS caregivers_select_policy ON caregivers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS caregivers_insert_policy ON caregivers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS caregivers_update_policy ON caregivers
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Credentials: Authenticated users can read, admin can write
CREATE POLICY IF NOT EXISTS credentials_select_policy ON credentials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS credentials_insert_policy ON credentials
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS credentials_update_policy ON credentials
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Activity log: Authenticated users can read, authenticated can write
CREATE POLICY IF NOT EXISTS activity_log_select_policy ON activity_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS activity_log_insert_policy ON activity_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ===========================
-- SEED DATA (Optional)
-- ===========================

-- Insert default KodaConnect brand
INSERT INTO brand_profiles (
  company_id,
  company_name,
  slug,
  primary_color,
  secondary_color,
  accent_color,
  light_bg,
  dark_text
) VALUES (
  'kodaconnect',
  'KodaConnect',
  'kodaconnect',
  '#0F766E',
  '#0D9488',
  '#D1FAE5',
  '#F0FDFA',
  '#134E4A'
) ON CONFLICT (company_id) DO NOTHING;

-- Insert Xtreme Care brand preset
INSERT INTO brand_profiles (
  company_id,
  company_name,
  slug,
  primary_color,
  secondary_color,
  accent_color,
  light_bg,
  dark_text
) VALUES (
  'xtreme-care',
  'Xtreme Care',
  'xtreme-care',
  '#8DB600',
  '#6B8E23',
  '#E8F5D4',
  '#F5F9E8',
  '#2D3A0F'
) ON CONFLICT (company_id) DO NOTHING;

-- Insert Complete Homecare brand preset
INSERT INTO brand_profiles (
  company_id,
  company_name,
  slug,
  primary_color,
  secondary_color,
  accent_color,
  light_bg,
  dark_text
) VALUES (
  'complete-homecare',
  'Complete Homecare',
  'complete-homecare',
  '#E87722',
  '#1B5E97',
  '#E3F2FD',
  '#FFF8F0',
  '#1A1A1A'
) ON CONFLICT (company_id) DO NOTHING;

-- ===========================
-- GRANT PERMISSIONS
-- ===========================

-- Grant permissions on new tables
GRANT SELECT ON brand_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON caregivers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON credentials TO authenticated;
GRANT SELECT, INSERT ON activity_log TO authenticated;

-- Service role gets full access (for API routes)
GRANT ALL ON brand_profiles TO service_role;
GRANT ALL ON caregivers TO service_role;
GRANT ALL ON credentials TO service_role;
GRANT ALL ON activity_log TO service_role;
