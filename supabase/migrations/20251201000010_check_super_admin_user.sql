-- Check what the function sees for the current super admin user
-- This will help diagnose why the function check is failing

-- Check the super admin user's company_users record
SELECT 
  'SUPER ADMIN USER CHECK' as info,
  cu.user_id,
  cu.role,
  cu.company_id,
  cu.is_active,
  u.email,
  CASE 
    WHEN cu.role = 'super_admin' AND cu.is_active = true THEN 'Should pass check (with is_active)'
    WHEN cu.role = 'super_admin' THEN 'Should pass check (without is_active)'
    ELSE 'Will fail check'
  END as check_result
FROM company_users cu
JOIN auth.users u ON u.id = cu.user_id
WHERE cu.user_id = auth.uid()
  AND cu.role = 'super_admin';

-- Also check all super admin users
SELECT 
  'ALL SUPER ADMIN USERS' as info,
  cu.user_id,
  cu.role,
  cu.company_id,
  cu.is_active,
  u.email
FROM company_users cu
JOIN auth.users u ON u.id = cu.user_id
WHERE cu.role = 'super_admin'
ORDER BY cu.created_at;

