-- Reconcile installations that may have applied only part of the conversation
-- migrations. This migration is forward-only and preserves inquiry/message rows.
create extension if not exists pgcrypto;

alter table public.conversations
  add column if not exists access_token uuid;

-- Backfill old rows before enforcing the private-link token invariant.
update public.conversations
set access_token = gen_random_uuid()
where access_token is null;

alter table public.conversations
  alter column access_token set default gen_random_uuid(),
  alter column access_token set not null;

create unique index if not exists conversations_access_token_key
  on public.conversations (access_token);

-- Keep the application on one representation: a private Storage object path.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_path'
  ) then
    alter table public.messages rename column attachment_url to attachment_path;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_url'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_path'
  ) then
    update public.messages
    set attachment_path = coalesce(attachment_path, attachment_url)
    where attachment_path is null and attachment_url is not null
      and attachment_url !~* '^https?://';
    -- Keep the legacy column when both exist: it may contain externally hosted
    -- URLs that cannot safely be converted to private Storage object paths.
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'attachment_path'
  ) then
    alter table public.messages add column attachment_path text;
  end if;
end $$;

create index if not exists conversations_inquiry_id_idx
  on public.conversations (inquiry_id);
create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

-- The object bucket remains private. Admin access is through authenticated RLS;
-- client access is mediated by signed URLs from the service-role Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880,
  array['application/pdf','image/png','image/jpeg','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin files" on storage.objects;
create policy "admin files" on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and public.is_admin())
  with check (bucket_id = 'attachments' and public.is_admin());
