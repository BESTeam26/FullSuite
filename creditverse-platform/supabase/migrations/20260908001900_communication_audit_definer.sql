-- 0196 — The channel audit triggers must be SECURITY DEFINER.
--
-- ---------------------------------------------------------------------------
-- THE BUG, WHICH IS 0174'S BUG WEARING A DIFFERENT HAT
--
-- 0194 declared four audit trigger functions `security invoker`. `log_audit`
-- is granted to `postgres` and `service_role` and to nobody else — writing an
-- audit row is deliberately not something an ordinary user's own privileges
-- allow. So the trigger fired as `authenticated`, hit
--
--     42501: permission denied for function log_audit
--
-- and took the whole INSERT down with it. Every channel any real person tried
-- to create, every member they added, every team, every share: refused. The
-- error surfaced as "new row violates row-level security policy", which sends
-- you looking at the policy, which is fine.
--
-- 0174 was exactly this shape: an audit call that cannot run takes the
-- business write with it. That is why the note in 0194 exists — and the note
-- did not save me, because I checked the argument TYPES and not the EXECUTE
-- privilege.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS THE RIGHT FIX AND NOT A GRANT
--
-- All 53 other callers of `log_audit` in this database are SECURITY DEFINER.
-- Not one is invoker. Granting EXECUTE to `authenticated` instead would let
-- any signed-in caller write arbitrary rows into the audit log — which is the
-- one table whose whole value is that it cannot be written casually.
--
-- Attribution is unaffected: `log_audit` stamps `auth.uid()` itself, from the
-- request's own claims, and a definer function does not change who that is.
--
-- ---------------------------------------------------------------------------
-- AND WHY THE 0194 VERIFICATION MISSED IT
--
-- The probe exercised all eight audit paths against the live database and all
-- eight passed — as the SUPERUSER connection, which holds EXECUTE. A write
-- test that does not `set local role authenticated` is not a test of what a
-- user can do. Phase 60 now performs these writes as real fixture users.
-- ---------------------------------------------------------------------------

create or replace function public.audit_channel_change()
returns trigger language plpgsql security definer set search_path = public as $function$
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

  if new.open_to_scope is distinct from old.open_to_scope then
    perform public.log_audit(
      'Channel audience changed', 'channel', new.id::text, new.organization_id,
      jsonb_build_object('openToScope', old.open_to_scope),
      jsonb_build_object('openToScope', new.open_to_scope));
  end if;

  return new;
end;
$function$;

create or replace function public.audit_channel_member_change()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_row record := coalesce(new, old);
  v_org uuid;
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

create or replace function public.audit_channel_team_change()
returns trigger language plpgsql security definer set search_path = public as $function$
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

create or replace function public.audit_channel_share_change()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_org uuid;
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

comment on function public.audit_channel_change() is
  'SECURITY DEFINER because log_audit is granted to postgres and service_role only. An invoker trigger here fails with 42501 and takes the business write with it — see 0196''s header, and 0174 before it.';
