-- Simple test to verify platform_settings update works
-- This will help identify if it's an RLS issue or something else

-- First, let's see what the current user can do
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID from auth.users

-- Test 1: Check if you're recognized as super admin
SELECT 
  'TEST 1: Check super admin status' as test_name,
  cu.user_id,
  cu.role,
  cu.company_id,
  cu.is_active,
  EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = cu.user_id
      AND role = 'super_admin'
  ) as matches_policy
FROM company_users cu
WHERE cu.role = 'super_admin'
LIMIT 5;

-- Test 2: Try a direct update (this will show the exact error if RLS blocks it)
-- Uncomment and replace YOUR_USER_ID_HERE with your actual user ID
/*
DO $$
DECLARE
  v_user_id uuid := 'YOUR_USER_ID_HERE'::uuid;
  v_test_result text;
BEGIN
  -- Try to update as that user
  SET LOCAL role TO authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  
  UPDATE platform_settings
  SET platform_name_en = 'TEST UPDATE'
  WHERE id = (SELECT id FROM platform_settings LIMIT 1);
  
  RAISE NOTICE 'Update succeeded!';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Update failed: %', SQLERRM;
END $$;
*/

-- Test 3: Check if there are conflicting policies
SELECT 
  'TEST 3: Policy conflicts' as test_name,
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'UPDATE' AND with_check IS NULL THEN 'MISSING WITH CHECK'
    WHEN cmd = 'UPDATE' AND qual IS NULL THEN 'MISSING USING'
    ELSE 'OK'
  END as issue
FROM pg_policies
WHERE tablename = 'platform_settings'
  AND cmd = 'UPDATE';

-- Test 4: Show the exact policy conditions
SELECT 
  'TEST 4: Update policy details' as test_name,
  policyname,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'platform_settings'
  AND cmd = 'UPDATE';

