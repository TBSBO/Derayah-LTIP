/*
  # Auto-create Cash Portfolios for Employees
  
  Creates cash portfolios for all existing employees and adds trigger
  to auto-create cash portfolios for new employees
*/

-- Create cash portfolios for existing employees
INSERT INTO portfolios (portfolio_type, company_id, employee_id, portfolio_number, cash_balance, currency)
SELECT 
  'employee_cash',
  e.company_id,
  e.id,
  'CASH-' || e.company_id::text || '-' || LPAD(
    (ROW_NUMBER() OVER (PARTITION BY e.company_id ORDER BY e.created_at))::text,
    6,
    '0'
  ),
  0,
  'SAR'
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM portfolios p 
  WHERE p.employee_id = e.id 
  AND p.portfolio_type = 'employee_cash'
);

-- Function to auto-create cash portfolio for new employees
CREATE OR REPLACE FUNCTION create_employee_cash_portfolio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portfolio_number text;
  v_max_number integer;
BEGIN
  -- Get the maximum portfolio number for this company
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(portfolio_number FROM 'CASH-.*-(\d+)') AS INTEGER)),
    0
  )
  INTO v_max_number
  FROM portfolios
  WHERE portfolio_type = 'employee_cash'
  AND company_id = NEW.company_id;
  
  -- Generate portfolio number
  v_portfolio_number := 'CASH-' || NEW.company_id::text || '-' || LPAD(
    (v_max_number + 1)::text,
    6,
    '0'
  );
  
  -- Create cash portfolio
  INSERT INTO portfolios (
    portfolio_type,
    company_id,
    employee_id,
    portfolio_number,
    cash_balance,
    currency
  ) VALUES (
    'employee_cash',
    NEW.company_id,
    NEW.id,
    v_portfolio_number,
    0,
    'SAR'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_create_employee_cash_portfolio ON employees;
CREATE TRIGGER trigger_create_employee_cash_portfolio
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION create_employee_cash_portfolio();

