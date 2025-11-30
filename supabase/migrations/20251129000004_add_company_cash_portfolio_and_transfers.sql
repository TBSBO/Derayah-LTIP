/*
  # Add Company Cash Portfolio and Cash Transfers System
  
  This migration:
  1. Creates cash_transfers table for tracking all cash movements
  2. Adds trigger to auto-create company cash portfolios
  3. Updates portfolios to support company cash portfolios
*/

-- Create cash_transfers table
CREATE TABLE IF NOT EXISTS cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text UNIQUE NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Transfer details
  transfer_type text NOT NULL CHECK (transfer_type IN (
    'company_deposit',      -- Company deposits to its own cash portfolio
    'employee_deposit',     -- Employee deposits to their cash portfolio
    'exercise_settlement'   -- Cash transferred from employee to company when exercising options
  )),
  
  -- Source and destination portfolios
  from_portfolio_id uuid REFERENCES portfolios(id),
  to_portfolio_id uuid REFERENCES portfolios(id),
  
  -- Employee-related (for employee_deposit and exercise_settlement)
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Exercise order (for exercise_settlement)
  exercise_order_id uuid REFERENCES exercise_orders(id) ON DELETE SET NULL,
  
  -- Amount and currency
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  currency text DEFAULT 'SAR',
  
  -- Status and approval
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  
  -- Description/notes
  description text,
  notes text,
  
  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_transfers_company_id ON cash_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_employee_id ON cash_transfers(employee_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_status ON cash_transfers(status);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_transfer_type ON cash_transfers(transfer_type);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_exercise_order_id ON cash_transfers(exercise_order_id);

-- Enable RLS
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view own cash transfers" ON cash_transfers;
DROP POLICY IF EXISTS "Employees can create deposit requests" ON cash_transfers;
DROP POLICY IF EXISTS "Company admins can view all cash transfers" ON cash_transfers;
DROP POLICY IF EXISTS "Company admins can create company deposits" ON cash_transfers;
DROP POLICY IF EXISTS "Finance admins can approve/reject cash transfers" ON cash_transfers;

-- RLS Policies for cash_transfers
CREATE POLICY "Employees can view own cash transfers"
  ON cash_transfers FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can create deposit requests"
  ON cash_transfers FOR INSERT
  TO authenticated
  WITH CHECK (
    transfer_type = 'employee_deposit' AND
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can view all cash transfers"
  ON cash_transfers FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can create company deposits"
  ON cash_transfers FOR INSERT
  TO authenticated
  WITH CHECK (
    transfer_type = 'company_deposit' AND
    company_id IN (
      SELECT company_id FROM company_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Finance admins can approve/reject cash transfers"
  ON cash_transfers FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid() 
      AND (
        role IN ('super_admin', 'finance_admin', 'company_admin', 'hr_admin', 'operations_admin')
        OR (permissions->>'approve_cash_transfers')::boolean = true
      )
    )
  );

-- Add company_cash to portfolio_type enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'company_cash' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'portfolio_type')
  ) THEN
    ALTER TYPE portfolio_type ADD VALUE 'company_cash';
  END IF;
END $$;

-- Function to auto-create company cash portfolio for new companies
-- Note: This will be created in the next migration after enum is committed
CREATE OR REPLACE FUNCTION create_company_cash_portfolio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portfolio_number text;
BEGIN
  -- Generate portfolio number
  v_portfolio_number := 'CASH-COMP-' || NEW.id::text || '-' || LPAD('1', 6, '0');
  
  -- Create cash portfolio
  INSERT INTO portfolios (
    portfolio_type,
    company_id,
    employee_id,
    portfolio_number,
    cash_balance,
    currency
  ) VALUES (
    'company_cash'::portfolio_type,
    NEW.id,
    NULL,
    v_portfolio_number,
    0,
    'SAR'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_create_company_cash_portfolio ON companies;
CREATE TRIGGER trigger_create_company_cash_portfolio
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION create_company_cash_portfolio();

