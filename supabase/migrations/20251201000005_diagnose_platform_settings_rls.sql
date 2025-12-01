-- Diagnostic script to check platform_settings RLS policies and user permissions
-- Run this to see what's blocking the update

DO $$
DECLARE
  rec RECORD;
  v_user_id uuid;
  v_is_super_admin boolean;
BEGIN
  -- Get current authenticated user (you'll need to replace this with your actual user_id)
  -- Or run this query while logged in as the super admin user
  RAISE NOTICE '=== PLATFORM_SETTINGS RLS DIAGNOSTIC ===';
  RAISE NOTICE '';
  
  -- Check if platform_settings table exists
  RAISE NOTICE '1. Checking if platform_settings table exists...';
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_settings') THEN
    RAISE NOTICE '   ✓ platform_settings table exists';
  ELSE
    RAISE NOTICE '   ✗ platform_settings table does NOT exist';
    RETURN;
  END IF;
  
  -- Check RLS status
  RAISE NOTICE '';
  RAISE NOTICE '2. Checking RLS status...';
  SELECT relrowsecurity INTO rec
  FROM pg_class 
  WHERE relname = 'platform_settings';
  
  IF rec.relrowsecurity THEN
    RAISE NOTICE '   ✓ RLS is ENABLED on platform_settings';
  ELSE
    RAISE NOTICE '   ✗ RLS is DISABLED on platform_settings';
  END IF;
  
  -- List all policies
  RAISE NOTICE '';
  RAISE NOTICE '3. Current RLS policies on platform_settings:';
  FOR rec IN
    SELECT 
      policyname,
      cmd as operation,
      roles,
      qual as using_clause,
      with_check
    FROM pg_policies 
    WHERE tablename = 'platform_settings'
    ORDER BY policyname
  LOOP
    RAISE NOTICE '   Policy: %', rec.policyname;
    RAISE NOTICE '     Operation: %', rec.operation;
    RAISE NOTICE '     Roles: %', rec.roles;
    RAISE NOTICE '     USING: %', COALESCE(rec.using_clause, 'NULL');
    RAISE NOTICE '     WITH CHECK: %', COALESCE(rec.with_check, 'NULL');
    RAISE NOTICE '';
  END LOOP;
  
  -- Check current platform_settings data
  RAISE NOTICE '4. Current platform_settings data:';
  FOR rec IN
    SELECT id, platform_name_en, platform_name_ar, logo_url, logo_scale, created_at, updated_at
    FROM platform_settings
    LIMIT 1
  LOOP
    RAISE NOTICE '   ID: %', rec.id;
    RAISE NOTICE '   Platform Name (EN): %', rec.platform_name_en;
    RAISE NOTICE '   Platform Name (AR): %', rec.platform_name_ar;
    RAISE NOTICE '   Logo URL: %', rec.logo_url;
    RAISE NOTICE '   Logo Scale: %', rec.logo_scale;
    RAISE NOTICE '';
  END LOOP;
  
  -- Check for super admin users
  RAISE NOTICE '5. Super admin users in company_users:';
  FOR rec IN
    SELECT user_id, role, company_id, is_active
    FROM company_users
    WHERE role = 'super_admin'
  LOOP
    RAISE NOTICE '   User ID: % | Role: % | Company ID: % | Active: %', 
      rec.user_id, rec.role, rec.company_id, rec.is_active;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== DIAGNOSTIC COMPLETE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'To test if your user can update, run this query (replace YOUR_USER_ID):';
  RAISE NOTICE 'SELECT EXISTS (';
  RAISE NOTICE '  SELECT 1 FROM company_users';
  RAISE NOTICE '  WHERE user_id = ''YOUR_USER_ID''';
  RAISE NOTICE '    AND role = ''super_admin''';
  RAISE NOTICE ') as is_super_admin;';
  
END $$;

-- Also show the policies in a readable format
SELECT 
  'POLICY SUMMARY' as info,
  policyname,
  cmd as operation,
  roles,
  CASE 
    WHEN qual IS NULL THEN 'No USING clause'
    ELSE 'Has USING clause'
  END as using_status,
  CASE 
    WHEN with_check IS NULL THEN 'No WITH CHECK clause'
    ELSE 'Has WITH CHECK clause'
  END as with_check_status
FROM pg_policies 
WHERE tablename = 'platform_settings'
ORDER BY policyname;

