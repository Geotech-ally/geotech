-- Transactional notification delivery tracking and admin action logging.
-- Notifications must never be proof of stored inquiries/messages and must never discard successful writes.

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('inquiry_admin', 'inquiry_client_ack', 'client_message_admin', 'admin_reply_client', 'inquiry_status_client', 'conversation_status_client')),
  event_key text not null,
  recipient text not null,
  recipient_role text not null default 'system' check (recipient_role in ('admin', 'client', 'system')),
  subject text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz
);

create unique index if not exists notification_deliveries_event_key_recipient_key
  on public.notification_deliveries (event_key, recipient);
create unique index if not exists notification_deliveries_idempotency_key_key
  on public.notification_deliveries (idempotency_key);
create index if not exists notification_deliveries_status_next_attempt_idx
  on public.notification_deliveries (status, next_attempt_at);
create index if not exists notification_deliveries_event_type_created_idx
  on public.notification_deliveries (event_type, created_at desc);

alter table public.notification_deliveries enable row level security;

-- Internal service-role only table. Admins do not need direct browser access; edge functions use service role.
revoke all on table public.notification_deliveries from anon, authenticated;

-- Capture inquiry status transitions for optional client notifications. (Authenticated/admin only via existing RLS on inquiries.)
create table if not exists public.inquiry_status_audit (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists inquiry_status_audit_inquiry_changed_idx
  on public.inquiry_status_audit (inquiry_id, changed_at desc);

alter table public.inquiry_status_audit enable row level security;
revoke all on table public.inquiry_status_audit from anon;

-- Preserve existing admin policy behavior from 0006 (admins manage inquiries) by adding admin-only read on audit.
drop policy if exists "admin reads inquiry status audit" on public.inquiry_status_audit;
create policy "admin reads inquiry status audit" on public.inquiry_status_audit
  for select to authenticated using (public.is_admin());

create or replace function public.log_inquiry_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.inquiry_status_audit (inquiry_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_inquiry_status_change on public.inquiries;
create trigger trg_log_inquiry_status_change
after update of status on public.inquiries
for each row execute function public.log_inquiry_status_change();

-- Replace admin inquiry update to support validated status-change notifications out-of-band.
-- Only allowed admin updates are permitted; email/inquiry identity is never exposed to arbitrary clients.
create or replace function public.admin_update_inquiry(
  p_inquiry_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.inquiries%rowtype;
  v_new public.inquiries%rowtype;
  v_status text;
  v_priority text;
  v_notes text;
  v_notify boolean;
  v_conversation_id uuid;
  v_access_token uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid update payload.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('status', 'priority', 'admin_notes', 'notify_client')) then
    raise exception using errcode = '22023', message = 'Unsupported update fields.';
  end if;

  select * into v_old from public.inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Inquiry not found.';
  end if;

  v_status := coalesce(p_patch->>'status', v_old.status);
  v_priority := coalesce(p_patch->>'priority', v_old.priority);
  v_notes := case when p_patch ? 'admin_notes' then p_patch->>'admin_notes' else v_old.admin_notes end;
  v_notify := case when lower(coalesce(p_patch->>'notify_client', 'false')) = 'true' then true else false end;

  if v_status not in ('new','reviewing','contacted','proposal_sent','negotiating','approved','rejected','completed') then
    raise exception using errcode = '22023', message = 'Invalid status.';
  end if;
  if v_priority not in ('low','normal','high') then
    raise exception using errcode = '22023', message = 'Invalid priority.';
  end if;

  update public.inquiries
  set status = v_status,
      priority = v_priority,
      admin_notes = v_notes,
      updated_at = now()
  where id = p_inquiry_id
  returning * into v_new;

  select c.id, c.access_token into v_conversation_id, v_access_token
  from public.conversations c
  where c.inquiry_id = p_inquiry_id
  order by c.created_at, c.id
  limit 1;

  return jsonb_build_object(
    'id', v_new.id,
    'old_status', v_old.status,
    'new_status', v_new.status,
    'status_changed', v_old.status is distinct from v_new.status,
    'notify_client', v_notify,
    'conversation_id', v_conversation_id,
    'conversation_token', v_access_token,
    'client_email', case when v_notify and v_old.status is distinct from v_new.status then v_new.email else null end,
    'client_name', case when v_notify and v_old.status is distinct from v_new.status then v_new.name else null end
  );
end;
$$;

revoke all on function public.admin_update_inquiry(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_inquiry(uuid, jsonb) to authenticated;
