-- Migration 013: Finalize/Delete Workflow + Role-Based Access Control
-- Adds finalized status, multi-company/form user assignments, deletion audit

-- ============================================
-- 1. USER COMPANY ASSIGNMENTS (multi-company)
-- ============================================
CREATE TABLE IF NOT EXISTS user_company_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES office_users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by TEXT,
  UNIQUE(user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_uca_user_id ON user_company_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_uca_company_id ON user_company_assignments(company_id);

-- ============================================
-- 2. USER FORM ASSIGNMENTS (staff → specific forms)
-- ============================================
CREATE TABLE IF NOT EXISTS user_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES office_users(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES form_definitions(form_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by TEXT,
  UNIQUE(user_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_ufa_user_id ON user_form_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ufa_form_id ON user_form_assignments(form_id);

-- ============================================
-- 3. SEED user_company_assignments FROM EXISTING DATA
-- For existing office_users with a company_id, create an assignment row
-- ============================================
INSERT INTO user_company_assignments (user_id, company_id, assigned_by)
SELECT id, company_id, 'migration-013'
FROM office_users
WHERE company_id IS NOT NULL
  AND active = true
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ============================================
-- 4. ADD FINALIZED STATUS TO SUBMISSIONS
-- The form_submissions table may use a CHECK constraint or text column.
-- We update the check constraint to allow 'finalized'.
-- ============================================

-- Drop existing check constraint if it exists (different DBs name it differently)
DO $$
BEGIN
  -- Try dropping named constraints
  BEGIN
    ALTER TABLE form_submissions DROP CONSTRAINT IF EXISTS form_submissions_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE form_submissions DROP CONSTRAINT IF EXISTS chk_submission_status;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Add new check constraint that includes 'finalized'
ALTER TABLE form_submissions
  ADD CONSTRAINT form_submissions_status_check
  CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'finalized'));

-- ============================================
-- 5. MIGRATE EXISTING APPROVED SUBMISSIONS TO FINALIZED
-- ============================================
UPDATE form_submissions
SET status = 'finalized',
    updated_at = NOW()
WHERE status = 'approved';

-- ============================================
-- 6. DELETION AUDIT LOG
-- Records submission deletions before hard-delete occurs
-- ============================================
CREATE TABLE IF NOT EXISTS submission_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  form_id UUID,
  applicant_id UUID,
  applicant_name TEXT,
  form_name TEXT,
  deleted_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  form_data JSONB,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_sdl_deleted_at ON submission_deletion_log(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sdl_deleted_by ON submission_deletion_log(deleted_by);
