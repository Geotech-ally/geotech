alter table conversations add column access_token uuid not null default gen_random_uuid() unique;
alter table messages rename column attachment_url to attachment_path; -- storage path inside the private 'attachments' bucket
-- Public writes now go through the rate-limited edge function (service role), not direct inserts.
drop policy "public submits inquiry" on inquiries;
create table blog_posts (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, body text not null default '',
  is_published boolean not null default false, published_at timestamptz, created_at timestamptz not null default now());
alter table blog_posts enable row level security;
create policy "public reads published posts" on blog_posts for select using (is_published or is_admin());
create policy "admin writes posts" on blog_posts for all using (is_admin()) with check (is_admin());
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('attachments','attachments',false,5242880,
  array['application/pdf','image/png','image/jpeg','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy "admin files" on storage.objects for all using (bucket_id='attachments' and is_admin()) with check (bucket_id='attachments' and is_admin());
