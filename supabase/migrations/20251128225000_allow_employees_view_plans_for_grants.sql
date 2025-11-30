/*
  # Allow Employees to View Incentive Plans for Their Grants
  
  Adds an RLS policy that allows employees to view incentive_plans
  for plans they have grants for. This is needed for the employee portal
  to display plan type badges (ESOP, RSU, etc.) on grants.
*/

-- Add policy for employees to view incentive plans for their grants
CREATE POLICY "Employees can view plans for their grants"
  ON incentive_plans FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT plan_id 
      FROM grants
      WHERE employee_id IN (
        SELECT id 
        FROM employees 
        WHERE user_id = auth.uid()
      )
    )
  );

