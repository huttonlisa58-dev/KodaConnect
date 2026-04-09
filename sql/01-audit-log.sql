-- ============================================
-- AUDIT LOG TABLE
-- ============================================
-- Run this in Supabase SQL Editor if not already created
-- This table tracks all significant actions for compliance and security

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

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(user_email);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
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

-- Service role (API) can manage audit logs
CREATE POLICY "Service role access audit log" ON audit_log FOR ALL
USING (auth.role() = 'service_role');
