-- KodaConnect Database Schema
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query → Paste → Run

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ORGANIZATION STRUCTURE
-- ============================================

-- States (NY, PA, etc.)
CREATE TABLE states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(2) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Programs (LHCSA, OLTL, etc.)
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(state_id, code)
);

-- ============================================
-- DOCUMENT TEMPLATES
-- ============================================

-- Document templates (the PDFs with field definitions)
CREATE TABLE document_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    pdf_url TEXT NOT NULL,
    pdf_type VARCHAR(20) NOT NULL DEFAULT 'flat', -- 'flat' or 'fillable'
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(program_id, slug)
);

-- Field definitions for each document template
CREATE TABLE document_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- text, textarea, date, phone, email, ssn, checkbox, checkbox_group, radio, signature, initial, file_upload
    label VARCHAR(200) NOT NULL,
    placeholder VARCHAR(200),
    help_text TEXT,
    is_required BOOLEAN DEFAULT false,
    validation_rules JSONB DEFAULT '{}',
    -- PDF positioning (for flat PDFs)
    pdf_page INTEGER,
    pdf_x DECIMAL(10,2),
    pdf_y DECIMAL(10,2),
    pdf_width DECIMAL(10,2),
    pdf_height DECIMAL(10,2),
    pdf_font_size INTEGER DEFAULT 12,
    -- For fillable PDFs
    pdf_field_name VARCHAR(200),
    -- Grouping and ordering
    section VARCHAR(100),
    sort_order INTEGER DEFAULT 0,
    -- Options for checkbox_group, radio fields
    options JSONB DEFAULT '[]',
    -- Conditional logic
    show_if JSONB, -- { "field": "field_key", "equals": "value" }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(template_id, field_key)
);

-- ============================================
-- STAFF & PERMISSIONS
-- ============================================

-- Staff users (links to Supabase auth.users)
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE, -- Links to auth.users
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    is_super_admin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff permissions (per document template)
CREATE TYPE permission_level AS ENUM ('view', 'download_pdf', 'edit_until_approval', 'edit_anytime');

CREATE TABLE staff_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    permission permission_level NOT NULL DEFAULT 'view',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(staff_id, template_id)
);

-- ============================================
-- APPLICANTS & SUBMISSIONS
-- ============================================

-- Applicants (people filling out forms)
CREATE TABLE applicants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submission status enum
CREATE TYPE submission_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected');

-- Submissions (filled forms)
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    form_data JSONB NOT NULL DEFAULT '{}',
    status submission_status NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES staff(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    filled_pdf_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- OTP & ACCESS TOKENS
-- ============================================

-- OTP codes for applicant verification
CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Access tokens for applicant form links
CREATE TABLE access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(100) NOT NULL UNIQUE,
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SMS LOG
-- ============================================

-- Track all SMS sent
CREATE TABLE sms_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    sms_type VARCHAR(50) NOT NULL, -- 'otp', 'document_link', 'reminder', 'info_request'
    twilio_sid VARCHAR(100),
    status VARCHAR(50),
    related_submission_id UUID REFERENCES submissions(id),
    sent_by UUID REFERENCES staff(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_programs_state ON programs(state_id);
CREATE INDEX idx_templates_program ON document_templates(program_id);
CREATE INDEX idx_fields_template ON document_fields(template_id);
CREATE INDEX idx_permissions_staff ON staff_permissions(staff_id);
CREATE INDEX idx_permissions_template ON staff_permissions(template_id);
CREATE INDEX idx_submissions_template ON submissions(template_id);
CREATE INDEX idx_submissions_applicant ON submissions(applicant_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_otp_phone ON otp_codes(phone);
CREATE INDEX idx_access_tokens_token ON access_tokens(token);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Public read access for states and programs (needed for forms)
CREATE POLICY "Public read states" ON states FOR SELECT USING (true);
CREATE POLICY "Public read programs" ON programs FOR SELECT USING (true);
CREATE POLICY "Public read active templates" ON document_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Public read fields" ON document_fields FOR SELECT USING (true);

-- Staff can read their own record
CREATE POLICY "Staff read own" ON staff FOR SELECT USING (auth.uid() = auth_user_id);

-- Allow service role full access (for API operations)
CREATE POLICY "Service role full access states" ON states FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access programs" ON programs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access templates" ON document_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access fields" ON document_fields FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access staff" ON staff FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access permissions" ON staff_permissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access applicants" ON applicants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access submissions" ON submissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access otp" ON otp_codes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access tokens" ON access_tokens FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access sms" ON sms_log FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- INITIAL DATA: States and Programs
-- ============================================

-- Insert states
INSERT INTO states (code, name) VALUES
    ('NY', 'New York'),
    ('PA', 'Pennsylvania');

-- Insert programs
INSERT INTO programs (state_id, code, name) VALUES
    ((SELECT id FROM states WHERE code = 'NY'), 'LHCSA', 'Licensed Home Care Services Agency'),
    ((SELECT id FROM states WHERE code = 'PA'), 'OLTL', 'Office of Long-Term Living');

-- ============================================
-- STORAGE BUCKET FOR PDFS
-- ============================================

-- Note: Run these in separate queries or via Supabase Dashboard
-- Storage → Create new bucket → Name: "documents" → Public: false
-- Storage → Create new bucket → Name: "filled-pdfs" → Public: false
-- Storage → Create new bucket → Name: "uploads" → Public: false (for applicant file uploads)
