-- Comprehensive fix for platform_settings RLS policies
-- This script will:
-- 1. Drop all existing policies
-- 2. Recreate them with proper structure
-- 3. Test the policies

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Super admins can read platform settings" ON platform_settings;
DROP POLICY IF EXISTS "Super admins can update platform settings" ON platform_settings;
DROP POLICY IF EXISTS "Public can read platform logo" ON platform_settings;

-- Step 2: Create read policy for super admins (must match UPDATE policy exactly)
CREATE POLICY "Super admins can read platform settings"
  ON platform_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM company_users
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- Also allow super admins to read via the public policy (for SELECT after UPDATE)
-- This ensures the .select() after .update() works

-- Step 3: Create update policy for super admins (with both USING and WITH CHECK)
CREATE POLICY "Super admins can update platform settings"
  ON platform_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM company_users
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM company_users
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND is_active = true
    )
  );

-- Step 4: Create public read policy for logo (needed for landing pages)
CREATE POLICY "Public can read platform logo"
  ON platform_settings
  FOR SELECT
  TO public
  USING (true);

-- Step 5: Verify policies were created
DO $$
DECLARE
  rec RECORD;
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'platform_settings';
  
  RAISE NOTICE 'Created % policies on platform_settings', v_count;
  
  FOR rec IN
    SELECT policyname, cmd, roles
    FROM pg_policies
    WHERE tablename = 'platform_settings'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'Policy: % | Operation: % | Roles: %', rec.policyname, rec.cmd, rec.roles;
  END LOOP;
END $$;

-- Step 6: Show current super admin users
SELECT 
  'Current Super Admin Users' as info,
  cu.user_id,
  cu.role,
  cu.company_id,
  cu.is_active,
  u.email
FROM company_users cu
LEFT JOIN auth.users u ON u.id = cu.user_id
WHERE cu.role = 'super_admin'
ORDER BY cu.created_at;

