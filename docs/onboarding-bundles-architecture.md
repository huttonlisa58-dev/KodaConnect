# KodaConnect — Onboarding Bundles Architecture

## Overview

This document defines the architecture for **Onboarding Bundles** — a system that groups multiple form packets together for a single applicant's onboarding process, tracks progress across all packets, and routes each packet to the correct user role (applicant, RN evaluator, or HR admin).

---

## Problem Statement

Today, each form packet is independent. When X-Treme Care onboards a NY caregiver, the process involves multiple packets across different render modes and user roles:

- **Caregiver Onboarding** (generated mode, filled by applicant)
- **Government Forms** (replica mode, filled by applicant + HR)
- **RN Evaluation** (generated mode, filled by RN evaluator)
- **Admin Checklists** (internal, used by HR)

There is no unified view showing "where does this caregiver stand across all their packets?" HR has to check each packet individually. As more companies are added, each with their own packet combinations, this becomes unmanageable.

---

## Solution: Templates + Bundles

### Concepts

**Template** = A saved recipe that says "for this company and state, these are the packets needed, and here's who fills each one." Created once, reused for every new hire.

**Bundle** = A specific instance of a template for one applicant. Created when HR starts onboarding a new caregiver. Tracks overall progress.

### User Workflow

1. **One-time setup:** Admin creates a template (e.g., "XTC — NY Caregiver Onboarding") and assigns packets to it
2. **Each new hire:** HR picks the template, enters the applicant's info, clicks create → bundle is created, SMS is sent
3. **Applicant fills forms:** Caregiver receives SMS with link to their assigned packets
4. **RN completes evaluation:** RN accesses their assigned packet via the admin portal
5. **HR reviews and completes:** HR fills employer sections, reviews all submissions, approves
6. **Bundle complete:** All packets approved → onboarding is done

---

## Database Schema

### New Tables

#### 1. `onboarding_templates`

Stores the saved recipes. One row per company/state onboarding configuration.

```sql
CREATE TABLE onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "XTC — NY Caregiver Onboarding"
  description TEXT,                      -- Optional notes about this template
  state TEXT,                            -- "NY", "PA", etc. Nullable for nationwide templates
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate active templates for same company/state
  UNIQUE(company_id, name)
);

-- Index for quick lookups by company
CREATE INDEX idx_onboarding_templates_company ON onboarding_templates(company_id, is_active);
```

#### 2. `template_packets`

Defines which packets are included in each template, who fills them, and in what order.

```sql
CREATE TYPE onboarding_role AS ENUM ('applicant', 'rn_evaluator', 'hr_admin');

CREATE TABLE template_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  form_packet_id UUID NOT NULL REFERENCES form_packets(id) ON DELETE CASCADE,
  assigned_to_role onboarding_role NOT NULL DEFAULT 'applicant',
  sort_order INTEGER NOT NULL DEFAULT 0,       -- Display order within the bundle
  is_required BOOLEAN NOT NULL DEFAULT true,    -- Must be completed to finish onboarding?

  -- Each packet appears only once per template
  UNIQUE(template_id, form_packet_id)
);

-- Index for fetching all packets in a template
CREATE INDEX idx_template_packets_template ON template_packets(template_id, sort_order);
```

#### 3. `onboarding_bundles`

One row per caregiver being onboarded. Created from a template.

```sql
CREATE TYPE bundle_status AS ENUM (
  'not_started',      -- Bundle created but no submissions yet
  'in_progress',      -- At least one packet has been started
  'pending_review',   -- All applicant packets submitted, awaiting HR/RN completion
  'complete'          -- All required packets approved
);

CREATE TABLE onboarding_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES onboarding_templates(id),
  applicant_id UUID NOT NULL REFERENCES applicants(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  status bundle_status NOT NULL DEFAULT 'not_started',

  -- Tracking
  created_by UUID REFERENCES users(id),    -- HR user who initiated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,                -- When all packets were approved

  -- Optional: notes from HR
  notes TEXT
);

-- Index for dashboard queries
CREATE INDEX idx_bundles_company_status ON onboarding_bundles(company_id, status);
CREATE INDEX idx_bundles_applicant ON onboarding_bundles(applicant_id);
CREATE INDEX idx_bundles_created ON onboarding_bundles(created_at DESC);
```

#### 4. `bundle_packet_overrides` (Optional — for per-bundle customization)

Only needed if HR sometimes needs to skip or add a packet for a specific caregiver. Can be added later.

```sql
CREATE TABLE bundle_packet_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES onboarding_bundles(id) ON DELETE CASCADE,
  form_packet_id UUID NOT NULL REFERENCES form_packets(id),
  action TEXT NOT NULL CHECK (action IN ('skip', 'add')),  -- Skip a template packet or add an extra one
  assigned_to_role onboarding_role,                         -- Only needed for 'add'
  reason TEXT,                                              -- Why this override exists
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(bundle_id, form_packet_id)
);
```

### Row Level Security (RLS) Policies

```sql
-- Templates: visible to users who have access to the company
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates for their assigned companies"
  ON onboarding_templates FOR SELECT
  USING (
    company_id IN (
      SELECT unnest(assigned_companies) FROM users WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins can manage templates for their companies"
  ON onboarding_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (role = 'super_admin' OR (role = 'admin' AND company_id = ANY(assigned_companies)))
    )
  );

-- Bundles: similar pattern
ALTER TABLE onboarding_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bundles for their assigned companies"
  ON onboarding_bundles FOR SELECT
  USING (
    company_id IN (
      SELECT unnest(assigned_companies) FROM users WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Template packets and overrides inherit access through their parent
ALTER TABLE template_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_packet_overrides ENABLE ROW LEVEL SECURITY;
```

---

## API Routes

### Template Management

#### `GET /api/onboarding/templates`
List all templates for the user's assigned companies.

**Query params:** `company_id` (optional filter), `is_active` (optional, default true)

**Response:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "company_name": "X-Treme Care, LLC",
      "name": "XTC — NY Caregiver Onboarding",
      "state": "NY",
      "is_active": true,
      "packet_count": 3,
      "created_at": "2026-01-15T..."
    }
  ]
}
```

#### `GET /api/onboarding/templates/[id]`
Get template detail with all its packets.

**Response:**
```json
{
  "template": {
    "id": "uuid",
    "name": "XTC — NY Caregiver Onboarding",
    "company_id": "uuid",
    "state": "NY",
    "packets": [
      {
        "form_packet_id": "uuid",
        "packet_name": "NY Caregiver Onboarding Package",
        "render_mode": "generated",
        "assigned_to_role": "applicant",
        "sort_order": 1,
        "is_required": true
      },
      {
        "form_packet_id": "uuid",
        "packet_name": "NY Government Forms",
        "render_mode": "replica",
        "assigned_to_role": "applicant",
        "sort_order": 2,
        "is_required": true
      },
      {
        "form_packet_id": "uuid",
        "packet_name": "RN Evaluation",
        "render_mode": "generated",
        "assigned_to_role": "rn_evaluator",
        "sort_order": 3,
        "is_required": true
      }
    ]
  }
}
```

#### `POST /api/onboarding/templates`
Create a new template.

**Body:**
```json
{
  "company_id": "uuid",
  "name": "XTC — NY Caregiver Onboarding",
  "state": "NY",
  "packets": [
    { "form_packet_id": "uuid", "assigned_to_role": "applicant", "sort_order": 1, "is_required": true },
    { "form_packet_id": "uuid", "assigned_to_role": "applicant", "sort_order": 2, "is_required": true },
    { "form_packet_id": "uuid", "assigned_to_role": "rn_evaluator", "sort_order": 3, "is_required": true }
  ]
}
```

#### `PUT /api/onboarding/templates/[id]`
Update a template (name, state, packets, active status).

#### `DELETE /api/onboarding/templates/[id]`
Soft-delete (set `is_active = false`). Never hard-delete since bundles reference templates.

---

### Bundle Operations

#### `GET /api/onboarding/bundles`
List all bundles (the main dashboard query).

**Query params:** `company_id`, `status`, `search` (applicant name), `date_from`, `date_to`, `page`, `per_page`

**Response:**
```json
{
  "bundles": [
    {
      "id": "uuid",
      "applicant": {
        "id": "uuid",
        "name": "Jane Doe",
        "phone": "+1234567890"
      },
      "template_name": "XTC — NY Caregiver Onboarding",
      "company_name": "X-Treme Care, LLC",
      "status": "in_progress",
      "progress": {
        "total_packets": 3,
        "completed_packets": 1,
        "packets": [
          { "packet_name": "Caregiver Onboarding", "role": "applicant", "status": "submitted" },
          { "packet_name": "Government Forms", "role": "applicant", "status": "in_progress" },
          { "packet_name": "RN Evaluation", "role": "rn_evaluator", "status": "not_started" }
        ]
      },
      "created_at": "2026-03-01T...",
      "created_by_name": "Admin User"
    }
  ],
  "total_count": 45,
  "page": 1
}
```

**How packet status is derived (no extra table needed):**
```
For each packet in the template:
  1. Look up form_submissions WHERE applicant_id = bundle.applicant_id
     AND form_packet_id = template_packet.form_packet_id
  2. If no submission → "not_started"
  3. If submission.status = "draft" → "in_progress"
  4. If submission.status = "submitted" → "submitted"
  5. If submission.status = "approved" → "approved"
  6. If submission.status = "rejected" → "needs_revision"
```

#### `POST /api/onboarding/bundles`
Create a new bundle (HR initiates onboarding).

**Body:**
```json
{
  "template_id": "uuid",
  "applicant": {
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+1234567890",
    "email": "jane@example.com"     // optional
  },
  "send_sms": true,                  // Send SMS link immediately?
  "notes": "Starting 3/15"           // optional
}
```

**What happens on create:**
1. Create or find the applicant record
2. Create the bundle record
3. If `send_sms` is true, generate SMS link(s) for applicant-assigned packets and send via Twilio
4. Return the bundle with its initial status

#### `GET /api/onboarding/bundles/[id]`
Get full bundle detail including all packet statuses and submission data.

#### `PUT /api/onboarding/bundles/[id]`
Update bundle (status, notes). Status is also auto-updated when submissions change.

#### `POST /api/onboarding/bundles/[id]/send-reminder`
Re-send SMS to the applicant for incomplete packets.

#### `POST /api/onboarding/bundles/[id]/download-all`
Generate and download all completed PDFs as a ZIP file for the caregiver's personnel file.

---

## Admin UI Components

### 1. Template Management Page
**Route:** `/office/onboarding/templates`
**Access:** Admin and Super Admin only

- List of all templates grouped by company
- Create/edit template form:
  - Company selector (dropdown)
  - Template name (text input)
  - State (dropdown)
  - Packet picker: shows all available packets for the selected company, with drag-to-reorder, role assignment dropdown (applicant/RN/HR), and required toggle
- Activate/deactivate toggle

### 2. Onboarding Dashboard
**Route:** `/office/onboarding`
**Access:** All portal users (filtered by assigned companies)

This is the primary view HR uses daily. Shows all active bundles.

**Layout:**
- Top bar: Company filter, Status filter (all/in progress/pending review/complete), Search by name, Date range
- Summary cards: "12 In Progress", "5 Pending Review", "8 Completed This Month"
- Table rows, one per bundle:
  - Applicant name
  - Template used
  - Status badge (color-coded)
  - Progress bar or packet status icons (e.g., 3 circles: green, yellow, gray)
  - Created date
  - Actions: View, Send Reminder, Download All

### 3. Bundle Detail Page
**Route:** `/office/onboarding/[bundleId]`

Shows everything about one caregiver's onboarding:

- **Header:** Applicant name, phone, company, template name, overall status
- **Packet cards** (one per packet in the template):
  - Packet name and render mode badge
  - Assigned role
  - Current status with timestamp
  - Link to view/review the submission
  - For HR-assigned packets: button to fill employer sections
- **Activity log:** Timeline of events (bundle created, SMS sent, packet submitted, packet approved, etc.)
- **Actions:** Send reminder, Add note, Mark complete, Download all PDFs

### 4. New Onboarding Flow
**Route:** `/office/onboarding/new`

Simple form:
1. Select company (if user has multiple)
2. Select template (dropdown filtered by company — shows template name and state)
3. Enter applicant info: First name, Last name, Phone number, Email (optional)
4. Toggle: Send SMS now? (default: yes)
5. Optional notes field
6. Create button

On success: redirects to the new bundle detail page.

---

## Mobile/Applicant Flow Changes

### Current Flow
1. HR creates a submission link for a single packet
2. Applicant receives SMS → opens link → fills one packet → submits

### New Flow with Bundles
1. HR creates a bundle (which may include multiple applicant-assigned packets)
2. System generates a **bundle link** (not a per-packet link)
3. Applicant receives SMS → opens bundle link → sees a packet selector or flows through packets sequentially
4. Applicant completes each packet → submits each one individually
5. When all applicant-assigned packets are submitted, the bundle status auto-updates

### SMS Link Structure

**Option A — Sequential flow (recommended for first version):**
The bundle link opens MobileFormWizard with the first incomplete applicant-assigned packet. When the applicant finishes and submits, they're shown a "Next: Government Forms" button that loads the next packet. This feels like one continuous onboarding flow.

**URL format:** `/fill/bundle/[bundleId]?applicant=[applicantId]&token=[authToken]`

**Option B — Packet picker:**
The bundle link opens a landing page showing all applicant-assigned packets with status indicators. The applicant taps into each one. This gives more flexibility but is a more complex UI.

### Changes to MobileFormWizard

Minimal changes needed for Option A:
- Accept a `bundleId` param in addition to the existing `packetId`
- When `bundleId` is provided, fetch the bundle's applicant-assigned packets in sort order
- After submitting a packet, check if there's a next packet → show "Continue to next form" or "All done!"
- The actual form-filling experience within each packet remains unchanged

---

## Status Auto-Update Logic

Bundle status should be automatically recalculated whenever a submission status changes. This can be done via a Supabase database function or in the API layer.

```
Function: recalculate_bundle_status(bundle_id)

1. Get all required template_packets for this bundle's template
2. For each packet, find the latest submission for this bundle's applicant_id
3. Calculate:
   - If ALL required packets have status = "approved" → bundle status = "complete"
   - If ALL applicant-assigned packets are "submitted" or "approved" → bundle status = "pending_review"
   - If ANY packet has a submission (draft or submitted) → bundle status = "in_progress"
   - Otherwise → bundle status = "not_started"
4. Update the bundle record
```

This could be triggered by:
- A Supabase trigger on `form_submissions` INSERT/UPDATE
- Or called explicitly in the submission API routes after status changes

---

## What Does NOT Change

- **JSON form packages:** No changes to any existing JSON structure
- **form_definitions table:** Untouched
- **form_packets table:** Untouched
- **form_submissions table:** Untouched (bundle status is derived from existing submissions)
- **Import pipeline** (`/api/packets/import-package`): No changes
- **PDF rendering** (flat-layout and template-overlay): No changes
- **Existing standalone packet flows:** Companies not using bundles continue working exactly as today
- **DynamicForm / form field rendering:** No changes
- **MobileFormWizard core:** The form-filling experience within a packet is unchanged; only the navigation between packets is new

---

## Implementation Order

### Phase 1: Database + Templates (1-2 days)
- Run migration to create the 3 new tables
- Build template CRUD API routes
- Build template management UI page

### Phase 2: Bundle Creation + Dashboard (2-3 days)
- Build bundle creation API route (with SMS integration)
- Build onboarding dashboard page
- Build bundle detail page
- Wire up the "New Onboarding" flow

### Phase 3: Mobile Bundle Flow (1-2 days)
- Add bundle-aware routing to MobileFormWizard
- Build the sequential packet flow (next packet after submit)
- Test end-to-end: HR creates bundle → SMS sent → applicant fills all packets

### Phase 4: Status Tracking + Polish (1-2 days)
- Implement auto-status recalculation (trigger or API-level)
- Add reminder SMS functionality
- Add "Download All PDFs" as ZIP
- Activity log on bundle detail page

### Phase 5: Immediate Content Fixes (parallel with above)
- Remove 4 office-only sub_forms from onboarding JSON
- Add LS 62 (LHCSA), LS 62 (NHTD), NYC Sick Leave to government forms JSON
- Create RN Evaluation packet (Supervisory Visit + Competency Eval)

---

## Future Enhancements

- **Bundle overrides:** Let HR skip or add packets for specific caregivers (the `bundle_packet_overrides` table)
- **Expiration tracking:** Some forms (TB questionnaire, health assessment) need annual renewal. Track expiration dates and auto-flag when re-onboarding is needed
- **Bulk onboarding:** Create bundles for multiple caregivers at once (CSV import)
- **Progress notifications:** Notify HR when a caregiver completes all their packets
- **Analytics:** Average time-to-complete by company, bottleneck identification
