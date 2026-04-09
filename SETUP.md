# KodaConnect Setup Guide

## Environment Variables for Vercel

Add these in Vercel Dashboard → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://ihuhzvaukqgiixkhxtpi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodWh6dmF1a3FnaWl4a2h4dHBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYxNTYsImV4cCI6MjA5MDgxMjE1Nn0.KGRHgI1hro7nXISbWkgyaxqYiFlDhL-zp-NuC80pOkk
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodWh6dmF1a3FnaWl4a2h4dHBpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIzNjE1NiwiZXhwIjoyMDkwODEyMTU2fQ.odzCR1r5hlHg6h5atzat4J_u7pHerQBvvsJ8qaoQfd0
TWILIO_ACCOUNT_SID=AC83f14221eb9169e4f2e872bccda7ba5f
TWILIO_AUTH_TOKEN=4e1575252655fba0f66657875cb9dfce
TWILIO_PHONE_NUMBER=+16813033201
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

## Supabase Storage Buckets Required
- documents
- filled-pdfs  
- uploads

## Run SQL Migrations in Order
1. supabase-schema.sql
2. sql/001-all-migrations.sql
3. sql/009-access-tokens-form-link.sql
4. sql/01-audit-log.sql
5. sql/010-submission-management.sql
6. sql/011-original-form-data.sql
7. sql/012-consent-and-audit.sql
8. sql/013-finalize-delete-rbac.sql
9. sql/014-form-packets.sql
10. sql/015-packet-template-storage.sql
11. sql/016-json-import-support.sql
12. sql/017-onboarding-bundles.sql
13. sql/add-public-forms.sql
14. sql/company-structure-migration.sql
15. sql/enhanced-forms-schema.sql
16. sql/password-auth-migration.sql
17. sql/phase4_schema.sql
18. src/lib/rls-policies.sql
