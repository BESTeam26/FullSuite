-- 0128 — the refusal, at the two points a seat is actually taken.
--
-- `invite_team_member` carried the comment "seats are counted by the interface
-- against the plan", which is the whole problem: a count in the interface is
-- presentation, not protection (rule 1). An organization could invite past its
-- allowance from a browser console, or simply from a screen that had not
-- refreshed.
--
-- Two points, because a seat can be committed at either:
--
--   invite   a pending invitation reserves a seat — twelve invitations into
--            ten seats is the failure this stops
--   accept   the allowance may have been reduced between the invitation and
--            the click, so the invitation is not a promise the plan has to keep
--
-- At ACCEPT the pending invitation being converted must not be double-counted:
-- it is already in `seats_committed`, and the membership does not exist yet, so
-- net it changes nothing. That is what `p_ignore_pending` is for.

create or replace function public.assert_seat_available(
  p_org uuid,
  p_for_user uuid default null,
  p_ignore_pending boolean default false
) returns void language plpgsql stable security definer set search_path = public as $$
declare u record; v_committed integer;
begin
  if p_org is null then return; end if;
  -- Somebody who would not consume a seat cannot be refused one.
  if p_for_user is not null and (
       exists (select 1 from public.agency_memberships am where am.user_id = p_for_user)
       or exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_for_user)
     ) then
    return;
  end if;
  select * into u from public.organization_seat_summary(p_org);
  if u.seats_included is null then return; end if;   -- nothing bought, nothing to exceed
  v_committed := case when p_ignore_pending then u.seats_used else u.seats_committed end;
  if v_committed >= u.seats_included then
    raise exception 'This organization has used all % of its seats. Archive a member or add seats to the plan.', u.seats_included
      using errcode = '22023';
  end if;
end $$;
revoke all on function public.assert_seat_available(uuid, uuid, boolean) from public, anon;
grant execute on function public.assert_seat_available(uuid, uuid, boolean) to authenticated;
drop function if exists public.assert_seat_available(uuid, uuid);

create or replace function public.invite_team_member(p_org uuid, p_email citext, p_role public.org_role, p_assigned_only boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_org_owner_admin(p_org) or public.is_manager_of(public.org_agency(p_org))) then raise exception 'Not permitted' using errcode = '42501'; end if;
  if exists (select 1 from public.invitations where organization_id = p_org and email = p_email and accepted_at is null and expires_at > now()) then
    raise exception 'An invitation for this email is already open' using errcode = '23505';
  end if;
  -- The plan decides, not the screen.
  perform public.assert_seat_available(p_org);
  insert into public.invitations (email, kind, organization_id, org_role, invited_by, agency_id)
  values (p_email, 'organization', p_org, p_role, auth.uid(), public.org_agency(p_org)) returning id into v_id;
  perform public.log_audit('organization.member_invited', 'invitation', v_id::text, p_org, null,
          jsonb_build_object('email', p_email, 'role', p_role, 'assigned_only', p_assigned_only));
  return v_id;
end $$;
revoke all on function public.invite_team_member(uuid, citext, public.org_role, boolean) from public, anon;
grant execute on function public.invite_team_member(uuid, citext, public.org_role, boolean) to authenticated;

create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.invitations%rowtype; v_email citext; v_id uuid;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then raise exception 'This invitation is not open' using errcode = '22023'; end if;
  if i.email <> v_email then raise exception 'This invitation was sent to a different email address' using errcode = '42501'; end if;
  if i.kind <> 'organization' then raise exception 'Only organization invitations are accepted here' using errcode = '22023'; end if;
  /* Ignoring pending: this invitation is one of them, and converting it does
     not raise the total. What this catches is the allowance shrinking after
     the invitation went out. */
  perform public.assert_seat_available(i.organization_id, auth.uid(), true);
  insert into public.org_memberships (user_id, organization_id, role, assigned_only)
  values (auth.uid(), i.organization_id, i.org_role, true)
  on conflict (user_id, organization_id) do update set role = excluded.role, archived_at = null
  returning id into v_id;
  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('organization.invitation_accepted', 'org_membership', v_id::text, i.organization_id, null,
          jsonb_build_object('role', i.org_role));
  return v_id;
end $$;
revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Archiving a member, which is how a seat is freed.
--
-- Not a delete: the person did the work they did, and every activity event,
-- production log and assignment still points at them (rule 4).
-- ---------------------------------------------------------------------------
create or replace function public.set_member_archived(p_membership uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.org_memberships%rowtype;
begin
  select * into m from public.org_memberships where id = p_membership;
  if m.id is null then raise exception 'membership not found' using errcode = 'P0002'; end if;
  if not (public.is_org_owner_admin(m.organization_id) or public.is_manager_of(public.org_agency(m.organization_id))) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations o where o.id = m.organization_id and o.owner_user_id = m.user_id) then
    raise exception 'The organization owner cannot be archived' using errcode = '22023';
  end if;
  -- Un-archiving takes a seat back, so it is checked like any other.
  if not p_archived and m.archived_at is not null then
    perform public.assert_seat_available(m.organization_id, m.user_id);
  end if;
  update public.org_memberships set archived_at = case when p_archived then now() end where id = p_membership;
  perform public.log_audit(
    case when p_archived then 'organization.member_archived' else 'organization.member_restored' end,
    'org_membership', p_membership::text, m.organization_id, to_jsonb(m),
    jsonb_build_object('archived', p_archived));
end $$;
revoke all on function public.set_member_archived(uuid, boolean) from public, anon;
grant execute on function public.set_member_archived(uuid, boolean) to authenticated;
