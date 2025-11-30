/*
  # Add Operations Admin Role - Part 2: Update Policies
  
  Updates all RLS policies and functions to include operations_admin
  with the same permissions as hr_admin.
  This runs in a separate migration after the enum value is committed.
*/

-- Update RLS policies to include operations_admin where hr_admin is used

-- Update employee management policies
DROP POLICY IF EXISTS "HR admins can manage employees" ON employees;
CREATE POLICY "HR admins can manage employees"
  ON employees FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'operations_admin')
    )
  );

-- Update grants management policies
DROP POLICY IF EXISTS "HR admins can manage grants" ON grants;
CREATE POLICY "HR admins can manage grants"
  ON grants FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'operations_admin')
    )
  );

-- Update company admins can view company employees
DROP POLICY IF EXISTS "Company admins can view company employees" ON employees;
CREATE POLICY "Company admins can view company employees"
  ON employees FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'finance_admin', 'operations_admin')
    )
  );

-- Update company admins can view company grants
DROP POLICY IF EXISTS "Company admins can view company grants" ON grants;
CREATE POLICY "Company admins can view company grants"
  ON grants FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'finance_admin', 'operations_admin')
    )
  );

-- Update company admins can view company portfolios
DROP POLICY IF EXISTS "Company admins can view company portfolios" ON portfolios;
CREATE POLICY "Company admins can view company portfolios"
  ON portfolios FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'finance_admin', 'operations_admin')
    )
  );

-- Update plans management policies
DROP POLICY IF EXISTS "Admins can manage plans" ON incentive_plans;
CREATE POLICY "Admins can manage plans"
  ON incentive_plans FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'operations_admin', 'finance_admin')
    )
  );

-- Update is_company_admin function
CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM company_users
    WHERE company_id = p_company_id 
    AND user_id = p_user_id 
    AND role IN ('super_admin', 'hr_admin', 'finance_admin', 'legal_admin', 'operations_admin')
  );
END;
$$;

-- Drop dependent view first, then drop and recreate user_roles view
-- We must DROP and CREATE (not REPLACE) because the column type might change
DROP VIEW IF EXISTS all_user_roles CASCADE;
DROP VIEW IF EXISTS user_roles CASCADE;

-- Recreate user_roles view to include operations_admin in company_admin type
CREATE VIEW user_roles AS
SELECT 
  cu.user_id,
  '' as email, -- Will be filled by application
  cu.company_id,
  cu.role,
  cu.is_active,
  CASE 
    WHEN cu.role = 'super_admin' THEN 'super_admin'
    WHEN cu.role IN ('hr_admin', 'finance_admin', 'legal_admin', 'operations_admin', 'company_admin') THEN 'company_admin'
    WHEN EXISTS (SELECT 1 FROM employees e WHERE e.user_id = cu.user_id) THEN 'employee'
    ELSE 'unknown'
  END as user_type
FROM company_users cu
WHERE cu.is_active = true;

-- Recreate all_user_roles view if employee_roles view exists
-- Note: We need to explicitly select columns to match since user_roles has 'email' but employee_roles doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE viewname = 'employee_roles'
  ) THEN
    CREATE OR REPLACE VIEW all_user_roles AS
    SELECT 
      user_id,
      '' as email, -- employee_roles doesn't have email, so use empty string
      company_id,
      role::text, -- Cast enum to text to match employee_roles.role (which is 'employee' text)
      is_active,
      user_type
    FROM user_roles
    UNION ALL
    SELECT 
      user_id,
      '' as email, -- Add email column to match user_roles structure
      company_id,
      role, -- This is already text ('employee')
      is_active,
      user_type
    FROM employee_roles;
  END IF;
END $$;

