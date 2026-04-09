-- ============================================================
-- KodaConnect Feature Migrations
-- Run these in your Supabase SQL Editor in order
-- ============================================================

-- ── Phase 1: User Password Management ──
-- No schema changes needed — uses Supabase Auth API (auth.admin.createUser)
-- The office_users table already exists; we just need to ensure
-- the must_change_password column exists (it's referenced in login/page.tsx)
ALTER TABLE office_users ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;

-- ── Phase 3: Bell Health CHW Support ──
-- Company-level CHW configuration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS chw_mode boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS applicant_label text DEFAULT 'Applicant';

-- CHW tracking columns on submissions
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS chw_name text;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS chw_phone text;
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS participant_name text;

-- ── Phase 4: E-Signature Security ──
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS signature_metadata jsonb;

-- ── Enable Bell Health CHW mode (run after verifying company exists) ──
-- UPDATE companies SET chw_mode = true, applicant_label = 'CHW' WHERE slug = 'bell-health';
