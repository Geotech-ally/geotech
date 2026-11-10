-- Conversation management: status changes, read receipts, and admin inbox metadata.
-- Client access remains mediated by service-role edge function using unguessable conversation tokens.

-- Helpful indexes for inbox/read workflows (admin-only queries through RLS/service role).
create index if not exists conversations_status_updated_idx
  on public.conversations (status, updated_at desc, id desc);
create index if not exists messages_unread_client_idx
  on public.messages (conversation_id, created_at desc)
  where sender_type = 'client' and read_at is null;

-- Admin-only: set conversation status (open/closed). History preserved.
create or replace function public.admin_set_conversation_status(
  p_conversation_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_inquiry_id uuid;
  v_token uuid;
  v_client_email text;
  v_old text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if p_status not in ('open', 'closed') then
    raise exception using errcode = '22023', message = 'Invalid conversation status.';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Conversation not found.';
  end if;
  v_old := v_conv.status;
  v_inquiry_id := v_conv.inquiry_id;
  v_token := v_conv.access_token;

  update public.conversations
  set status = p_status, updated_at = now()
  where id = p_conversation_id
  returning * into v_conv;

  select email into v_client_email from public.inquiries where id = v_inquiry_id;

  return jsonb_build_object(
    'conversation_id', v_conv.id,
    'inquiry_id', v_inquiry_id,
    'conversation_token', v_token,
    'client_email', v_client_email,
    'old_status', v_old,
    'new_status', v_conv.status,
    'status_changed', v_old is distinct from v_conv.status
  );
end;
$$;

revoke all on function public.admin_set_conversation_status(uuid, text) from public, anon;
grant execute on function public.admin_set_conversation_status(uuid, text) to authenticated;

-- Admin-only: mark client messages as read when an authorized admin views the conversation.
-- Only affects messages sent by client; never grants clients ability to mutate read receipts.
create or replace function public.admin_mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_type = 'client'
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_mark_conversation_read(uuid) from public, anon;
grant execute on function public.admin_mark_conversation_read(uuid) to authenticated;

-- Admin inbox summary: one row per conversation/inquiry with latest message and unread count.
-- Uses security definer but requires admin check; returns only data needed for admin UI.
create or replace function public.admin_list_conversations(
  p_status text default null,
  p_unread_only boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
) returns table (
  conversation_id uuid,
  inquiry_id uuid,
  access_token uuid,
  subject text,
  status text,
  updated_at timestamptz,
  created_at timestamptz,
  client_name text,
  client_email text,
  inquiry_status text,
  latest_message_at timestamptz,
  latest_message_preview text,
  latest_sender_type text,
  unread_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  return query
  with latest as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.created_at as latest_message_at,
      left(m.message, 160) as latest_message_preview,
      m.sender_type as latest_sender_type
    from public.messages m
    order by m.conversation_id, m.created_at desc, m.id desc
  ),
  unread as (
    select m.conversation_id, count(*)::bigint as unread_count
    from public.messages m
    where m.sender_type = 'client' and m.read_at is null
    group by m.conversation_id
  )
  select
    c.id as conversation_id,
    c.inquiry_id,
    c.access_token,
    c.subject,
    c.status,
    c.updated_at,
    c.created_at,
    i.name as client_name,
    i.email as client_email,
    i.status as inquiry_status,
    coalesce(l.latest_message_at, c.created_at) as latest_message_at,
    coalesce(l.latest_message_preview, '') as latest_message_preview,
    l.latest_sender_type,
    coalesce(u.unread_count, 0) as unread_count
  from public.conversations c
  join public.inquiries i on i.id = c.inquiry_id
  left join latest l on l.conversation_id = c.id
  left join unread u on u.conversation_id = c.id
  where (p_status is null or c.status = p_status)
    and (not p_unread_only or coalesce(u.unread_count, 0) > 0)
  order by coalesce(l.latest_message_at, c.updated_at, c.created_at) desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_list_conversations(text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_conversations(text, boolean, integer, integer) to authenticated;
