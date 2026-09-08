-- 0194 — Auditing the ADMINISTRATION of a conversation, and nothing else.
--
-- Dee, §36: audit channel created, renamed, archived, member added or removed,
-- team added or removed, share enabled or revoked. And explicitly NOT:
--
--   "Do not create noisy audit rows for every normal message read. Message
--    itself is already the record of the message."
--
-- So there is no trigger on `messages`. A message is its own audit row; a
-- second one saying a message happened would bury the eight events above,
-- which are the ones somebody actually goes looking for.
--
-- ---------------------------------------------------------------------------
-- THE MISTAKE THIS MIGRATION IS WRITTEN NOT TO REPEAT
--
-- 0174: `set_agency_permission` called `log_audit(..., p_allowed::text, jsonb)`
-- where the fifth parameter is `p_before jsonb`. Postgres raised 42883, the
-- whole transaction rolled back, and the permission toggle appeared to do
-- nothing for days. An audit call that does not compile takes the business
-- write down with it.
--
-- The signature, written here so the next person does not have to go and find
-- it:  log_audit(action text, entity_type text, entity_id text,
--                org uuid, before jsonb, after jsonb)
--
-- Every call below passes jsonb for both, and every one is exercised against
-- the live database before this migration is called done.
-- ---------------------------------------------------------------------------

create or replace function public.audit_channel_change()
returns trigger language plpgsql security invoker set search_path = public as $function$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit(
      'Channel created', 'channel', new.id::text, new.organization_id,
      null,
      jsonb_build_object('name', new.name, 'kind', new.kind,
                         'agencyId', new.agency_id, 'partnerGroupId', new.partner_group_id,
                         'openToScope', new.open_to_scope));
    return new;
  end if;

  if new.name is distinct from old.name then
    perform public.log_audit(
      'Channel renamed', 'channel', new.id::text, new.organization_id,
      jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  end if;

  if new.archived_at is distinct from old.archived_at then
    perform public.log_audit(
      case when new.archived_at is null then 'Channel restored' else 'Channel archived' end,
      'channel', new.id::text, new.organization_id,
      jsonb_build_object('archivedAt', old.archived_at),
      jsonb_build_object('archivedAt', new.archived_at));
  end if;

  /* Who a conversation is open to is an access change, not a cosmetic one. */
  if new.open_to_scope is distinct from old.open_to_scope then
    perform public.log_audit(
      'Channel audience changed', 'channel', new.id::text, new.organization_id,
      jsonb_build_object('openToScope', old.open_to_scope),
      jsonb_build_object('openToScope', new.open_to_scope));
  end if;

  return new;
end;
$function$;

drop trigger if exists channels_audit on public.channels;
create trigger channels_audit
  after insert or update on public.channels
  for each row execute function public.audit_channel_change();

create or replace function public.audit_channel_member_change()
returns trigger language plpgsql security invoker set search_path = public as $function$
declare
  v_row  record := coalesce(new, old);
  v_org  uuid;
begin
  select organization_id into v_org from public.channels where id = v_row.channel_id;
  if tg_op = 'DELETE' then
    perform public.log_audit('Channel member removed', 'channel', v_row.channel_id::text, v_org,
      jsonb_build_object('userId', v_row.user_id, 'isManager', v_row.is_manager), null);
    return old;
  end if;
  perform public.log_audit(
    case when tg_op = 'INSERT' then 'Channel member added' else 'Channel member changed' end,
    'channel', v_row.channel_id::text, v_org,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('userId', old.user_id, 'isManager', old.is_manager) end,
    jsonb_build_object('userId', new.user_id, 'isManager', new.is_manager));
  return new;
end;
$function$;

drop trigger if exists channel_members_audit on public.channel_members;
create trigger channel_members_audit
  after insert or update or delete on public.channel_members
  for each row execute function public.audit_channel_member_change();

create or replace function public.audit_channel_team_change()
returns trigger language plpgsql security invoker set search_path = public as $function$
declare
  v_row record := coalesce(new, old);
  v_org uuid;
begin
  select organization_id into v_org from public.channels where id = v_row.channel_id;
  perform public.log_audit(
    case when tg_op = 'DELETE' then 'Channel team removed' else 'Channel team added' end,
    'channel', v_row.channel_id::text, v_org,
    case when tg_op = 'DELETE' then jsonb_build_object('teamId', v_row.team_id) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('teamId', v_row.team_id) end);
  return v_row;
end;
$function$;

drop trigger if exists channel_teams_audit on public.channel_teams;
create trigger channel_teams_audit
  after insert or delete on public.channel_teams
  for each row execute function public.audit_channel_team_change();

/* Sharing with BES is the single most consequential thing that happens to an
   organization's channel: it is the moment somebody outside the tenant can
   read it. Both directions are recorded. */
create or replace function public.audit_channel_share_change()
returns trigger language plpgsql security invoker set search_path = public as $function$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.channels where id = new.channel_id;
  if tg_op = 'INSERT' then
    perform public.log_audit('Channel shared with BES', 'channel', new.channel_id::text, v_org,
      null, jsonb_build_object('shareId', new.id, 'engagementId', new.engagement_id));
  elsif new.revoked_at is distinct from old.revoked_at then
    perform public.log_audit(
      case when new.revoked_at is null then 'Channel share restored' else 'Channel share revoked' end,
      'channel', new.channel_id::text, v_org,
      jsonb_build_object('revokedAt', old.revoked_at),
      jsonb_build_object('revokedAt', new.revoked_at));
  end if;
  return new;
end;
$function$;

drop trigger if exists channel_shares_audit on public.channel_shares;
create trigger channel_shares_audit
  after insert or update on public.channel_shares
  for each row execute function public.audit_channel_share_change();
