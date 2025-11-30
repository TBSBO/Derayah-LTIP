-- Add exercise_price column to grants table
-- This allows each grant to have its own exercise price (strike price) for ESOP plans
-- If not set at grant level, it will fallback to the plan's exercise_price

ALTER TABLE grants ADD COLUMN IF NOT EXISTS exercise_price numeric(15,4);

-- Add comment
COMMENT ON COLUMN grants.exercise_price IS 'Exercise/strike price per share for ESOP grants. If NULL, inherits from the associated incentive plan.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_grants_exercise_price ON grants(exercise_price) WHERE exercise_price IS NOT NULL;

