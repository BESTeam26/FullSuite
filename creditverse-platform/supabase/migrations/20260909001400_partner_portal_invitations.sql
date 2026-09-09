-- =============================================================================
-- Partner portal invitations — the door the portal was missing.
--
-- 0145 gave invitations partner columns and 0247 built the rooms, but nothing
-- could actually invite a partner contact: no function created the invitation,
-- nothing accepted one, and the Contacts tab could only add rows nobody could
-- ever activate. Three functions close the loop, mirroring the agency invite
-- machinery:
--
--   invite_partner_contact(contact)  staff with partners.portal mint (or
--                                    re-issue) the one open invitation
--   accept_partner_invitation(token) the signed-in invitee binds their new
--                                    account to the contact row
--   cancel_partner_invitation(id)    revocation, since the generic cancel
--                                    policy requires an organization
--
-- The boundary stays partner_contacts + partner_group_of_user(): accepting
-- creates NO membership, NO organization, NO tenant — it sets user_id on the
-- contact row, and that is the entire grant.
-- =============================================================================

-- ── Invite ────────────────────────────────────────────────────────────────
create or replace function public.invite_partner_contact(p_contact uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c record;
  v_actor text;
  v_id uuid;
begin
  select ct.id, ct.group_id, ct.agency_id, ct.email, ct.full_name, ct.user_id, ct.status,
         g.lifecycle, g.name as partner_label
    into c
    from public.partner_contacts ct
    join public.outsourcing_groups g on g.id = ct.group_id
   where ct.id = p_contact;
  if not found then raise exception 'Contact not found'; end if;
  if not public.is_staff_of(c.agency_id) or not public.agency_can('partners.portal') then
    raise exception 'Inviting to the partner portal needs the portal permission'
      using errcode = '42501';
  end if;
  if c.lifecycle in ('suspended', 'archived') then
    raise exception 'This partner is %, so nobody at it can be invited', c.lifecycle;
  end if;
  if c.status <> 'active' then
    raise exception 'This contact is %. Restore them before inviting', c.status;
  end if;
  if c.user_id is not null then
    raise exception 'This contact has already activated the portal';
  end if;

  /* One open invitation per contact. Re-inviting extends the door rather
     than minting a second key. */
  select i.id into v_id
    from public.invitations i
   where i.partner_contact_id = c.id and i.accepted_at is null;
  if v_id is not null then
    update public.invitations set expires_at = now() + interval '7 days' where id = v_id;
  else
    insert into public.invitations
          (email, kind, agency_id, partner_group_id, partner_contact_id, invited_by)
    values (c.email, 'external', c.agency_id, c.group_id, c.id, auth.uid())
    returning id into v_id;
  end if;

  update public.partner_contacts set invited_at = now() where id = c.id;

  select coalesce(pr.full_name, pr.email) into v_actor
    from public.profiles pr where pr.id = auth.uid();
  insert into public.activity_events
        (agency_id, entity_type, entity_id, actor_id, actor_name,
         action, field, previous_value, new_value, visibility)
  values (c.agency_id, 'partner', c.group_id::text, auth.uid(), v_actor,
          'Portal invitation sent', 'contact: ' || c.full_name,
          null, 'invited', 'bes_internal');

  return v_id;
end;
$function$;

revoke execute on function public.invite_partner_contact(uuid) from public, anon;
grant execute on function public.invite_partner_contact(uuid) to authenticated;

-- ── Accept ────────────────────────────────────────────────────────────────
create or replace function public.accept_partner_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  i public.invitations%rowtype;
  v_email citext;
  v_lifecycle public.partner_lifecycle;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'This invitation is not open' using errcode = '22023';
  end if;
  if i.partner_contact_id is null then
    raise exception 'Only partner portal invitations are accepted here' using errcode = '22023';
  end if;
  if i.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  select g.lifecycle into v_lifecycle
    from public.partner_contacts ct join public.outsourcing_groups g on g.id = ct.group_id
   where ct.id = i.partner_contact_id;
  if v_lifecycle in ('suspended', 'archived') then
    raise exception 'This partner account is closed. Please speak to your BES contact'
      using errcode = '42501';
  end if;

  /* The whole grant: this row now belongs to this account. Refuse to steal a
     contact somebody else already activated. */
  update public.partner_contacts
     set user_id = auth.uid(), status = 'active', activated_at = coalesce(activated_at, now())
   where id = i.partner_contact_id
     and (user_id is null or user_id = auth.uid());
  if not found then
    raise exception 'This contact was already activated by a different account' using errcode = '42501';
  end if;

  update public.invitations set accepted_at = now() where id = i.id;
  return i.partner_contact_id;
end;
$function$;

revoke execute on function public.accept_partner_invitation(uuid) from public, anon;
grant execute on function public.accept_partner_invitation(uuid) to authenticated;

-- ── Cancel ────────────────────────────────────────────────────────────────
create or replace function public.cancel_partner_invitation(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare i record;
begin
  select inv.id, inv.agency_id, inv.partner_contact_id into i
    from public.invitations inv
   where inv.id = p_id and inv.partner_contact_id is not null and inv.accepted_at is null;
  if not found then raise exception 'No open partner invitation with that id'; end if;
  if not public.is_staff_of(i.agency_id) or not public.agency_can('partners.portal') then
    raise exception 'Cancelling a portal invitation needs the portal permission'
      using errcode = '42501';
  end if;
  delete from public.invitations where id = i.id;
  update public.partner_contacts set invited_at = null
   where id = i.partner_contact_id and user_id is null;
end;
$function$;

revoke execute on function public.cancel_partner_invitation(uuid) from public, anon;
grant execute on function public.cancel_partner_invitation(uuid) to authenticated;
