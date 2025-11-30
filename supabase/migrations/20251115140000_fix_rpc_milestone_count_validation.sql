-- Fix the generate_vesting_events_for_grant function to validate milestone count
-- and regenerate milestones if the count doesn't match expected
-- Also accepts optional schedule_id parameter to ensure correct schedule is used

CREATE OR REPLACE FUNCTION generate_vesting_events_for_grant(
  p_grant_id uuid,
  p_schedule_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant grants%ROWTYPE;
  v_plan incentive_plans%ROWTYPE;
  v_template vesting_schedules%ROWTYPE;
  v_grant_schedule vesting_schedules%ROWTYPE;
  v_vesting_config jsonb;
  v_start_date date;
  v_cliff_months integer;
  v_total_months integer;
  v_frequency text;
  v_frequency_months integer;
  v_total_periods integer;
  v_shares_per_period numeric;
  v_cliff_shares numeric;
  v_current_date date;
  v_cumulative_shares numeric := 0;
  v_sequence integer := 1;
  v_exercise_price numeric;
  v_allocated_shares numeric := 0;
  v_shares_this_period numeric;
  v_use_even_distribution boolean;
  v_has_even_distribution_col boolean;
  v_has_vesting_schedule_id_col boolean;
  v_has_exercise_price_col boolean;
  v_grant_vesting_schedule_id uuid;
  -- Milestone tracking variables
  v_schedule_id_for_milestones uuid;
  v_milestones_count integer := 0;
  v_has_milestones boolean := false;
  v_milestone_record RECORD;
  v_event_type vesting_event_type;
  v_max_sequence_order integer;
  -- Validation variables
  v_expected_milestone_count integer;
  v_expected_periods integer;
  v_schedule_for_validation vesting_schedules%ROWTYPE;
  v_validation_frequency integer;
  v_schedule_for_milestones vesting_schedules%ROWTYPE;
  v_milestone_frequency integer;
  v_milestone_periods integer;
  v_milestone_percentage numeric;
  v_milestone_order integer;
  v_milestone_type milestone_type;
BEGIN
  -- Check if use_even_distribution column exists in the table
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'grants' 
    AND column_name = 'use_even_distribution'
  ) INTO v_has_even_distribution_col;

  -- Check if vesting_schedule_id column exists in the table
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'grants' 
    AND column_name = 'vesting_schedule_id'
  ) INTO v_has_vesting_schedule_id_col;

  -- Check if exercise_price column exists in the table
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'grants' 
    AND column_name = 'exercise_price'
  ) INTO v_has_exercise_price_col;

  -- Get grant details
  BEGIN
    SELECT * INTO v_grant FROM grants WHERE id = p_grant_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to load grant: %', SQLERRM;
  END;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant not found: %', p_grant_id;
  END IF;

  -- Get even distribution preference from grant (only if column exists)
  IF v_has_even_distribution_col THEN
    BEGIN
      EXECUTE format('SELECT use_even_distribution FROM grants WHERE id = $1')
      USING p_grant_id
      INTO v_use_even_distribution;
      v_use_even_distribution := COALESCE(v_use_even_distribution, false);
    EXCEPTION WHEN OTHERS THEN
      v_use_even_distribution := false;
    END;
  ELSE
    v_use_even_distribution := false;
  END IF;

  -- Get plan details
  SELECT * INTO v_plan FROM incentive_plans WHERE id = v_grant.plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', v_grant.plan_id;
  END IF;

  -- Get vesting schedule details
  v_start_date := v_grant.vesting_start_date;
  
  -- CRITICAL: Check p_schedule_id parameter FIRST (highest priority)
  -- This ensures we use the schedule selected during grant creation
  IF p_schedule_id IS NOT NULL THEN
    SELECT * INTO v_grant_schedule 
    FROM vesting_schedules 
    WHERE id = p_schedule_id;
    
    IF FOUND THEN
      v_cliff_months := v_grant_schedule.cliff_months;
      v_total_months := v_grant_schedule.total_duration_months;
      v_frequency := v_grant_schedule.vesting_frequency;
      v_grant_vesting_schedule_id := p_schedule_id;
      RAISE NOTICE 'RPC: Using provided p_schedule_id parameter: % (%, % months, % month cliff)', 
        v_grant_schedule.name, v_frequency, v_total_months, v_cliff_months;
    END IF;
  END IF;
  
  -- PRIORITY 1: Check if grant has a selected vesting_schedule_id (only if column exists)
  -- Only check if p_schedule_id was not provided
  IF v_grant_schedule IS NULL AND v_has_vesting_schedule_id_col THEN
    BEGIN
      EXECUTE format('SELECT vesting_schedule_id FROM grants WHERE id = $1')
      USING p_grant_id
      INTO v_grant_vesting_schedule_id;
      
      IF v_grant_vesting_schedule_id IS NOT NULL THEN
        SELECT * INTO v_grant_schedule 
        FROM vesting_schedules 
        WHERE id = v_grant_vesting_schedule_id;
        
        IF FOUND THEN
          v_cliff_months := v_grant_schedule.cliff_months;
          v_total_months := v_grant_schedule.total_duration_months;
          v_frequency := v_grant_schedule.vesting_frequency;
          RAISE NOTICE 'Using grant-selected vesting schedule: % (%, % months, % month cliff)', 
            v_grant_schedule.name, v_frequency, v_total_months, v_cliff_months;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  
  -- PRIORITY 2: Try to get template details from plan
  IF v_grant_schedule IS NULL AND v_plan.vesting_schedule_template_id IS NOT NULL THEN
    SELECT * INTO v_template 
    FROM vesting_schedules 
    WHERE id = v_plan.vesting_schedule_template_id AND is_template = true;
    
    IF FOUND THEN
      v_cliff_months := v_template.cliff_months;
      v_total_months := v_template.total_duration_months;
      v_frequency := v_template.vesting_frequency;
      RAISE NOTICE 'Using plan template vesting schedule: % (%, % months, % month cliff)', 
        v_template.name, v_frequency, v_total_months, v_cliff_months;
    END IF;
  END IF;

  -- PRIORITY 3: Fallback to vesting_config
  IF v_grant_schedule IS NULL AND v_template IS NULL THEN
    v_vesting_config := COALESCE(v_plan.vesting_config, '{}'::jsonb);
    v_cliff_months := COALESCE((v_vesting_config->>'cliff_months')::integer, 12);
    v_total_months := COALESCE((v_vesting_config->>'years')::integer * 12, 48);
    v_frequency := COALESCE(v_vesting_config->>'frequency', 'monthly');
    RAISE NOTICE 'Using plan vesting_config: %, % months, % month cliff', 
      v_frequency, v_total_months, v_cliff_months;
  END IF;

  -- Determine which schedule ID to check for milestones
  -- Use p_schedule_id if provided, otherwise use grant's schedule or plan template
  IF p_schedule_id IS NOT NULL THEN
    v_schedule_id_for_milestones := p_schedule_id;
  ELSIF v_grant_vesting_schedule_id IS NOT NULL THEN
    v_schedule_id_for_milestones := v_grant_vesting_schedule_id;
  ELSIF v_plan.vesting_schedule_template_id IS NOT NULL THEN
    v_schedule_id_for_milestones := v_plan.vesting_schedule_template_id;
  ELSE
    v_schedule_id_for_milestones := NULL;
  END IF;

  -- Check if milestones exist for this schedule and validate count
  IF v_schedule_id_for_milestones IS NOT NULL THEN
    -- Get the schedule for validation
    SELECT * INTO v_schedule_for_validation
    FROM vesting_schedules
    WHERE id = v_schedule_id_for_milestones;
    
    IF FOUND THEN
      -- Calculate expected milestone count (no nested DECLARE block)
      v_validation_frequency := CASE v_schedule_for_validation.vesting_frequency
        WHEN 'monthly' THEN 1
        WHEN 'quarterly' THEN 3
        WHEN 'annually' THEN 12
        ELSE 1
      END;
      
      -- Calculate expected periods based on distribution method (matches preview calculation)
      -- Use CEIL for even distribution, FLOOR for percentage-based
      IF v_use_even_distribution THEN
        v_expected_periods := CEIL((v_schedule_for_validation.total_duration_months - v_schedule_for_validation.cliff_months)::numeric / v_validation_frequency);
      ELSE
        v_expected_periods := FLOOR((v_schedule_for_validation.total_duration_months - v_schedule_for_validation.cliff_months)::numeric / v_validation_frequency);
      END IF;
      v_expected_milestone_count := (CASE WHEN v_schedule_for_validation.cliff_months > 0 THEN 1 ELSE 0 END) + v_expected_periods;
      
      -- Count existing milestones
      SELECT COUNT(*) INTO v_milestones_count
      FROM vesting_milestones
      WHERE vesting_schedule_id = v_schedule_id_for_milestones
      AND months_from_start IS NOT NULL
      AND months_from_start > 0;

      RAISE NOTICE 'Schedule %: Found % milestones, expected % milestones (periods: %, cliff: %, frequency: %)', 
        v_schedule_id_for_milestones, v_milestones_count, v_expected_milestone_count, 
        v_expected_periods, v_schedule_for_validation.cliff_months, v_validation_frequency;

      -- Validate milestone count
      IF v_milestones_count > 0 AND v_milestones_count != v_expected_milestone_count THEN
        RAISE NOTICE 'Found incorrect number of milestones (% found, % expected) for schedule %, regenerating them', 
          v_milestones_count, v_expected_milestone_count, v_schedule_id_for_milestones;
        
        -- Delete incorrect milestones
        DELETE FROM vesting_milestones
        WHERE vesting_schedule_id = v_schedule_id_for_milestones;
        
        v_milestones_count := 0;
      END IF;
    END IF;

    IF v_milestones_count > 0 THEN
      v_has_milestones := true;
      RAISE NOTICE 'Found % milestones for schedule %, using milestones instead of frequency', 
        v_milestones_count, v_schedule_id_for_milestones;
    ELSE
      -- No milestones found or invalid count - generate them from schedule settings
      RAISE NOTICE 'No milestones found or invalid count for schedule %, generating them from schedule settings', 
        v_schedule_id_for_milestones;
      
      -- Get the schedule to generate milestones from (no nested DECLARE block)
      BEGIN
        SELECT * INTO v_schedule_for_milestones
        FROM vesting_schedules
        WHERE id = v_schedule_id_for_milestones;
        
        IF FOUND THEN
          -- Determine milestone type from schedule type
          v_milestone_type := CASE v_schedule_for_milestones.schedule_type
            WHEN 'time_based' THEN 'time'::milestone_type
            WHEN 'performance_based' THEN 'performance'::milestone_type
            WHEN 'hybrid' THEN 'hybrid'::milestone_type
            ELSE 'time'::milestone_type
          END;
          
          -- Calculate frequency in months
          v_milestone_frequency := CASE v_schedule_for_milestones.vesting_frequency
            WHEN 'monthly' THEN 1
            WHEN 'quarterly' THEN 3
            WHEN 'annually' THEN 12
            ELSE 1
          END;
          
          v_milestone_order := 0;
          v_milestones_count := 0;
          
          -- Generate cliff milestone if applicable
          IF v_schedule_for_milestones.cliff_months > 0 THEN
            INSERT INTO vesting_milestones (
              vesting_schedule_id,
              milestone_type,
              sequence_order,
              vesting_percentage,
              months_from_start
            ) VALUES (
              v_schedule_id_for_milestones,
              v_milestone_type,
              v_milestone_order,
              25.0,
              v_schedule_for_milestones.cliff_months
            );
            v_milestone_order := v_milestone_order + 1;
            v_milestones_count := v_milestones_count + 1;
          END IF;
          
          -- Generate regular milestones
          -- Calculate periods based on distribution method (matches preview calculation)
          -- Use CEIL for even distribution, FLOOR for percentage-based
          IF v_use_even_distribution THEN
            v_milestone_periods := CEIL((v_schedule_for_milestones.total_duration_months - v_schedule_for_milestones.cliff_months)::numeric / v_milestone_frequency);
          ELSE
            v_milestone_periods := FLOOR((v_schedule_for_milestones.total_duration_months - v_schedule_for_milestones.cliff_months)::numeric / v_milestone_frequency);
          END IF;
          
          RAISE NOTICE 'Generating milestones: total_months=%, cliff_months=%, frequency=%, periods=%', 
            v_schedule_for_milestones.total_duration_months, 
            v_schedule_for_milestones.cliff_months,
            v_milestone_frequency,
            v_milestone_periods;
          
          IF v_milestone_periods > 0 THEN
            v_milestone_percentage := 75.0 / v_milestone_periods;
            
            FOR i IN 1..v_milestone_periods LOOP
              INSERT INTO vesting_milestones (
                vesting_schedule_id,
                milestone_type,
                sequence_order,
                vesting_percentage,
                months_from_start
              ) VALUES (
                v_schedule_id_for_milestones,
                v_milestone_type,
                v_milestone_order,
                v_milestone_percentage,
                v_schedule_for_milestones.cliff_months + (i * v_milestone_frequency)
              );
              v_milestone_order := v_milestone_order + 1;
              v_milestones_count := v_milestones_count + 1;
            END LOOP;
          END IF;
          
          v_has_milestones := true;
          RAISE NOTICE 'Generated % milestones for schedule % (frequency: % months, periods: %)', 
            v_milestones_count, v_schedule_id_for_milestones, v_milestone_frequency, v_milestone_periods;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error generating milestones: %, continuing with frequency-based calculation', SQLERRM;
        v_has_milestones := false;
      END;
    END IF;
  END IF;

  -- Set exercise price for ESOP plans
  -- Priority: grant-level exercise_price > plan-level exercise_price > default 1.0
  IF v_plan.plan_type = 'ESOP' THEN
    IF v_has_exercise_price_col THEN
      BEGIN
        EXECUTE format('SELECT exercise_price FROM grants WHERE id = $1')
        USING p_grant_id
        INTO v_exercise_price;
        
        -- If grant doesn't have exercise_price set, fallback to plan's exercise_price
        IF v_exercise_price IS NULL THEN
          v_exercise_price := v_plan.exercise_price;
        END IF;
        
        -- Final fallback to 1.0 if neither grant nor plan has it
        v_exercise_price := COALESCE(v_exercise_price, 1.0);
      EXCEPTION WHEN OTHERS THEN
        -- On error, try plan's exercise_price, then default to 1.0
        v_exercise_price := COALESCE(v_plan.exercise_price, 1.0);
      END;
    ELSE
      -- Column doesn't exist yet, use plan's exercise_price or default
      v_exercise_price := COALESCE(v_plan.exercise_price, 1.0);
    END IF;
  ELSE
    v_exercise_price := NULL;
  END IF;

  -- Always use frequency-based calculation (matches preview logic exactly)
  -- Delete existing vesting events first to ensure clean state
  DELETE FROM vesting_events WHERE grant_id = p_grant_id;

  -- CRITICAL: Use provided schedule_id if available, otherwise fetch from grant
  -- Priority: p_schedule_id parameter > grant's vesting_schedule_id > plan template > plan config
  IF p_schedule_id IS NOT NULL THEN
    -- Use the provided schedule_id (from frontend)
    SELECT * INTO v_grant_schedule 
    FROM vesting_schedules 
    WHERE id = p_schedule_id;
    
    IF FOUND THEN
      v_cliff_months := v_grant_schedule.cliff_months;
      v_total_months := v_grant_schedule.total_duration_months;
      v_frequency := v_grant_schedule.vesting_frequency;
      RAISE NOTICE 'RPC: Using provided schedule_id: % (%, % months, % month cliff)', 
        v_grant_schedule.name, v_frequency, v_total_months, v_cliff_months;
    END IF;
  ELSIF v_has_vesting_schedule_id_col THEN
    -- Fallback: Re-fetch grant's vesting_schedule_id
    BEGIN
      EXECUTE format('SELECT vesting_schedule_id FROM grants WHERE id = $1')
      USING p_grant_id
      INTO v_grant_vesting_schedule_id;
      
      -- If grant has a selected schedule, use it (override any previous selection)
      IF v_grant_vesting_schedule_id IS NOT NULL THEN
        SELECT * INTO v_grant_schedule 
        FROM vesting_schedules 
        WHERE id = v_grant_vesting_schedule_id;
        
        IF FOUND THEN
          v_cliff_months := v_grant_schedule.cliff_months;
          v_total_months := v_grant_schedule.total_duration_months;
          v_frequency := v_grant_schedule.vesting_frequency;
          RAISE NOTICE 'RPC: Using grant-selected vesting schedule: % (%, % months, % month cliff)', 
            v_grant_schedule.name, v_frequency, v_total_months, v_cliff_months;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'RPC: Could not fetch grant vesting_schedule_id: %', SQLERRM;
    END;
  END IF;

  -- Calculate frequency in months
  v_frequency_months := CASE v_frequency
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'annually' THEN 12
    ELSE 1
  END;

  -- Calculate periods using same logic as preview
  -- Use CEIL for even distribution, FLOOR for percentage-based (matches preview)
  IF v_use_even_distribution THEN
    v_total_periods := CEIL((v_total_months - v_cliff_months)::numeric / v_frequency_months);
  ELSE
    v_total_periods := FLOOR((v_total_months - v_cliff_months)::numeric / v_frequency_months);
  END IF;
  
  RAISE NOTICE 'RPC: Using frequency-based calculation (matches preview): total_months=%, cliff_months=%, frequency_months=%, total_periods=%, even_distribution=%, expected_events=%', 
    v_total_months, v_cliff_months, v_frequency_months, v_total_periods, v_use_even_distribution, 
    (CASE WHEN v_cliff_months > 0 THEN 1 ELSE 0 END) + v_total_periods;
  
  -- Calculate shares based on distribution method (same as preview)
  IF v_use_even_distribution THEN
    IF v_cliff_months > 0 THEN
      v_cliff_shares := FLOOR(v_grant.total_shares::numeric / (v_total_periods + 1));
      v_shares_per_period := FLOOR((v_grant.total_shares::numeric - v_cliff_shares) / v_total_periods);
    ELSE
      v_shares_per_period := FLOOR(v_grant.total_shares::numeric / v_total_periods);
      v_cliff_shares := 0;
    END IF;
  ELSE
    IF v_cliff_months > 0 THEN
      v_cliff_shares := FLOOR(v_grant.total_shares::numeric * 0.25);
      v_shares_per_period := FLOOR((v_grant.total_shares::numeric - v_cliff_shares) / v_total_periods);
    ELSE
      v_cliff_shares := 0;
      v_shares_per_period := FLOOR(v_grant.total_shares::numeric / v_total_periods);
    END IF;
  END IF;

  -- Reset sequence and allocated shares
  v_sequence := 1;
  v_allocated_shares := 0;

  -- Create cliff event if applicable
  IF v_cliff_months > 0 AND v_cliff_shares > 0 THEN
    v_current_date := v_start_date + (v_cliff_months || ' months')::interval;
    v_cumulative_shares := v_cliff_shares;
    v_allocated_shares := v_cliff_shares;
    
    INSERT INTO vesting_events (
      grant_id, employee_id, company_id, event_type, sequence_number,
      vesting_date, shares_to_vest, cumulative_shares_vested,
      exercise_price, total_exercise_cost
    ) VALUES (
      p_grant_id, v_grant.employee_id, v_grant.company_id, 'cliff'::vesting_event_type, v_sequence,
      v_current_date, v_cliff_shares, v_cumulative_shares,
      v_exercise_price, 
      CASE WHEN v_exercise_price IS NOT NULL THEN v_cliff_shares * v_exercise_price ELSE NULL END
    );
    
    v_sequence := v_sequence + 1;
  END IF;

  -- Create regular vesting events
  FOR i IN 1..v_total_periods LOOP
    v_current_date := v_start_date + ((v_cliff_months + i * v_frequency_months) || ' months')::interval;
    
    -- Calculate shares for this period (last period gets remainder)
    IF i = v_total_periods THEN
      v_shares_this_period := v_grant.total_shares - v_allocated_shares;
    ELSE
      v_shares_this_period := v_shares_per_period;
    END IF;
    
    -- Only insert if shares > 0
    IF v_shares_this_period > 0 THEN
      v_allocated_shares := v_allocated_shares + v_shares_this_period;
      v_cumulative_shares := v_allocated_shares;
      
      -- Determine event type based on plan's vesting_schedule_type
      v_event_type := CASE v_plan.vesting_schedule_type
        WHEN 'performance_based' THEN 'performance'::vesting_event_type
        WHEN 'hybrid' THEN 'time_based'::vesting_event_type
        ELSE 'time_based'::vesting_event_type
      END;
      
      INSERT INTO vesting_events (
        grant_id, employee_id, company_id, event_type, sequence_number,
        vesting_date, shares_to_vest, cumulative_shares_vested,
        exercise_price, total_exercise_cost
      ) VALUES (
        p_grant_id, v_grant.employee_id, v_grant.company_id, v_event_type, v_sequence,
        v_current_date, v_shares_this_period, v_cumulative_shares,
        v_exercise_price,
        CASE WHEN v_exercise_price IS NOT NULL THEN v_shares_this_period * v_exercise_price ELSE NULL END
      );
      
      v_sequence := v_sequence + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Generated % vesting events using frequency-based calculation (matches preview) for grant % (total shares: %, allocated: %, even_distribution: %)', 
    v_sequence - 1, p_grant_id, v_grant.total_shares, v_allocated_shares, v_use_even_distribution;
END;
$$;
