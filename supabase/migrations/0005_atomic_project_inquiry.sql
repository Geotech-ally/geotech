-- Create the inquiry, its private conversation, and its first message as one
-- PostgreSQL transaction. Any failed insert aborts the function statement.
create or replace function public.submit_project_inquiry(
  p_name text,
  p_email text,
  p_phone text,
  p_whatsapp text,
  p_company_name text,
  p_service_id uuid,
  p_project_description text,
  p_budget_range text,
  p_timeline text,
  p_referral_source text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inquiry_id uuid;
  v_conversation_id uuid;
  v_access_token uuid;
begin
  insert into public.inquiries (
    name, email, phone, whatsapp, company_name, service_id,
    project_description, budget_range, timeline, referral_source
  ) values (
    p_name, p_email, p_phone, p_whatsapp, p_company_name, p_service_id,
    p_project_description, p_budget_range, p_timeline, p_referral_source
  ) returning id into v_inquiry_id;

  insert into public.conversations (inquiry_id, subject)
  values (v_inquiry_id, 'Project inquiry from ' || p_name)
  returning id, access_token into v_conversation_id, v_access_token;

  insert into public.messages (conversation_id, sender_type, message)
  values (v_conversation_id, 'client', p_project_description);

  return v_access_token;
end;
$$;

revoke all on function public.submit_project_inquiry(text, text, text, text, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_project_inquiry(text, text, text, text, text, uuid, text, text, text, text)
  to service_role;
