-- Keep inquiries, conversations, messages, and profiles behind RLS. Public
-- client messaging is mediated by public-api, which resolves each request by
-- the unguessable conversation token and uses the service role server-side.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'inquiries', 'conversations', 'messages')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.inquiries enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admin manages inquiries" on public.inquiries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manages conversations" on public.conversations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manages messages" on public.messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Serialize admin-side conversation creation per inquiry so two dashboard
-- sessions cannot race into creating duplicate threads.
create or replace function public.admin_get_or_create_conversation(p_inquiry_id uuid, p_subject text)
returns table (id uuid, access_token uuid)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_inquiry_id::text, 0));

  select c.id, c.access_token into id, access_token
  from public.conversations as c
  where c.inquiry_id = p_inquiry_id
  order by c.created_at, c.id
  limit 1;
  if found then return next; return; end if;

  insert into public.conversations as created (inquiry_id, subject)
  values (p_inquiry_id, p_subject)
  returning created.id, created.access_token into id, access_token;
  return next;
end;
$$;
revoke all on function public.admin_get_or_create_conversation(uuid, text) from public, anon;
grant execute on function public.admin_get_or_create_conversation(uuid, text) to authenticated;

-- Add an attachments-specific restrictive guard. It combines with existing
-- permissive policies, so other Storage buckets keep their current rules.

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

drop policy if exists "attachments admin only" on storage.objects;
create policy "attachments admin only" on storage.objects
  as restrictive for all to public
  using (bucket_id <> 'attachments' or public.is_admin())
  with check (bucket_id <> 'attachments' or public.is_admin());
