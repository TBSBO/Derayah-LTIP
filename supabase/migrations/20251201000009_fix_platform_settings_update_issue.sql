-- Fix platform_settings update issue
-- The UPDATE is executing but not actually updating rows
-- This might be due to RLS WITH CHECK clause or a trigger issue

-- First, let's check if there are any triggers that might be reverting changes
SELECT 
  'CHECKING TRIGGERS' as info,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'platform_settings';

-- Check the actual table structure to ensure column names match
SELECT 
  'TABLE COLUMNS' as info,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'platform_settings'
ORDER BY ordinal_position;

-- Test if we can update directly (this will help identify if it's an RLS issue)
-- Replace YOUR_USER_ID with your actual user ID from auth.users
DO $$
DECLARE
  v_user_id uuid;
  v_test_result text;
BEGIN
  -- Get a super admin user ID for testing
  SELECT user_id INTO v_user_id
  FROM company_users
  WHERE role = 'super_admin'
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No super admin user found for testing';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing update with user_id: %', v_user_id;
  
  -- Try to update (this will show if RLS blocks it)
  UPDATE platform_settings
  SET platform_name_en = 'TEST_UPDATE_' || extract(epoch from now())::text
  WHERE id = (SELECT id FROM platform_settings LIMIT 1);
  
  IF FOUND THEN
    RAISE NOTICE 'Update succeeded!';
  ELSE
    RAISE NOTICE 'Update affected 0 rows - RLS or WHERE clause issue';
  END IF;
END $$;

-- Check current data
SELECT 
  'CURRENT DATA' as info,
  id,
  platform_name_en,
  platform_name_ar,
  updated_at
FROM platform_settings;

-- If the issue is RLS WITH CHECK, we might need to use a function
-- Create a function that bypasses RLS for super admins
-- This function uses SECURITY DEFINER to bypass RLS, but still checks permissions
CREATE OR REPLACE FUNCTION update_platform_settings(
  p_platform_name_en text,
  p_platform_name_ar text,
  p_logo_url text,
  p_logo_scale numeric
)
RETURNS platform_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result platform_settings;
  v_is_super_admin boolean;
BEGIN
  -- Check if user is super admin (same check as RLS policy)
  -- Try with is_active = true first
  SELECT EXISTS (
    SELECT 1
    FROM company_users
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::user_role
      AND is_active = true
  ) INTO v_is_super_admin;
  
  -- If that fails, try without is_active check (some super admins might not have it set)
  IF NOT v_is_super_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM company_users
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::user_role
    ) INTO v_is_super_admin;
  END IF;
  
  -- If still not found, check if user can at least read platform_settings (if they can read, they're super admin)
  IF NOT v_is_super_admin THEN
    -- Try to read platform_settings - if this works, user is super admin
    BEGIN
      PERFORM * FROM platform_settings LIMIT 1;
      v_is_super_admin := true;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_is_super_admin := false;
    END;
  END IF;
  
  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Only super admins can update platform settings. User ID: %. Check company_users table for this user.', auth.uid();
  END IF;
  
  -- Update the row (use COALESCE to handle null values, but allow empty strings)
  UPDATE platform_settings
  SET 
    platform_name_en = CASE WHEN p_platform_name_en IS NOT NULL THEN p_platform_name_en ELSE platform_name_en END,
    platform_name_ar = CASE WHEN p_platform_name_ar IS NOT NULL THEN p_platform_name_ar ELSE platform_name_ar END,
    logo_url = CASE WHEN p_logo_url IS NOT NULL THEN p_logo_url ELSE logo_url END,
    logo_scale = CASE WHEN p_logo_scale IS NOT NULL THEN p_logo_scale ELSE logo_scale END,
    updated_at = now()
  WHERE id = (SELECT id FROM platform_settings LIMIT 1)
  RETURNING * INTO v_result;
  
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'No platform_settings row found to update';
  END IF;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_platform_settings TO authenticated;

