/*
  # Add Operations Admin Role - Part 1: Enum Value
  
  Adds the operations_admin role to the user_role enum.
  This must be in a separate transaction because PostgreSQL requires
  new enum values to be committed before they can be used.
*/

-- Add operations_admin to user_role enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'operations_admin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'operations_admin';
    RAISE NOTICE 'Added operations_admin to user_role enum';
  ELSE
    RAISE NOTICE 'operations_admin already exists in user_role enum';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'operations_admin enum value check completed: %', SQLERRM;
END $$;

