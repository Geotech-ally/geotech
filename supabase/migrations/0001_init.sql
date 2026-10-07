create extension if not exists pgcrypto;
create table profiles (id uuid primary key references auth.users on delete cascade, role text not null default 'client' check (role in ('client','admin')));
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create table services (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  short_description text not null, description text not null default '', category text not null default 'development', icon text,
  starting_price numeric(12,2) check (starting_price >= 0),
  pricing_type text not null default 'starting_from' check (pricing_type in ('starting_from','fixed','hourly','custom_quote')),
  currency text not null default 'KES', estimated_duration text, features jsonb not null default '[]',
  is_featured boolean not null default false, is_active boolean not null default true, display_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on services (is_active, display_order);

create table inquiries (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'), phone text, whatsapp text, company_name text,
  service_id uuid references services on delete set null, project_description text not null check (char_length(project_description) between 20 and 5000),
  requirements text, budget_range text, timeline text, referral_source text, additional_notes text,
  status text not null default 'new' check (status in ('new','reviewing','contacted','proposal_sent','negotiating','approved','rejected','completed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')), admin_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on inquiries (status, created_at desc);

create table conversations (id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references inquiries on delete cascade,
  subject text not null, status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references conversations on delete cascade,
  sender_type text not null check (sender_type in ('client','admin')), message text not null check (char_length(message) between 1 and 5000),
  attachment_url text, read_at timestamptz, created_at timestamptz not null default now());
create index on messages (conversation_id, created_at);

alter table profiles enable row level security; alter table services enable row level security; alter table inquiries enable row level security;
alter table conversations enable row level security; alter table messages enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "public reads active services" on services for select using (is_active or is_admin());
create policy "admin writes services" on services for all using (is_admin()) with check (is_admin());
-- Public may INSERT inquiries (status/priority/notes locked to defaults) but never SELECT them.
create policy "public submits inquiry" on inquiries for insert to anon, authenticated
  with check (status = 'new' and priority = 'normal' and admin_notes is null);
create policy "admin manages inquiries" on inquiries for all using (is_admin()) with check (is_admin());
create policy "admin manages conversations" on conversations for all using (is_admin()) with check (is_admin());
create policy "admin manages messages" on messages for all using (is_admin()) with check (is_admin());

insert into services (name, slug, short_description, description, starting_price, pricing_type, estimated_duration, features, is_featured, display_order) values
('Website Development','website-development','Fast, secure business websites.','A responsive, SEO-ready website built to convert visitors into customers.',35000,'starting_from','2–4 weeks','["Responsive design","SEO setup","Contact forms","Hosting setup"]',true,1),
('Web Application Development','web-application-development','Custom web apps with accounts, dashboards and APIs.','Full-stack applications designed around your workflow.',150000,'starting_from','6–12 weeks','["User accounts","Admin dashboard","API integration","Automated tests"]',true,2),
('Security Audit','security-audit','Find vulnerabilities before attackers do.','A scoped review of your application or infrastructure with a prioritised fix list.',null,'custom_quote','1–3 weeks','["Vulnerability assessment","Written report","Fix guidance","Retest"]',true,3);
