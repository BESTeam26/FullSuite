-- 0086 — Inviting BES team members
--
-- `invitations` has always had room for an agency invitation (`kind =
-- 'agency'` with an `agency_role`), but nothing could create one and
-- `accept_invitation()` refuses anything that is not an organization
-- invitation. So BES could invite a customer's staff and not its own.
--
-- This adds the two ends. `accept_invitation()` is left exactly as it is and a
-- sibling handles the agency kind — restating a working function to add a
-- branch is how the 0066 incident happened.

/**
 * Invite someone onto the BES team. Only an agency owner or admin may, and
 * only into their own agency; nobody can invite themselves upward, because the
 * role offered is checked against the inviter's own standing.
 */
create or replace function public.invite_agency_member(
  p_email text, p_role public.agency_role
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_email  citext := lower(trim(p_email))::citext;
  v_id     uuid;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin')
   limit 1;
  if v_agency is null then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  -- Only an owner may create another owner. An admin can staff the team, not
  -- hand over the agency.
  if p_role = 'agency_owner' and not exists (
    select 1 from public.agency_memberships where user_id = auth.uid() and role = 'agency_owner'
  ) then
    raise exception 'only an agency owner can invite another owner' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and p.email = v_email
  ) then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;

  -- One live invitation per address per agency: re-inviting refreshes it.
  update public.invitations
     set expires_at = now() + interval '7 days', agency_role = p_role, invited_by = auth.uid()
   where kind = 'agency' and agency_id = v_agency and email = v_email and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.invitations (email, kind, agency_id, agency_role, invited_by)
    values (v_email, 'agency', v_agency, p_role, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency_invitation.sent', 'invitation', v_id::text, null, null,
                           jsonb_build_object('email', v_email::text, 'role', p_role));
  return v_id;
end $$;
revoke all on function public.invite_agency_member(text, public.agency_role) from public, anon;
grant execute on function public.invite_agency_member(text, public.agency_role) to authenticated;

/**
 * Accept one. The signed-in person's own email must match the invitation, so a
 * forwarded link cannot be used by someone else.
 */
create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i       public.invitations;
  v_email citext;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'That invitation is no longer valid' using errcode = '22023';
  end if;
  if i.kind <> 'agency' then
    raise exception 'That is not a team invitation' using errcode = '22023';
  end if;
  if i.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.agency_memberships (user_id, agency_id, role)
  values (auth.uid(), i.agency_id, i.agency_role)
  on conflict (user_id, agency_id) do update set role = excluded.role;

  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('agency_invitation.accepted', 'invitation', i.id::text, null, null,
                           jsonb_build_object('role', i.agency_role));
  return i.agency_id;
end $$;
revoke all on function public.accept_agency_invitation(uuid) from public, anon;
grant execute on function public.accept_agency_invitation(uuid) to authenticated;

create or replace function public.cancel_agency_invitation(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.invitations;
begin
  select * into i from public.invitations where id = p_id and kind = 'agency';
  if i.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = i.agency_id and role in ('agency_owner', 'agency_admin')
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.invitations where id = p_id;
  perform public.log_audit('agency_invitation.cancelled', 'invitation', p_id::text, null, to_jsonb(i), null);
end $$;
revoke all on function public.cancel_agency_invitation(uuid) from public, anon;
grant execute on function public.cancel_agency_invitation(uuid) to authenticated;

-- Reading pending team invitations: BES staff only, their own agency's.
-- `invitations` already has RLS; this adds the agency branch without touching
-- the organization one.
create policy invitations_agency_select on public.invitations for select to authenticated
  using (kind = 'agency' and agency_id is not null and public.is_staff_of(agency_id));
