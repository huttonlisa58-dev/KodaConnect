-- Add review-related columns to form_submissions
ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS form_submissions_form_id_status_idx
ON form_submissions(form_id, status);

-- Fix applicant_id type (must be uuid to match applicants.id)
ALTER TABLE form_submissions
ALTER COLUMN applicant_id TYPE uuid USING applicant_id::uuid;

-- Add foreign key constraints for Supabase join queries
ALTER TABLE form_submissions
ADD CONSTRAINT form_submissions_applicant_id_fkey
FOREIGN KEY (applicant_id) REFERENCES applicants(id);

ALTER TABLE form_submissions
ADD CONSTRAINT form_submissions_form_id_fkey
FOREIGN KEY (form_id) REFERENCES form_definitions(form_id);
