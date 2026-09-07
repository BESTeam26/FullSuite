-- 0155 — joining by invitation gives you the scope your role implies.
--
-- `accept_agency_invitation` inserted (user_id, agency_id, role) and left
-- `scope` to its column default of 'assigned'. Since an invitation is the only
-- way a real person joins BES, every real member had agent-level data scope
-- whatever they were invited as — which is why an Agency Admin saw an empty
-- screen while the seeded fixture admin saw everything.
--
-- The role check itself was never wrong, and is unchanged: the same email, the
-- same expiry, the same "not a team invitation" refusal. All that is added is
-- a scope that agrees with the role, on both the insert and the update — the
-- update matters because re-inviting somebody at a new role previously changed
-- their role and left the old scope behind.
create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
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

  insert into public.agency_memberships (user_id, agency_id, role, scope)
  values (auth.uid(), i.agency_id, i.agency_role, public.default_scope_for_role(i.agency_role))
  on conflict (user_id, agency_id) do update
    set role  = excluded.role,
        /* Re-inviting somebody at a different role used to change the role and
           leave the old scope, which is how the two columns drift apart. */
        scope = excluded.scope;

  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('agency_invitation.accepted', 'invitation', i.id::text, null, null,
                           jsonb_build_object('role', i.agency_role));
  return i.agency_id;
end $function$;
revoke execute on function public.accept_agency_invitation(uuid) from public, anon;
grant execute on function public.accept_agency_invitation(uuid) to authenticated;

-- ── The people already invited are still broken. Correct them. ───────────
--
-- Only where the role says agency-wide and the scope says otherwise. Nobody is
-- widened who was deliberately narrowed: a manager, lead or agent is left
-- exactly as an administrator set them.
update public.agency_memberships
   set scope = 'agency'
 where role in ('agency_owner', 'agency_admin')
   and scope is distinct from 'agency';

comment on function public.accept_agency_invitation(uuid) is
  'Accepts a BES team invitation. Sets the membership scope from the invited role, so the two columns cannot start out disagreeing.';
