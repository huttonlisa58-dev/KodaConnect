-- Migration 009: Add form linking columns to access_tokens
-- This allows access_tokens to link directly to form_definitions (new system)
-- while maintaining backward compatibility with the submissions-based flow

-- Add applicant_id column (allows direct linking without going through submissions)
ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id);

-- Add template_id column (for old document_templates system)
ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS template_id UUID;

-- Add form_id column (for new form_definitions system)
ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS form_id TEXT;

-- Make submission_id nullable (new tokens may not have a submission yet)
ALTER TABLE access_tokens ALTER COLUMN submission_id DROP NOT NULL;

-- Index for looking up tokens by form_id
CREATE INDEX IF NOT EXISTS idx_access_tokens_form_id ON access_tokens(form_id) WHERE form_id IS NOT NULL;

-- Index for looking up tokens by applicant_id
CREATE INDEX IF NOT EXISTS idx_access_tokens_applicant_id ON access_tokens(applicant_id) WHERE applicant_id IS NOT NULL;
