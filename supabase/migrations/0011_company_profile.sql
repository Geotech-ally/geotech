-- Company profile CMS for Nexyvon Technologies public identity.
-- Structured, editable content with draft/published state and admin-only writes.

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  slug text not null default 'default' unique,
  company_name text not null default 'Nexyvon Technologies',
  introduction text,
  background text,
  mission text,
  vision text,
  core_values jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  team jsonb not null default '[]'::jsonb, -- [{name, role, bio, image_url}]
  contact jsonb not null default '{}'::jsonb, -- {email, phone, whatsapp, address, website, linkedin, ...}
  hero_image_url text,
  supporting_images jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_profile enable row level security;

drop policy if exists "public reads published company profile" on public.company_profile;
create policy "public reads published company profile" on public.company_profile
  for select using (is_published or public.is_admin());

drop policy if exists "admin writes company profile" on public.company_profile;
create policy "admin writes company profile" on public.company_profile
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on table public.company_profile from anon;

-- Publicly readable asset bucket for company profile images (admin-managed).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads company assets" on storage.objects;
create policy "public reads company assets" on storage.objects
  for select to public
  using (bucket_id = 'company-assets');

drop policy if exists "admin manages company assets" on storage.objects;
create policy "admin manages company assets" on storage.objects
  for all to authenticated
  using (bucket_id = 'company-assets' and public.is_admin())
  with check (bucket_id = 'company-assets' and public.is_admin());

-- Seed a single editable draft profile from currently identified hard-coded About content.
-- Published remains false so administrators can review/update before public exposure.
insert into public.company_profile (slug, company_name, introduction, background, mission, vision, core_values, objectives, capabilities, team, contact, is_published)
select
  'default',
  'Nexyvon Technologies',
  'I''m a full-stack developer and cybersecurity specialist. I build business software and test it the way an attacker would.',
  'Nexyvon Technologies helps organizations design, build, and secure reliable digital products. Replace this draft with verified company background.',
  'Deliver dependable software and security outcomes that help clients operate with confidence. Draft for administrator review.',
  'To be a trusted technology partner known for quality, integrity, and resilient solutions. Draft for administrator review.',
  '["Quality","Integrity","Security","Reliability","Client focus"]'::jsonb,
  '["Understand client goals","Deliver maintainable solutions","Protect systems and data","Continuously improve services"]'::jsonb,
  '["Full-stack web development","Application security testing","Systems integration","Technical consulting"]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  false
where not exists (select 1 from public.company_profile where slug = 'default');
