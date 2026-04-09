# KodaConnect Onboarding System Integration Guide

This guide walks you through integrating the complete onboarding bundle system into your existing KodaConnect codebase. The system handles sequential multi-packet flows, template management, and bundle tracking for applicants.

## Overview

The onboarding system consists of:

- **Database schema**: Tables for templates, template packets, bundles, and bundle packet overrides
- **API routes**: RESTful endpoints for CRUD operations on templates, bundles, and packet management
- **UI components**: React components for office dashboard, template manager, bundle detail views, and mobile packet flow
- **Form packages**: Pre-configured JSON form packages for caregiver onboarding, government forms, and RN evaluation
- **Mobile flow**: A dedicated wrapper component for applicants filling out bundles sequentially on mobile devices

### Deliverables

1. **Database Migration**: `migrations/001_onboarding_bundles.sql`
2. **API Routes**:
   - `api-routes/onboarding/templates/route.ts` (GET, POST)
   - `api-routes/onboarding/templates/[id]/route.ts` (GET, PUT, DELETE)
   - `api-routes/onboarding/bundles/route.ts` (GET, POST)
   - `api-routes/onboarding/bundles/[id]/route.ts` (GET, PUT)
   - `api-routes/onboarding/bundles/[id]/send-reminder/route.ts` (POST)
   - `api-routes/onboarding/bundles/[id]/download-all/route.ts` (GET)
3. **UI Components**:
   - `ui-components/onboarding/OnboardingDashboard.tsx`
   - `ui-components/onboarding/NewOnboardingForm.tsx`
   - `ui-components/onboarding/BundleDetail.tsx`
   - `ui-components/onboarding/TemplateManager.tsx`
   - `ui-components/onboarding/BundleMobileFlow.tsx`
   - `ui-components/onboarding/types.ts`
4. **Form Packages**:
   - `xtc-ny-caregiver-onboarding-package-v2.json` (updated, 4 office-only forms removed)
   - `xtc-ny-government-forms-package-v2.json` (updated, 3 new forms added)
   - `xtc-ny-rn-evaluation-package.json` (new)

---

## Prerequisites

Before integrating, ensure you have:

- Access to your Supabase project (CLI or SQL editor)
- An existing KodaConnect Next.js project (App Router)
- Supabase authentication already configured
- An existing MobileFormWizard component at `src/components/forms/MobileFormWizard.tsx`
- Existing form package import logic via POST `/api/packets/import-package`

---

## Step 1: Run Database Migration

### Option A: Using Supabase CLI

1. Copy `migrations/001_onboarding_bundles.sql` to your Supabase migrations folder:
   ```bash
   cp migrations/001_onboarding_bundles.sql supabase/migrations/
   ```

2. Apply the migration:
   ```bash
   supabase db push
   ```

### Option B: Manual SQL Import

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Paste the contents of `migrations/001_onboarding_bundles.sql`
5. Click "Run"

### Verification

After applying the migration, verify these tables were created in your Supabase database:

- `onboarding_templates`
- `template_packets`
- `onboarding_bundles`
- `bundle_packet_overrides`

Run the following query in your SQL editor to confirm:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'onboarding_%';
```

You should see all four tables listed.

---

## Step 2: Update and Import Form Packages

The system requires three form packages to be imported. Two existing packages have been updated, and one is new.

### Replace Caregiver Onboarding Package

**Changes**: Removed 4 office-only sub-forms to streamline the applicant experience.

1. Locate your existing caregiver onboarding form package (likely in your forms library or CMS)
2. Replace it with `xtc-ny-caregiver-onboarding-package-v2.json`
3. Import via API:
   ```bash
   curl -X POST http://localhost:3000/api/packets/import-package \
     -H "Content-Type: application/json" \
     -d @xtc-ny-caregiver-onboarding-package-v2.json
   ```

Or use your existing form package import UI if available.

### Replace Government Forms Package

**Changes**: Added 3 new forms:
- LS 62 LHCSA (Long-Term Home Health Care Services for Applicants)
- LS 62 NHTD (Non-Hospital Residential Treatment Facilities)
- NYC Sick Leave Notice

**PDF Template Note**: The base64-encoded PDF template in this package includes placeholder pages for the new forms. You may need to:
1. Replace the placeholder pages with actual PDF templates for LS 62 LHCSA, LS 62 NHTD, and NYC Sick Leave
2. Re-export the combined PDF and update the base64 string in the JSON

For now, import with placeholders:

```bash
curl -X POST http://localhost:3000/api/packets/import-package \
  -H "Content-Type: application/json" \
  -d @xtc-ny-government-forms-package-v2.json
```

### Import RN Evaluation Package

**New Package**: A standalone packet for RN evaluators to complete clinical assessments.

```bash
curl -X POST http://localhost:3000/api/packets/import-package \
  -H "Content-Type: application/json" \
  -d @xtc-ny-rn-evaluation-package.json
```

---

## Step 3: Add API Routes

Copy all API route files to your Next.js project's `src/app/api/` directory:

### Templates Routes

```bash
cp api-routes/onboarding/templates/route.ts \
   src/app/api/onboarding/templates/route.ts

cp api-routes/onboarding/templates/[id]/route.ts \
   src/app/api/onboarding/templates/[id]/route.ts
```

**Endpoints**:
- `GET /api/onboarding/templates` — List all templates
- `POST /api/onboarding/templates` — Create a new template
- `GET /api/onboarding/templates/[id]` — Get a specific template
- `PUT /api/onboarding/templates/[id]` — Update a template
- `DELETE /api/onboarding/templates/[id]` — Delete a template

### Bundles Routes

```bash
mkdir -p src/app/api/onboarding/bundles/[id]

cp api-routes/onboarding/bundles/route.ts \
   src/app/api/onboarding/bundles/route.ts

cp api-routes/onboarding/bundles/[id]/route.ts \
   src/app/api/onboarding/bundles/[id]/route.ts

cp api-routes/onboarding/bundles/[id]/send-reminder/route.ts \
   src/app/api/onboarding/bundles/[id]/send-reminder/route.ts

cp api-routes/onboarding/bundles/[id]/download-all/route.ts \
   src/app/api/onboarding/bundles/[id]/download-all/route.ts
```

**Endpoints**:
- `GET /api/onboarding/bundles` — List bundles (with filters)
- `POST /api/onboarding/bundles` — Create a new bundle
- `GET /api/onboarding/bundles/[id]` — Get a specific bundle with packets
- `PUT /api/onboarding/bundles/[id]` — Update bundle status or metadata
- `POST /api/onboarding/bundles/[id]/send-reminder` — Send SMS reminder to applicant
- `GET /api/onboarding/bundles/[id]/download-all` — Download all submitted packets as zip

### Auth Helper Review

Before deploying, review the auth helper imports in each route file. The routes use Supabase auth helpers; ensure they match your project structure:

**Typical import paths**:
```typescript
// ✓ Correct for Next.js App Router with @supabase/ssr
import { createClient } from '@supabase/supabase-js';

// Or if using @supabase/ssr:
import { createServerClient } from '@supabase/ssr';
```

Adjust imports in each route file based on your existing auth setup.

---

## Step 4: Add UI Components

Copy all UI components to `src/components/onboarding/`:

```bash
mkdir -p src/components/onboarding
cp ui-components/onboarding/*.tsx src/components/onboarding/
cp ui-components/onboarding/types.ts src/components/onboarding/types.ts
```

### Components Created

- **OnboardingDashboard.tsx**: Main dashboard showing all bundles, filters, and status overview
- **NewOnboardingForm.tsx**: Form to create a new bundle from a template
- **BundleDetail.tsx**: View and manage a specific bundle; download packets
- **TemplateManager.tsx**: Create, edit, and delete onboarding templates
- **BundleMobileFlow.tsx**: Wrapper for sequential packet flow on mobile devices
- **types.ts**: TypeScript interfaces for bundles, packets, templates, etc.

---

## Step 5: Create Pages and Navigation

### Create Dashboard Page

Create `src/app/office/onboarding/page.tsx`:

```typescript
import OnboardingDashboard from '@/components/onboarding/OnboardingDashboard';

export default function OnboardingPage() {
  return <OnboardingDashboard />;
}
```

### Create New Onboarding Page

Create `src/app/office/onboarding/new/page.tsx`:

```typescript
import NewOnboardingForm from '@/components/onboarding/NewOnboardingForm';

export default function NewOnboardingPage() {
  return <NewOnboardingForm />;
}
```

### Create Bundle Detail Page

Create `src/app/office/onboarding/[bundleId]/page.tsx`:

```typescript
'use client';

import { useParams } from 'next/navigation';
import BundleDetail from '@/components/onboarding/BundleDetail';

export default function BundleDetailPage() {
  const params = useParams();
  const bundleId = params.bundleId as string;

  return <BundleDetail bundleId={bundleId} />;
}
```

### Create Template Manager Page

Create `src/app/office/onboarding/templates/page.tsx`:

```typescript
import TemplateManager from '@/components/onboarding/TemplateManager';

export default function TemplateManagerPage() {
  return <TemplateManager />;
}
```

### Add Navigation Link

Update your sidebar or main navigation component to include a link to `/office/onboarding`:

```typescript
<NavLink href="/office/onboarding" label="Onboarding" icon={ChecklistIcon} />
```

---

## Step 6: Add Mobile Bundle Route

### Copy BundleMobileFlow Component

```bash
cp ui-components/onboarding/BundleMobileFlow.tsx \
   src/components/forms/BundleMobileFlow.tsx
```

### Create Mobile Bundle Page

Create `src/app/fill/bundle/[bundleId]/page.tsx`:

```typescript
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import BundleMobileFlow from '@/components/forms/BundleMobileFlow';

export default function BundleMobilePage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const bundleId = params.bundleId as string;
  const applicantId = searchParams.get('applicantId') || '';
  const authToken = searchParams.get('token');

  return (
    <BundleMobileFlow
      bundleId={bundleId}
      applicantId={applicantId}
      authToken={authToken}
    />
  );
}
```

### Update SMS Link Generation

When creating a new bundle, SMS links should point to the mobile flow. Update your bundle creation logic to generate SMS links like:

```
https://yourapp.com/fill/bundle/{bundleId}?applicantId={applicantId}&token={authToken}
```

Look for TODO comments in `api-routes/onboarding/bundles/route.ts` for SMS integration points.

---

## Step 7: Create Your First Template

Now that everything is deployed, create a test onboarding template:

1. **Navigate to**: `/office/onboarding/templates`
2. **Click**: "Create Template"
3. **Select**: X-Treme Care, State: NY
4. **Name**: "XTC — NY Caregiver Onboarding"
5. **Add Packets**:
   - **First Packet**: NY Caregiver Onboarding Package
     - Role: Applicant
     - Required: Yes
     - Sort Order: 1
   - **Second Packet**: NY Government Forms
     - Role: Applicant
     - Required: Yes
     - Sort Order: 2
   - **Third Packet**: NY RN Evaluation
     - Role: RN Evaluator
     - Required: Yes
     - Sort Order: 3
6. **Click**: "Save Template"

---

## Step 8: Test End-to-End

Follow these steps to verify the system works:

### 1. Create a Test Bundle

1. Navigate to `/office/onboarding`
2. Click "Start New Onboarding"
3. Select the template you created
4. Enter test applicant information:
   - Name
   - Email
   - Phone (for SMS)
5. Click "Start Onboarding"
6. Copy the SMS link from the confirmation screen

### 2. Test Mobile Flow

1. Open the SMS link on a mobile device (or resize browser to mobile width)
2. Verify the progress indicator shows "Form 1 of 3"
3. Fill out the caregiver onboarding form
4. Click Submit
5. Verify the transition screen shows "Caregiver Onboarding — Complete!" with "Next: Government Forms (2 of 3)"
6. Click Continue
7. Verify the form advances to the government forms (progress shows "Form 2 of 3")
8. Submit the government forms
9. Verify the next transition screen shows "Form 3 of 3: NY RN Evaluation"
10. Note: For now, you can skip RN evaluation since it's role-locked
11. All applicant packets complete, verify final screen: "All Done! Your onboarding forms have been submitted."

### 3. Test Dashboard Updates

1. Go back to `/office/onboarding`
2. Find your test bundle in the list
3. Verify status shows: "2 / 3 packets submitted"
4. Click on the bundle to view details
5. Verify all submitted packets are listed with timestamps
6. Test downloading submitted packets

### 4. Test Resume Functionality

1. During mobile flow, close the browser or navigate away
2. Open the SMS link again
3. Verify the app resumes from where you left off (localStorage)
4. Verify the progress bar shows your current position

---

## TODOs for Production

Before deploying to production, complete these tasks:

- [ ] **Twilio SMS Integration**: Wire up SMS sending in `api-routes/onboarding/bundles/route.ts`
  - Look for `TODO: wire up Twilio SMS` comments
  - Use your existing Twilio configuration
  - Test with real phone numbers

- [ ] **PDF Generation**: Wire up PDF generation in `api-routes/onboarding/bundles/[id]/download-all/route.ts`
  - Implement zip file creation with all submitted PDFs
  - Look for `TODO: generate PDF and create zip` comments
  - Test with real submissions

- [ ] **PDF Templates**: Add actual PDF templates for new government forms
  - LS 62 LHCSA form PDF
  - LS 62 NHTD form PDF
  - NYC Sick Leave Notice form PDF
  - Replace placeholder base64 strings in `xtc-ny-government-forms-package-v2.json`

- [ ] **Field Position Fine-Tuning**: After first test import, verify PDF field positions
  - The replica forms (LS 62 and NYC Sick Leave) may need x/y coordinate adjustments
  - Use your existing form field position tool or manual adjustment

- [ ] **Navigation**: Add "Onboarding" link to admin sidebar
  - Update your navigation component to include the new routes
  - Consider adding icon and badge for pending bundles

- [ ] **Row-Level Security (RLS)**: Test RLS policies
  - Verify applicants can only see their own bundles
  - Verify office staff can only see bundles they created
  - Verify RN evaluators can only see evaluation packets assigned to them

- [ ] **Email Notifications**: Consider adding email notifications alongside SMS
  - When bundle is created
  - When a packet is submitted
  - When all packets are completed

- [ ] **Testing & QA**: Run full end-to-end testing
  - Test with multiple applicants simultaneously
  - Test with different template configurations
  - Test error scenarios (network failures, timeouts)
  - Performance test with many bundles

---

## File Manifest

Complete list of files created and their target locations in your KodaConnect codebase:

### Database
- `migrations/001_onboarding_bundles.sql` → `supabase/migrations/001_onboarding_bundles.sql`

### API Routes
- `api-routes/onboarding/templates/route.ts` → `src/app/api/onboarding/templates/route.ts`
- `api-routes/onboarding/templates/[id]/route.ts` → `src/app/api/onboarding/templates/[id]/route.ts`
- `api-routes/onboarding/bundles/route.ts` → `src/app/api/onboarding/bundles/route.ts`
- `api-routes/onboarding/bundles/[id]/route.ts` → `src/app/api/onboarding/bundles/[id]/route.ts`
- `api-routes/onboarding/bundles/[id]/send-reminder/route.ts` → `src/app/api/onboarding/bundles/[id]/send-reminder/route.ts`
- `api-routes/onboarding/bundles/[id]/download-all/route.ts` → `src/app/api/onboarding/bundles/[id]/download-all/route.ts`

### UI Components
- `ui-components/onboarding/types.ts` → `src/components/onboarding/types.ts`
- `ui-components/onboarding/OnboardingDashboard.tsx` → `src/components/onboarding/OnboardingDashboard.tsx`
- `ui-components/onboarding/NewOnboardingForm.tsx` → `src/components/onboarding/NewOnboardingForm.tsx`
- `ui-components/onboarding/BundleDetail.tsx` → `src/components/onboarding/BundleDetail.tsx`
- `ui-components/onboarding/TemplateManager.tsx` → `src/components/onboarding/TemplateManager.tsx`
- `ui-components/onboarding/BundleMobileFlow.tsx` → `src/components/forms/BundleMobileFlow.tsx`

### Pages
- New: `src/app/office/onboarding/page.tsx`
- New: `src/app/office/onboarding/new/page.tsx`
- New: `src/app/office/onboarding/[bundleId]/page.tsx`
- New: `src/app/office/onboarding/templates/page.tsx`
- New: `src/app/fill/bundle/[bundleId]/page.tsx`

### Form Packages (import via API)
- `xtc-ny-caregiver-onboarding-package-v2.json` (POST to `/api/packets/import-package`)
- `xtc-ny-government-forms-package-v2.json` (POST to `/api/packets/import-package`)
- `xtc-ny-rn-evaluation-package.json` (POST to `/api/packets/import-package`)

---

## Support & Troubleshooting

### Common Issues

**Issue**: Database migration fails with "table already exists"
- **Solution**: Drop the conflicting tables first (if they're from a previous failed attempt), then re-run the migration.

**Issue**: API routes return 500 errors
- **Solution**: Check that Supabase client initialization matches your project structure. Verify environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.

**Issue**: Components won't render on mobile
- **Solution**: Ensure Tailwind CSS is properly configured. Check that responsive breakpoints (sm:, md:, lg:) are working.

**Issue**: SMS links don't work
- **Solution**: Review the bundle creation endpoint—ensure SMS generation is wired up. Test with Twilio sandbox initially.

**Issue**: Form data doesn't persist on refresh
- **Solution**: Verify localStorage is enabled and not blocked by browser privacy settings. Check browser console for quota exceeded errors.

### Getting Help

1. Check the implementation TODOs in the code—they highlight integration points
2. Review error logs in your application (server and browser console)
3. Verify Supabase query syntax by testing in the SQL editor
4. Test API endpoints manually with curl or Postman before using in UI

---

## Next Steps

After deployment:

1. Monitor bundle creation and submission rates
2. Gather feedback from office staff and applicants
3. Refine form fields and required documents based on real submissions
4. Optimize PDF template field positions for accuracy
5. Consider adding analytics to track completion rates by template and role
