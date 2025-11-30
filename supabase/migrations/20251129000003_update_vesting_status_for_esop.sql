/*
  # Update Vesting Event Status for ESOP Plans
  
  Updates the vesting event status function to automatically change
  ESOP due events to pending_exercise status
*/

-- Update existing function to handle ESOP pending_exercise status
CREATE OR REPLACE FUNCTION update_vesting_event_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update pending events to due if vesting date has passed
  UPDATE vesting_events
  SET 
    status = 'due',
    updated_at = now()
  WHERE status = 'pending'
    AND vesting_date <= CURRENT_DATE;
  
  -- For ESOP plans, change due events to pending_exercise
  UPDATE vesting_events ve
  SET 
    status = 'pending_exercise',
    updated_at = now()
  FROM grants g
  JOIN incentive_plans ip ON g.plan_id = ip.id
  WHERE ve.grant_id = g.id
    AND ip.plan_type = 'ESOP'
    AND ve.status = 'due'
    AND ve.vesting_date <= CURRENT_DATE;
END;
$$;

