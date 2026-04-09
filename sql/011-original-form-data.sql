-- Add original_form_data column to form_submissions
-- This stores the original applicant submission data before any staff edits
-- Used for generating "Original Submission" PDFs

ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS original_form_data JSONB DEFAULT NULL;

COMMENT ON COLUMN form_submissions.original_form_data IS 'Snapshot of form_data before first staff edit. NULL means no edits have been made.';
