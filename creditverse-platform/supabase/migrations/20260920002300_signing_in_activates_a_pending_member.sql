-- Aaron signed in on 2026-09-20 and landed in an EMPTY app: his Team Member
-- record was still `invited`, so every operational read returned nothing.
--
-- He had an account from before he was invited, so he went to the sign-in
-- page rather than the activation link — and nothing in that path flips a
-- pending member to active. The person is inside the building with a badge
-- that does not open any door.
--
-- Signing in IS the proof the invitation link was there to obtain: you cannot
-- sign in without the password, and you cannot have the password without the
-- address. So a pending member who authenticates activates themselves, and
-- their open invitation is stamped accepted in the same breath.
--
-- It only ever acts on the CALLER's own record, and only from `invited` —
-- never on somebody deactivated, and never on anybody else.
create or replace function public.activate_my_membership()
returns text language plpgsql security definer set search_path = public as $function$
declare m public.agency_memberships%rowtype; i public.invitations%rowtype; v_email extensions.citext;
begin
  select * into m from public.agency_memberships where user_id = auth.uid() and status = 'invited' limit 1;
  if m.id is null then return 'no_pending_membership'; end if;

  update public.agency_memberships set status = 'active', deactivated_at = null, deactivated_by = null
   where id = m.id;

  select lower(email)::extensions.citext into v_email from auth.users where id = auth.uid();
  select * into i from public.invitations
   where kind = 'agency' and email = v_email and accepted_at is null and agency_id = m.agency_id
   order by created_at desc limit 1;
  if i.id is not null then
    /* Anything still staged on the invitation lands now, exactly as it would
       have through the link. */
    perform public.apply_invitation_onboarding(i.id, m.id, auth.uid(), m.agency_id);
    update public.invitations set accepted_at = now(), activated_at = coalesce(activated_at, now()) where id = i.id;
  end if;

  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  select m.agency_id, 'agency_member', m.user_id::text, auth.uid(), coalesce(p.full_name, p.email),
         'Membership activated on first sign-in', 'status', 'invited', 'active', 'bes_internal'
    from public.profiles p where p.id = auth.uid();
  return 'activated';
end $function$;
revoke all on function public.activate_my_membership() from public, anon;
grant execute on function public.activate_my_membership() to authenticated;
