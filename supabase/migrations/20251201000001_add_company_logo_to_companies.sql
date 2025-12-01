-- Add logo_url column to companies for storing a company-specific logo
-- This logo will be used in the company admin portal, employee portal, and (optionally) branded landing pages.

alter table public.companies
add column if not exists logo_url text;


