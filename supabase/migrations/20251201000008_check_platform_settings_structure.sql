-- Diagnostic script to check platform_settings table structure
-- This will help identify if column names match what the code expects

-- Check actual column names
SELECT 
  'TABLE STRUCTURE' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'platform_settings'
ORDER BY ordinal_position;

-- Check current data
SELECT 
  'CURRENT DATA' as info,
  id,
  platform_name_en,
  platform_name_ar,
  logo_url,
  logo_scale,
  updated_at
FROM platform_settings;

-- Check if there are any triggers
SELECT 
  'TRIGGERS' as info,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'platform_settings';

-- Check RLS policies
SELECT 
  'RLS POLICIES' as info,
  policyname,
  cmd as operation,
  roles,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'platform_settings'
ORDER BY policyname;

