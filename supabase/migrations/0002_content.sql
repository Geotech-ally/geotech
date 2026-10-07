create table projects (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, summary text not null,
  problem text, solution text, result text, technologies text[] not null default '{}', image_url text,
  service_id uuid references services on delete set null, is_published boolean not null default false, display_order int not null default 0,
  created_at timestamptz not null default now());
create table testimonials (id uuid primary key default gen_random_uuid(), author text not null, role text, quote text not null,
  is_published boolean not null default false, created_at timestamptz not null default now());
alter table projects enable row level security; alter table testimonials enable row level security;
create policy "public reads published projects" on projects for select using (is_published or is_admin());
create policy "admin writes projects" on projects for all using (is_admin()) with check (is_admin());
create policy "public reads published testimonials" on testimonials for select using (is_published or is_admin());
create policy "admin writes testimonials" on testimonials for all using (is_admin()) with check (is_admin());
