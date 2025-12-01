-- Fix platform_settings RLS policy to include WITH CHECK clause
-- This fixes the issue where updates were failing silently

-- Drop the existing update policy
drop policy if exists "Super admins can update platform settings" on platform_settings;

-- Recreate the update policy with both USING and WITH CHECK clauses
-- (removed company_id is null requirement since super admins might have a company_id)
create policy "Super admins can update platform settings"
  on platform_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from company_users
      where user_id = auth.uid()
        and role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from company_users
      where user_id = auth.uid()
        and role = 'super_admin'
    )
  );

-- Also update the read policy to remove company_id is null requirement (if it exists)
drop policy if exists "Super admins can read platform settings" on platform_settings;

create policy "Super admins can read platform settings"
  on platform_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from company_users
      where user_id = auth.uid()
        and role = 'super_admin'
    )
  );

