-- Create platform_settings table for platform-level branding
-- This is a singleton table (only one row) for platform-wide settings

create table if not exists platform_settings (
  id uuid primary key default gen_random_uuid(),
  platform_name_en text,
  platform_name_ar text,
  logo_url text,
  logo_scale numeric default 1.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create a function to ensure only one row exists
create or replace function ensure_platform_settings_singleton()
returns trigger as $$
begin
  -- If this is not the first row, prevent insertion
  if (select count(*) from platform_settings) > 0 and tg_op = 'INSERT' then
    raise exception 'platform_settings can only have one row';
  end if;
  return new;
end;
$$ language plpgsql;

-- Create trigger to enforce singleton
create trigger platform_settings_singleton_trigger
before insert on platform_settings
for each row execute function ensure_platform_settings_singleton();

-- Insert default row (only if table is empty)
do $$
begin
  if not exists (select 1 from platform_settings) then
    insert into platform_settings (platform_name_en, platform_name_ar, logo_url, logo_scale)
    values ('Derayah Equity Studio', 'ديراياه إستوديو الأسهم', null, 1.0);
  end if;
end $$;

-- Enable RLS
alter table platform_settings enable row level security;

-- Allow super admins to read and update
create policy "Super admins can read platform settings"
  on platform_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from company_users
      where user_id = auth.uid()
      and role = 'super_admin'
    )
  );

create policy "Super admins can update platform settings"
  on platform_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from company_users
      where user_id = auth.uid()
      and role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from company_users
      where user_id = auth.uid()
      and role = 'super_admin'
    )
  );

-- Allow public read access for logo_url (needed for landing pages and login pages)
create policy "Public can read platform logo"
  on platform_settings
  for select
  to public
  using (true);

