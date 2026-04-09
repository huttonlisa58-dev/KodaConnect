-- ============================================================
-- Password-Based Auth Migration for KodaConnect Office Portal
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add must_change_password column to office_users table
ALTER TABLE office_users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;

-- Set existing users to require password change on next login
UPDATE office_users SET must_change_password = true WHERE must_change_password IS NULL;

-- ============================================================
-- 2. Create your first admin user
--
-- STEP A: First, create the auth user in Supabase Dashboard:
--   Go to Authentication > Users > "Add User"
--   Email: vikram@completehomecarepa.com
--   Password: KodaAdmin2026!  (you'll change this on first login)
--   Check "Auto Confirm User"
--   Click "Create User"
--   Copy the UUID that Supabase assigns to this user
--
-- STEP B: Then run this SQL (replace YOUR_AUTH_USER_UUID with the
--   UUID from Step A):
-- ============================================================

-- Make sure a company exists first (skip if you already have one)
INSERT INTO companies (id, name, slug, domain, settings)
VALUES (
  gen_random_uuid(),
  'Complete Homecare',
  'complete-homecare',
  'completehomecarepa.com',
  '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Insert the admin office user
-- Replace 'YOUR_AUTH_USER_UUID' with the actual UUID from Supabase Auth
/*
INSERT INTO office_users (
  id,
  company_id,
  email,
  name,
  role,
  active,
  must_change_password,
  created_at
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM companies WHERE slug = 'complete-homecare' LIMIT 1),
  'vikram@completehomecarepa.com',
  'Vikram Kaul',
  'admin',
  true,
  true,
  NOW()
);
*/

-- ============================================================
-- ALTERNATIVE: Quick setup using Supabase Auth Admin API
-- If you want to do everything via SQL, you can use the
-- auth.users table directly (requires service_role access):
-- ============================================================

-- This creates the auth user AND the office_users entry in one go:
-- (Uncomment and run after adjusting the password)

/*
-- Create auth user with password
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'vikram@completehomecarepa.com',
  crypt('KodaAdmin2026!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '',
  ''
)
ON CONFLICT (email) DO NOTHING
RETURNING id;

-- Then create the office_users entry using the auth user's ID:
INSERT INTO office_users (
  id,
  company_id,
  email,
  name,
  role,
  active,
  must_change_password,
  created_at
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM companies WHERE slug = 'complete-homecare' LIMIT 1),
  'vikram@completehomecarepa.com',
  'Vikram Kaul',
  'admin',
  true,
  true,
  NOW()
);
*/
