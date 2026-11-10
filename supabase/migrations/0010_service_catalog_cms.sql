-- Service CMS hardening and data cleanup preparation.
-- Preserves existing service IDs/references (inquiries, projects) and admin-only write access.

-- Allow archival/deletion behavior to be explicit while keeping referential integrity.
-- inquiries.service_id and projects.service_id already use ON DELETE SET NULL in schema; ensure it remains safe.

alter table public.services
  add column if not exists icon text,
  add column if not exists image_url text;

-- Normalize existing values for safer admin editing/public display.
update public.services
set
  name = trim(name),
  slug = trim(slug),
  short_description = trim(coalesce(short_description, '')),
  description = trim(coalesce(description, '')),
  category = nullif(trim(coalesce(category, '')), ''),
  estimated_duration = nullif(trim(coalesce(estimated_duration, '')), ''),
  icon = nullif(trim(coalesce(icon, '')), ''),
  features = case when jsonb_typeof(features) = 'array' then features else '[]'::jsonb end,
  updated_at = now();

-- Seeded placeholder records (0001_init) must be reviewed and replaced by administrators.
-- Do not invent commercial prices: clear placeholder amounts and mark records inactive/unfeatured for review.
update public.services
set
  starting_price = null,
  pricing_type = 'custom_quote',
  is_active = false,
  is_featured = false,
  updated_at = now()
where slug in ('website-development', 'web-application-development', 'security-audit')
  and (
    (slug = 'website-development' and starting_price = 35000 and pricing_type = 'starting_from')
    or (slug = 'web-application-development' and starting_price = 150000 and pricing_type = 'starting_from')
    or (slug = 'security-audit' and starting_price is null and pricing_type = 'custom_quote')
  );

-- Helpful constraints/consistency (idempotent-safe via DO blocks where needed).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_pricing_type_check' and conrelid = 'public.services'::regclass
  ) then
    alter table public.services add constraint services_pricing_type_check
      check (pricing_type in ('starting_from','fixed','hourly','custom_quote'));
  end if;
end $$;

create index if not exists services_display_order_idx on public.services (display_order, created_at desc);

-- Re-assert RLS policies (admin writes, public reads active). Existing policies are compatible; recreate for clarity/idempotency.
alter table public.services enable row level security;
drop policy if exists "public reads active services" on public.services;
create policy "public reads active services" on public.services
  for select using (is_active or public.is_admin());
drop policy if exists "admin writes services" on public.services;
create policy "admin writes services" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Prevent accidental public insert/update/delete by revoking direct table privileges from anon.
revoke insert, update, delete on table public.services from anon;
