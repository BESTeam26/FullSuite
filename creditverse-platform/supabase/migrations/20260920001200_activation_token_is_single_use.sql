-- The invitation link is now the proof of address, so it is a credential
-- (Dee, 2026-09-20). Four properties, each enforced here rather than assumed:
--
--   single use    activated_at is stamped the first time a link creates or
--                 confirms an account; a second attempt is refused.
--   expires       unchanged — 7 days, checked on every use.
--   no replay     once accepted_at is set the link does nothing at all.
--   superseded    re-inviting the same address issues a NEW token, so the
--                 link in the older email dies. Revoking deletes the row.
--
-- And the narrower rule behind them: a link may set a password only for
-- somebody who is not yet a team member. An established member who forgot
-- their password uses password reset, never an invitation link they were
-- forwarded — checked in activate_invitation_claim below.

alter table public.invitations add column if not exists activated_at timestamptz;

CREATE OR REPLACE FUNCTION public.invite_agency_member(p_email text, p_role agency_role, p_profile access_profile DEFAULT NULL::access_profile, p_lead_team uuid DEFAULT NULL::uuid, p_modules text[] DEFAULT '{}'::text[], p_team uuid DEFAULT NULL::uuid, p_full_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency  uuid;
  v_email   extensions.citext := lower(trim(p_email))::extensions.citext;
  v_id      uuid;
  v_profile public.access_profile;
  v_lead    uuid;
  v_team    uuid := p_team;
  v_modules text[] := coalesce(p_modules, '{}');
  v_bad     text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active'
   limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;

  /* Restored from 0909 (dropped by the 0912 rewrite; caught by phase 37):
     somebody already on the team is not invited again. */
  if exists (select 1 from public.agency_memberships m join public.profiles p on p.id = m.user_id
              where m.agency_id = v_agency and m.status = 'active' and lower(p.email) = lower(trim(p_email))) then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'Invite people as Agency Admin or Agency User. Ownership is transferred from the owner''s own account, never by invitation.' using errcode = '22023';
  end if;

  if p_role = 'agency_admin' then
    v_profile := null; v_lead := null; v_modules := '{}';
  else
    v_profile := coalesce(p_profile, 'custom');
    v_lead := p_lead_team;
  end if;

  /* Leading a team means being on it. Saying so here rather than relying on
     the caller to pass both is one less way to invite a lead with no team. */
  /* Restored (phase 37): a Team Lead invitation names the team it leads,
     and a led team belongs only on a Team Lead invitation. */
  if p_role = 'agency_user' and v_profile = 'team_lead' and v_lead is null then
    raise exception 'A Team Lead invitation must name the team they will lead' using errcode = '22023';
  end if;
  if p_role = 'agency_user' and v_lead is not null and v_profile <> 'team_lead' then
    raise exception 'Only a Team Lead invitation may carry a led team' using errcode = '22023';
  end if;
  if v_lead is not null then v_team := coalesce(v_team, v_lead); end if;

  if v_team is not null and not exists (
    select 1 from public.teams t where t.id = v_team and t.agency_id = v_agency and t.archived_at is null
  ) then
    raise exception 'That team does not belong to this agency' using errcode = '22023';
  end if;

  select string_agg(k, ', ') into v_bad
    from unnest(v_modules) as k
   where not exists (select 1 from public.permission_keys pk where pk.key = k);
  if v_bad is not null then
    raise exception 'Unknown capability: %', v_bad using errcode = '22023';
  end if;

  /* An open invitation is reused rather than duplicated: inviting the same
     person twice is a person clicking twice, not two employees. */
  select id into v_id from public.invitations
   where agency_id = v_agency and email = v_email and kind = 'agency'
     and accepted_at is null and expires_at > now();

  if v_id is not null then
    update public.invitations
       set agency_role = p_role, access_profile = v_profile, lead_team_id = v_lead,
           team_id = v_team, module_keys = v_modules, invited_by = auth.uid(),
           full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
           /* Superseding an open invitation RETIRES its link (Dee, 2026-09-20:
              "invalidated if the invitation is revoked or superseded"). The
              old email's button stops working the moment a new one is issued. */
           token = gen_random_uuid(), activated_at = null, expires_at = now() + interval '7 days'
     where id = v_id;
  else
    insert into public.invitations
      (email, kind, agency_id, agency_role, access_profile, lead_team_id, team_id, module_keys, invited_by, full_name)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, v_team, v_modules, auth.uid(), nullif(trim(p_full_name), ''))
    returning id into v_id;
  end if;

  perform public.log_audit('agency.member_invited', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'profile', v_profile,
                       'team', v_team, 'lead_team', v_lead, 'modules', v_modules,
                       'full_name', p_full_name));
  return v_id;
end $function$
;

/**
 * The one decision the activation function is allowed to make, made in the
 * database where it can be audited and cannot be raced: may THIS token
 * activate an account for this email, and by which path?
 *
 * Returns: outcome ('create' | 'confirm' | refusal code), the invitation id,
 * the canonical email and the name it carries. Service role only — the Edge
 * Function holds it; no browser can call it.
 */
create or replace function public.activate_invitation_claim(p_token uuid, p_email text)
returns table(outcome text, invitation_id uuid, email text, full_name text, existing_user uuid)
language plpgsql security definer set search_path = public as $function$
declare i public.invitations%rowtype; v_user uuid; v_member boolean;
begin
  select * into i from public.invitations where token = p_token and kind = 'agency';
  if i.id is null then return query select 'invalid', null::uuid, null::text, null::text, null::uuid; return; end if;
  if i.accepted_at is not null then return query select 'already_accepted', i.id, i.email::text, i.full_name, null::uuid; return; end if;
  if i.expires_at <= now() then return query select 'expired', i.id, i.email::text, i.full_name, null::uuid; return; end if;
  if lower(trim(p_email)) <> lower(i.email::text) then return query select 'wrong_email', i.id, null::text, null::text, null::uuid; return; end if;
  if i.activated_at is not null then return query select 'already_activated', i.id, i.email::text, i.full_name, null::uuid; return; end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(i.email::text) limit 1;
  if v_user is not null then
    select exists (select 1 from public.agency_memberships m where m.user_id = v_user and m.status = 'active') into v_member;
    /* Already working here: a forwarded link must never re-password them. */
    if v_member then return query select 'sign_in_instead', i.id, i.email::text, i.full_name, v_user; return; end if;
    return query select 'confirm', i.id, i.email::text, i.full_name, v_user; return;
  end if;
  return query select 'create', i.id, i.email::text, i.full_name, null::uuid;
end $function$;
revoke all on function public.activate_invitation_claim(uuid, text) from public, anon, authenticated;

/** Stamp the link as used, and say so on the trail. Service role only. */
create or replace function public.activate_invitation_stamp(p_invitation uuid, p_outcome text) returns void
language plpgsql security definer set search_path = public as $function$
declare i public.invitations%rowtype;
begin
  update public.invitations set activated_at = now() where id = p_invitation and activated_at is null returning * into i;
  if i.id is null then return; end if;
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  values (i.agency_id, 'invitation', i.id::text, null, i.email::text, 'Invitation link used to activate an account', 'activated_at', null, p_outcome, 'bes_internal');
end $function$;
revoke all on function public.activate_invitation_stamp(uuid, text) from public, anon, authenticated;

drop function if exists public.auth_user_id_for_email(text);
