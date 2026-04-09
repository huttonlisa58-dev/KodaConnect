-- Create form_packets table for multi-form document packets
CREATE TABLE IF NOT EXISTS form_packets (
  id BIGSERIAL PRIMARY KEY,
  packet_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  packet_name TEXT NOT NULL,
  description TEXT,
  master_form_id TEXT NOT NULL,

  -- Sub-forms metadata stored as JSONB array
  sub_forms JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Packet status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key references
  CONSTRAINT fk_form_packets_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_form_packets_form FOREIGN KEY (master_form_id) REFERENCES form_definitions(form_id) ON DELETE CASCADE
);

-- Create index on company_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_form_packets_company_id ON form_packets(company_id);

-- Create index on master_form_id for form lookups
CREATE INDEX IF NOT EXISTS idx_form_packets_master_form_id ON form_packets(master_form_id);

-- Create index on status for status-based queries
CREATE INDEX IF NOT EXISTS idx_form_packets_status ON form_packets(status);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_form_packets_company_status ON form_packets(company_id, status);

-- Create updated_at trigger to auto-update timestamp
CREATE OR REPLACE FUNCTION update_form_packets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_packets_updated_at_trigger
  BEFORE UPDATE ON form_packets
  FOR EACH ROW
  EXECUTE FUNCTION update_form_packets_updated_at();

-- Table for storing field mappings from sub-forms to master form
CREATE TABLE IF NOT EXISTS packet_field_mappings (
  id BIGSERIAL PRIMARY KEY,
  mapping_id TEXT NOT NULL UNIQUE,
  form_id TEXT NOT NULL,
  company_id TEXT NOT NULL,

  -- Field mappings as JSONB array
  field_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Deduplication report with conflict details
  deduplication_report JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  CONSTRAINT fk_packet_mappings_form FOREIGN KEY (form_id) REFERENCES form_definitions(form_id) ON DELETE CASCADE,
  CONSTRAINT fk_packet_mappings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Create indexes for packet field mappings
CREATE INDEX IF NOT EXISTS idx_packet_mappings_form_id ON packet_field_mappings(form_id);
CREATE INDEX IF NOT EXISTS idx_packet_mappings_company_id ON packet_field_mappings(company_id);

-- Create updated_at trigger for packet_field_mappings
CREATE OR REPLACE FUNCTION update_packet_field_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER packet_field_mappings_updated_at_trigger
  BEFORE UPDATE ON packet_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_packet_field_mappings_updated_at();

-- Table for storing PDF analysis results
CREATE TABLE IF NOT EXISTS packet_analyses (
  id BIGSERIAL PRIMARY KEY,
  analysis_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  packet_name TEXT NOT NULL,
  page_count INT,

  -- Full analysis data including Claude response
  analyzed_data JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key
  CONSTRAINT fk_packet_analyses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Create indexes for packet analyses
CREATE INDEX IF NOT EXISTS idx_packet_analyses_company_id ON packet_analyses(company_id);
CREATE INDEX IF NOT EXISTS idx_packet_analyses_analysis_id ON packet_analyses(analysis_id);

-- Create updated_at trigger for packet_analyses
CREATE OR REPLACE FUNCTION update_packet_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER packet_analyses_updated_at_trigger
  BEFORE UPDATE ON packet_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_packet_analyses_updated_at();

-- Enable RLS on form_packets
ALTER TABLE form_packets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role has full access
CREATE POLICY form_packets_service_full_access ON form_packets
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- RLS Policy: Users can read packets from their company
CREATE POLICY form_packets_user_select ON form_packets
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM user_company_role
    WHERE user_id = auth.uid()
  ));

-- RLS Policy: Users with admin/manager role can insert/update/delete
CREATE POLICY form_packets_user_modify ON form_packets
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM user_company_role
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'recruiter')
    )
  );

-- Enable RLS on packet_field_mappings
ALTER TABLE packet_field_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role has full access
CREATE POLICY packet_mappings_service_full_access ON packet_field_mappings
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- RLS Policy: Users can read mappings from their company
CREATE POLICY packet_mappings_user_select ON packet_field_mappings
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM user_company_role
    WHERE user_id = auth.uid()
  ));

-- Enable RLS on packet_analyses
ALTER TABLE packet_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role has full access
CREATE POLICY packet_analyses_service_full_access ON packet_analyses
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- RLS Policy: Users can read analyses from their company
CREATE POLICY packet_analyses_user_select ON packet_analyses
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM user_company_role
    WHERE user_id = auth.uid()
  ));

-- Create view for packet summary information
CREATE OR REPLACE VIEW packet_summary AS
SELECT
  p.packet_id,
  p.company_id,
  p.packet_name,
  p.status,
  p.created_at,
  p.updated_at,
  jsonb_array_length(p.sub_forms) as sub_form_count,
  (p.sub_forms -> 0 ->> 'page_count')::int as total_pages,
  f.form_name,
  f.sections,
  jsonb_array_length(f.sections) as section_count
FROM form_packets p
LEFT JOIN form_definitions f ON p.master_form_id = f.form_id;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON form_packets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON packet_field_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON packet_analyses TO authenticated;
GRANT SELECT ON packet_summary TO authenticated;

GRANT ALL ON form_packets TO service_role;
GRANT ALL ON packet_field_mappings TO service_role;
GRANT ALL ON packet_analyses TO service_role;
GRANT ALL ON packet_summary TO service_role;
