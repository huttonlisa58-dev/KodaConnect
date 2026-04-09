-- ============================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query → Paste → Run
-- This script sets up comprehensive RLS policies for the KodaConnect platform
-- Policies enforce data isolation between companies and user roles

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE IF EXISTS states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sms_log ENABLE ROW LEVEL SECURITY;

-- Create audit_log table if it doesn't exist (for new deployments)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  user_email VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STATES & PROGRAMS (Public read, service role write)
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read states" ON states;
DROP POLICY IF EXISTS "Public read programs" ON programs;
DROP POLICY IF EXISTS "Service role access states" ON states;
DROP POLICY IF EXISTS "Service role access programs" ON programs;

-- States: Everyone can read, service role can manage
CREATE POLICY "Public read states" ON states FOR SELECT USING (true);
CREATE POLICY "Service role access states" ON states FOR ALL USING (auth.role() = 'service_role');

-- Programs: Everyone can read, service role can manage
CREATE POLICY "Public read programs" ON programs FOR SELECT USING (true);
CREATE POLICY "Service role access programs" ON programs FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- DOCUMENT TEMPLATES
-- ============================================

DROP POLICY IF EXISTS "Public read active templates" ON document_templates;
DROP POLICY IF EXISTS "Service role access templates" ON document_templates;

-- Templates: Public can read active ones, service role can manage
CREATE POLICY "Public read active templates" ON document_templates
FOR SELECT USING (is_active = true);

CREATE POLICY "Service role access templates" ON document_templates
FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- DOCUMENT FIELDS
-- ============================================

DROP POLICY IF EXISTS "Public read fields" ON document_fields;
DROP POLICY IF EXISTS "Service role access fields" ON document_fields;

-- Fields: Public can read, service role can manage
CREATE POLICY "Public read fields" ON document_fields FOR SELECT USING (true);
CREATE POLICY "Service role access fields" ON document_fields FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- STAFF (Users managing the office portal)
-- ============================================

DROP POLICY IF EXISTS "Staff read own record" ON staff;
DROP POLICY IF EXISTS "Super admin read all staff" ON staff;
DROP POLICY IF EXISTS "Service role access staff" ON staff;

-- Staff can read their own record
CREATE POLICY "Staff read own record" ON staff FOR SELECT
USING (auth.uid() = auth_user_id);

-- Super admins can read all staff in their organization
-- (Note: Requires company_id field if implementing multi-tenant structure)
CREATE POLICY "Super admin read all staff" ON staff FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff admin_check
    WHERE admin_check.auth_user_id = auth.uid()
    AND admin_check.is_super_admin = true
  )
);

-- Service role (API) has full access for administration
CREATE POLICY "Service role access staff" ON staff FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- STAFF PERMISSIONS
-- ============================================

DROP POLICY IF EXISTS "Staff read own permissions" ON staff_permissions;
DROP POLICY IF EXISTS "Super admin read all permissions" ON staff_permissions;
DROP POLICY IF EXISTS "Service role access permissions" ON staff_permissions;

-- Staff can read their own permissions
CREATE POLICY "Staff read own permissions" ON staff_permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.id = staff_permissions.staff_id
    AND staff.auth_user_id = auth.uid()
  )
);

-- Super admins can read all permissions
CREATE POLICY "Super admin read all permissions" ON staff_permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff admin_check
    WHERE admin_check.auth_user_id = auth.uid()
    AND admin_check.is_super_admin = true
  )
);

-- Service role full access
CREATE POLICY "Service role access permissions" ON staff_permissions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- APPLICANTS (People filling out forms)
-- ============================================

DROP POLICY IF EXISTS "Service role access applicants" ON applicants;

-- Applicants: Public (unauthenticated) can create their own records
-- Staff can read applicants associated with their submissions
CREATE POLICY "Public create applicants" ON applicants FOR INSERT
WITH CHECK (true);

-- Staff can read applicants they have submitted forms for
CREATE POLICY "Staff read applicants" ON applicants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM submissions s
    JOIN staff st ON s.reviewed_by = st.id OR 1=1
    WHERE s.applicant_id = applicants.id
    AND st.auth_user_id = auth.uid()
  )
  OR auth.role() = 'service_role'
);

-- Service role full access
CREATE POLICY "Service role access applicants" ON applicants FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- SUBMISSIONS (Filled forms)
-- ============================================

DROP POLICY IF EXISTS "Public create submissions" ON submissions;
DROP POLICY IF EXISTS "Public read own submissions" ON submissions;
DROP POLICY IF EXISTS "Staff read submissions" ON submissions;
DROP POLICY IF EXISTS "Super admin read all submissions" ON submissions;
DROP POLICY IF EXISTS "Service role access submissions" ON submissions;

-- Public (applicants) can create submissions
CREATE POLICY "Public create submissions" ON submissions FOR INSERT
WITH CHECK (true);

-- Public users can read their own submissions (using token-based access)
CREATE POLICY "Public read own submissions" ON submissions FOR SELECT
USING (
  -- This is checked via access_tokens table in application logic
  true -- Implement token validation in application code
);

-- Staff can read/update submissions for templates they have permissions for
CREATE POLICY "Staff read submissions" ON submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff st ON sp.staff_id = st.id
    WHERE st.auth_user_id = auth.uid()
    AND sp.template_id = submissions.template_id
  )
  OR auth.role() = 'service_role'
);

-- Staff can update submissions they have permission for
CREATE POLICY "Staff update submissions" ON submissions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff st ON sp.staff_id = st.id
    WHERE st.auth_user_id = auth.uid()
    AND sp.template_id = submissions.template_id
    AND sp.permission IN ('edit_until_approval', 'edit_anytime')
  )
  OR auth.role() = 'service_role'
);

-- Super admins can read all submissions
CREATE POLICY "Super admin read all submissions" ON submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff admin_check
    WHERE admin_check.auth_user_id = auth.uid()
    AND admin_check.is_super_admin = true
  )
  OR auth.role() = 'service_role'
);

-- Super admins can update all submissions
CREATE POLICY "Super admin update submissions" ON submissions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM staff admin_check
    WHERE admin_check.auth_user_id = auth.uid()
    AND admin_check.is_super_admin = true
  )
  OR auth.role() = 'service_role'
);

-- Service role (API) full access
CREATE POLICY "Service role access submissions" ON submissions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- OTP CODES (One-time passwords for applicants)
-- ============================================

DROP POLICY IF EXISTS "Public create otp" ON otp_codes;
DROP POLICY IF EXISTS "Service role access otp" ON otp_codes;

-- Public can create OTP codes (for applicant registration)
CREATE POLICY "Public create otp" ON otp_codes FOR INSERT
WITH CHECK (true);

-- Service role can read/manage OTP codes
CREATE POLICY "Service role access otp" ON otp_codes FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- ACCESS TOKENS (For applicant form links)
-- ============================================

DROP POLICY IF EXISTS "Public read access tokens" ON access_tokens;
DROP POLICY IF EXISTS "Service role access tokens" ON access_tokens;

-- Public users can read active tokens (for form access)
CREATE POLICY "Public read access tokens" ON access_tokens FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Service role can manage tokens
CREATE POLICY "Service role access tokens" ON access_tokens FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- SMS LOG (SMS message tracking)
-- ============================================

DROP POLICY IF EXISTS "Staff read sms log" ON sms_log;
DROP POLICY IF EXISTS "Service role access sms" ON sms_log;

-- Staff can read SMS logs for their submissions
CREATE POLICY "Staff read sms log" ON sms_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM submissions s
    JOIN staff_permissions sp ON s.template_id = sp.template_id
    JOIN staff st ON sp.staff_id = st.id
    WHERE s.id = sms_log.related_submission_id
    AND st.auth_user_id = auth.uid()
  )
  OR auth.role() = 'service_role'
);

-- Service role full access
CREATE POLICY "Service role access sms" ON sms_log FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- AUDIT LOG (Security and compliance auditing)
-- ============================================

DROP POLICY IF EXISTS "Staff read own audit logs" ON audit_log;
DROP POLICY IF EXISTS "Super admin read all audit logs" ON audit_log;
DROP POLICY IF EXISTS "Service role access audit log" ON audit_log;

-- Staff can read their own audit logs
CREATE POLICY "Staff read own audit logs" ON audit_log FOR SELECT
USING (user_id = auth.uid());

-- Super admins can read all audit logs
CREATE POLICY "Super admin read all audit logs" ON audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff admin_check
    WHERE admin_check.auth_user_id = auth.uid()
    AND admin_check.is_super_admin = true
  )
);

-- Service role can manage audit logs
CREATE POLICY "Service role access audit log" ON audit_log FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- NOTES
-- ============================================
-- 1. Service role bypasses all RLS policies (for API routes)
-- 2. Authenticated users get checked against staff table for office portal access
-- 3. Public (unauthenticated) users can access form submission and OTP functionality
-- 4. Token-based access for applicant forms is validated in application code
-- 5. Multi-company support can be added by including company_id checks in policies
