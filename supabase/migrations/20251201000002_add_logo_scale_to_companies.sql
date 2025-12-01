-- Add logo_scale to control how large the company logo appears in the UI.
-- This is a simple scalar used to scale the logo inside a fixed container.

alter table public.companies
add column if not exists logo_scale numeric default 1.0;


