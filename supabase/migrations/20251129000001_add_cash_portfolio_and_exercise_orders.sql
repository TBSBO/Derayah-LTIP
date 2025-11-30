/*
  # Add Cash Portfolio Support and Exercise Orders System
  
  This migration:
  1. Adds 'employee_cash' to portfolio_type enum
  2. Adds 'pending_exercise' to vesting_event_status enum
  3. Creates exercise_orders table
  4. Updates portfolios table to support cash balances
*/

-- Add employee_cash to portfolio_type enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'employee_cash' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'portfolio_type')
  ) THEN
    ALTER TYPE portfolio_type ADD VALUE 'employee_cash';
  END IF;
END $$;

-- Add pending_exercise to vesting_event_status enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'pending_exercise' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'vesting_event_status')
  ) THEN
    ALTER TYPE vesting_event_status ADD VALUE 'pending_exercise';
  END IF;
END $$;

-- Add cash balance fields to portfolios table (for cash portfolios)
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS cash_balance numeric(15,2) DEFAULT 0;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS currency text DEFAULT 'SAR';

-- Create exercise_orders table
CREATE TABLE IF NOT EXISTS exercise_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  vesting_event_id uuid NOT NULL REFERENCES vesting_events(id) ON DELETE CASCADE,
  grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  
  -- Order details
  shares_to_exercise numeric(15,2) NOT NULL CHECK (shares_to_exercise > 0),
  exercise_price_per_share numeric(15,4) NOT NULL,
  total_exercise_cost numeric(15,2) NOT NULL,
  
  -- Cash portfolio
  cash_portfolio_id uuid REFERENCES portfolios(id),
  cash_balance_at_order numeric(15,2),
  sufficient_funds boolean NOT NULL DEFAULT false,
  
  -- Order status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed', 'cancelled')),
  
  -- Processing
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  rejection_reason text,
  
  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  UNIQUE(vesting_event_id) -- One order per vesting event
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_exercise_orders_employee_id ON exercise_orders(employee_id);
CREATE INDEX IF NOT EXISTS idx_exercise_orders_company_id ON exercise_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_exercise_orders_status ON exercise_orders(status);
CREATE INDEX IF NOT EXISTS idx_exercise_orders_vesting_event_id ON exercise_orders(vesting_event_id);

-- Enable RLS
ALTER TABLE exercise_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view own exercise orders" ON exercise_orders;
DROP POLICY IF EXISTS "Employees can create exercise orders" ON exercise_orders;
DROP POLICY IF EXISTS "Company admins can view all exercise orders" ON exercise_orders;
DROP POLICY IF EXISTS "Company admins can update exercise orders" ON exercise_orders;

-- RLS Policies for exercise_orders
CREATE POLICY "Employees can view own exercise orders"
  ON exercise_orders FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can create exercise orders"
  ON exercise_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can view all exercise orders"
  ON exercise_orders FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can update exercise orders"
  ON exercise_orders FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'hr_admin', 'finance_admin', 'operations_admin')
    )
  );

