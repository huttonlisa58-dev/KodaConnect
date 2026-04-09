-- Onboarding Bundles Infrastructure Migration
-- Creates tables, enums, indexes, RLS policies, functions, and triggers
-- for managing onboarding templates and caregiver onboarding bundles
--
-- Actual DB table references verified:
--   office_users (id UUID PK, role user_role, company_id UUID)
--   user_company_assignments (user_id UUID → office_users, company_id UUID → companies)
--   staff (id UUID PK, auth_user_id UUID, is_super_admin BOOLEAN)
--   form_packets (id BIGSERIAL PK, company_id TEXT)
--   applicants (id UUID PK)
--   companies (id UUID PK)

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_role') THEN
    CREATE TYPE onboarding_role AS ENUM ('applicant', 'rn_evaluator', 'hr_admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bundle_status') THEN
    CREATE TYPE bundle_status AS ENUM ('not_started', 'in_progress', 'pending_review', 'complete');
  END IF;
END $$;

-- ============================================================================
-- PREREQUISITE: Add form_packet_id column to form_submissions
-- This links submissions to their parent form packet for bundle tracking
-- ============================================================================

ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS form_packet_id BIGINT REFERENCES form_packets(id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_packet_id
    ON form_submissions(form_packet_id);

-- ============================================================================
-- TABLES
-- ============================================================================

-- onboarding_templates: Stores saved onboarding recipes (one per company/state combo)
CREATE TABLE IF NOT EXISTS onboarding_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    state TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, name)
);

-- template_packets: Defines which packets are in each template and who fills them
-- NOTE: form_packet_id is BIGINT to match form_packets.id (BIGSERIAL)
CREATE TABLE IF NOT EXISTS template_packets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    form_packet_id BIGINT NOT NULL REFERENCES form_packets(id) ON DELETE CASCADE,
    assigned_to_role onboarding_role NOT NULL DEFAULT 'applicant',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(template_id, form_packet_id)
);

-- onboarding_bundles: One row per caregiver being onboarded
CREATE TABLE IF NOT EXISTS onboarding_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES onboarding_templates(id),
    applicant_id UUID NOT NULL REFERENCES applicants(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    status bundle_status NOT NULL DEFAULT 'not_started',
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    notes TEXT
);

-- bundle_packet_overrides: Per-bundle customization for future use
-- NOTE: form_packet_id is BIGINT to match form_packets.id (BIGSERIAL)
CREATE TABLE IF NOT EXISTS bundle_packet_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id UUID NOT NULL REFERENCES onboarding_bundles(id) ON DELETE CASCADE,
    form_packet_id BIGINT NOT NULL REFERENCES form_packets(id),
    action TEXT NOT NULL CHECK (action IN ('skip', 'add')),
    assigned_to_role onboarding_role,
    reason TEXT,
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(bundle_id, form_packet_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_company
    ON onboarding_templates(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_template_packets_template
    ON template_packets(template_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_bundles_company_status
    ON onboarding_bundles(company_id, status);

CREATE INDEX IF NOT EXISTS idx_bundles_applicant
    ON onboarding_bundles(applicant_id);

CREATE INDEX IF NOT EXISTS idx_bundles_created
    ON onboarding_bundles(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Access pattern:
--   SELECT → user assigned to the company via user_company_assignments
--   INSERT/UPDATE/DELETE → user assigned + has admin/super_admin role in office_users
--   Super admin fallback → office_users.role = 'super_admin'
--   Service role → full access (used by Next.js API routes)

-- Enable RLS on all tables
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_packet_overrides ENABLE ROW LEVEL SECURITY;

-- ── Service role: full access on all tables ──
CREATE POLICY onboarding_templates_service_full_access ON onboarding_templates
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY template_packets_service_full_access ON template_packets
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY onboarding_bundles_service_full_access ON onboarding_bundles
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY bundle_packet_overrides_service_full_access ON bundle_packet_overrides
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ── onboarding_templates RLS ──

CREATE POLICY onboarding_templates_select ON onboarding_templates
  FOR SELECT USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      WHERE uca.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_templates_insert ON onboarding_templates
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_templates_update ON onboarding_templates
  FOR UPDATE USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_templates_delete ON onboarding_templates
  FOR DELETE USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

-- ── template_packets RLS (inherit through template's company) ──

CREATE POLICY template_packets_select ON template_packets
  FOR SELECT USING (
    template_id IN (
      SELECT ot.id FROM onboarding_templates ot
      WHERE ot.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        WHERE uca.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY template_packets_insert ON template_packets
  FOR INSERT WITH CHECK (
    template_id IN (
      SELECT ot.id FROM onboarding_templates ot
      WHERE ot.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY template_packets_update ON template_packets
  FOR UPDATE USING (
    template_id IN (
      SELECT ot.id FROM onboarding_templates ot
      WHERE ot.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY template_packets_delete ON template_packets
  FOR DELETE USING (
    template_id IN (
      SELECT ot.id FROM onboarding_templates ot
      WHERE ot.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

-- ── onboarding_bundles RLS ──

CREATE POLICY onboarding_bundles_select ON onboarding_bundles
  FOR SELECT USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      WHERE uca.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_bundles_insert ON onboarding_bundles
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_bundles_update ON onboarding_bundles
  FOR UPDATE USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY onboarding_bundles_delete ON onboarding_bundles
  FOR DELETE USING (
    company_id IN (
      SELECT uca.company_id FROM user_company_assignments uca
      JOIN office_users ou ON ou.id = uca.user_id
      WHERE uca.user_id = auth.uid()
        AND ou.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

-- ── bundle_packet_overrides RLS (inherit through bundle's company) ──

CREATE POLICY bundle_packet_overrides_select ON bundle_packet_overrides
  FOR SELECT USING (
    bundle_id IN (
      SELECT ob.id FROM onboarding_bundles ob
      WHERE ob.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        WHERE uca.user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY bundle_packet_overrides_insert ON bundle_packet_overrides
  FOR INSERT WITH CHECK (
    bundle_id IN (
      SELECT ob.id FROM onboarding_bundles ob
      WHERE ob.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY bundle_packet_overrides_update ON bundle_packet_overrides
  FOR UPDATE USING (
    bundle_id IN (
      SELECT ob.id FROM onboarding_bundles ob
      WHERE ob.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

CREATE POLICY bundle_packet_overrides_delete ON bundle_packet_overrides
  FOR DELETE USING (
    bundle_id IN (
      SELECT ob.id FROM onboarding_bundles ob
      WHERE ob.company_id IN (
        SELECT uca.company_id FROM user_company_assignments uca
        JOIN office_users ou ON ou.id = uca.user_id
        WHERE uca.user_id = auth.uid()
          AND ou.role IN ('admin', 'super_admin')
      )
    )
    OR EXISTS (
      SELECT 1 FROM office_users
      WHERE office_users.id = auth.uid()
      AND office_users.role = 'super_admin'
    )
  );

-- ============================================================================
-- HELPER FUNCTION: recalculate_bundle_status
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_bundle_status(bundle_uuid UUID)
RETURNS void AS $$
DECLARE
    v_template_id UUID;
    v_applicant_id UUID;
    v_required_count INTEGER;
    v_approved_count INTEGER;
    v_applicant_submitted_count INTEGER;
    v_applicant_total_count INTEGER;
    v_has_any_submission BOOLEAN;
    v_new_status bundle_status;
BEGIN
    -- Get template and applicant for this bundle
    SELECT template_id, applicant_id INTO v_template_id, v_applicant_id
    FROM onboarding_bundles
    WHERE id = bundle_uuid;

    IF v_template_id IS NULL THEN
        RETURN;
    END IF;

    -- Count required packets
    SELECT COUNT(*) INTO v_required_count
    FROM template_packets
    WHERE template_id = v_template_id AND is_required = true;

    -- Count approved submissions for required packets
    SELECT COUNT(DISTINCT tp.id) INTO v_approved_count
    FROM template_packets tp
    LEFT JOIN form_submissions fs ON (
        fs.form_packet_id = tp.form_packet_id
        AND fs.applicant_id = v_applicant_id
        AND fs.status = 'approved'
    )
    WHERE tp.template_id = v_template_id
        AND tp.is_required = true
        AND fs.id IS NOT NULL;

    -- Count applicant-role packets with submissions (submitted or approved)
    SELECT COUNT(DISTINCT tp.id) INTO v_applicant_submitted_count
    FROM template_packets tp
    LEFT JOIN form_submissions fs ON (
        fs.form_packet_id = tp.form_packet_id
        AND fs.applicant_id = v_applicant_id
        AND fs.status IN ('submitted', 'approved')
    )
    WHERE tp.template_id = v_template_id
        AND tp.assigned_to_role = 'applicant'
        AND fs.id IS NOT NULL;

    -- Count total applicant-role packets
    SELECT COUNT(*) INTO v_applicant_total_count
    FROM template_packets
    WHERE template_id = v_template_id
        AND assigned_to_role = 'applicant';

    -- Check if ANY packet has a submission
    SELECT EXISTS (
        SELECT 1
        FROM template_packets tp
        JOIN form_submissions fs ON fs.form_packet_id = tp.form_packet_id
        WHERE tp.template_id = v_template_id
            AND fs.applicant_id = v_applicant_id
    ) INTO v_has_any_submission;

    -- Determine new status
    IF v_required_count > 0 AND v_approved_count = v_required_count THEN
        v_new_status := 'complete'::bundle_status;
    ELSIF v_applicant_total_count > 0 AND v_applicant_submitted_count = v_applicant_total_count THEN
        v_new_status := 'pending_review'::bundle_status;
    ELSIF v_has_any_submission THEN
        v_new_status := 'in_progress'::bundle_status;
    ELSE
        v_new_status := 'not_started'::bundle_status;
    END IF;

    -- Update bundle status and completed_at
    UPDATE onboarding_bundles
    SET
        status = v_new_status,
        completed_at = CASE WHEN v_new_status = 'complete' THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE id = bundle_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER FUNCTIONS: updated_at Auto-Update
-- ============================================================================

CREATE OR REPLACE FUNCTION update_onboarding_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_onboarding_bundles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER FUNCTION: Recalculate Bundle Status on Form Submission Change
-- ============================================================================
-- This function fires when form_submissions rows are inserted/updated.
-- It checks if form_packet_id is set and recalculates any linked bundles.

CREATE OR REPLACE FUNCTION trigger_recalculate_bundle_status()
RETURNS TRIGGER AS $$
DECLARE
    v_bundle_id UUID;
BEGIN
    -- Only run if form_packet_id is populated (not all submissions are packet-linked)
    IF NEW.form_packet_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Find all bundles for this applicant that use the template containing this packet
    FOR v_bundle_id IN
        SELECT ob.id
        FROM onboarding_bundles ob
        JOIN template_packets tp ON tp.template_id = ob.template_id
        WHERE ob.applicant_id = NEW.applicant_id
            AND tp.form_packet_id = NEW.form_packet_id
    LOOP
        PERFORM recalculate_bundle_status(v_bundle_id);
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on onboarding_templates
DROP TRIGGER IF EXISTS onboarding_templates_updated_at_trigger ON onboarding_templates;
CREATE TRIGGER onboarding_templates_updated_at_trigger
    BEFORE UPDATE ON onboarding_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_templates_updated_at();

-- Auto-update updated_at on onboarding_bundles
DROP TRIGGER IF EXISTS onboarding_bundles_updated_at_trigger ON onboarding_bundles;
CREATE TRIGGER onboarding_bundles_updated_at_trigger
    BEFORE UPDATE ON onboarding_bundles
    FOR EACH ROW
    EXECUTE FUNCTION update_onboarding_bundles_updated_at();

-- Recalculate bundle status when form_submissions change
DROP TRIGGER IF EXISTS form_submissions_recalculate_bundle_trigger ON form_submissions;
CREATE TRIGGER form_submissions_recalculate_bundle_trigger
    AFTER INSERT OR UPDATE ON form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_recalculate_bundle_status();
