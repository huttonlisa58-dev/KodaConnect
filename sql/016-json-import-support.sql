-- =============================================
-- 016: JSON Package Import Support
-- =============================================
-- Adds columns needed for the JSON form package import pipeline.
-- This supports importing pre-processed form packages from the
-- Claude offline workflow alongside the existing AI analysis flow.

-- Add metadata JSONB to form_definitions for storing form_type and other metadata
-- (may already exist as some form definitions store metadata)
ALTER TABLE form_definitions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add page_sizes to form_packets for coordinate conversion between
-- top-left (PDF.js/PyMuPDF) and bottom-left (pdf-lib) coordinate systems.
-- Format: { "1": [612, 792], "24": [595, 842] } — page number → [width, height]
ALTER TABLE form_packets
  ADD COLUMN IF NOT EXISTS page_sizes JSONB DEFAULT '{}'::jsonb;

-- Track how the packet was imported for analytics and debugging
-- Values: 'claude_analyze' (existing AI flow), 'json_package' (new offline flow)
ALTER TABLE form_packets
  ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'claude_analyze';

-- Index for efficient queries by form_type stored in metadata
CREATE INDEX IF NOT EXISTS idx_form_definitions_metadata
  ON form_definitions USING GIN (metadata);

-- Index for querying by import source
CREATE INDEX IF NOT EXISTS idx_form_packets_import_source
  ON form_packets (import_source);
