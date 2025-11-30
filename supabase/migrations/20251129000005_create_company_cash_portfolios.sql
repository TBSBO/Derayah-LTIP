/*
  # Create Company Cash Portfolios
  
  This migration creates company cash portfolios for existing companies.
  Must be run AFTER the enum value is committed.
*/

-- Create company cash portfolios for existing companies
INSERT INTO portfolios (portfolio_type, company_id, employee_id, portfolio_number, cash_balance, currency)
SELECT 
  'company_cash'::portfolio_type,
  c.id,
  NULL,
  'CASH-COMP-' || c.id::text || '-' || LPAD(
    (ROW_NUMBER() OVER (ORDER BY c.created_at))::text,
    6,
    '0'
  ),
  0,
  'SAR'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM portfolios p 
  WHERE p.company_id = c.id 
  AND p.portfolio_type::text = 'company_cash'
  AND p.employee_id IS NULL
);

