-- 0103 — enrolling in DIY must never create a second person.
--
-- Found by the negative-access battery: a portal user who was ALREADY the
-- client of an organization enrolled in DIY and got a second `clients` row.
-- Two rows, one human — precisely what C1 and C2 forbid.
--
-- The cause: 0102 looked the person up by EMAIL only. The fixture's client
-- record carries the address the organization has for them
-- (juno@bes.test) while their sign-in is a different address
-- (client.portal@bes.test), so the lookup missed and the insert ran. That is
-- not an edge case — it is the normal shape of a person whose credit file was
-- opened by an agent using a work address and who later signs in with a
-- personal one.
--
-- The fix is an ordering, and the order matters:
--
--   1. THE PORTAL LINK. If this signed-in person is already the portal user of
--      a client of this organization, that IS their record. Nothing else can
--      be true: a portal link is an explicit statement that this login belongs
--      to that file.
--   2. THE EMAIL. Otherwise, a client of this organization with the same
--      address is the same person, which is the rule the unique index already
--      enforces everywhere else.
--   3. Only then, a new record.
--
-- Email second, never first, because an address can be stale and a portal link
-- cannot.

create or replace function public.diy_enroll(
  p_org uuid, p_first_name text, p_last_name text, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email citext;
  v_agency uuid;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_org is null then
    raise exception 'An organization is required' using errcode = '22023';
  end if;
  if not public.org_entitled(p_org, 'diyCredit') then
    raise exception 'This organization does not offer DIY Credit' using errcode = '42501';
  end if;
  if coalesce(trim(p_last_name), '') = '' then
    raise exception 'A surname is required' using errcode = '22023';
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  select agency_id into v_agency from public.organizations where id = p_org;

  -- 1. Already linked to a file here. This is them, whatever address it holds.
  select id into v_client from public.clients
   where partner_scope_id = p_org and portal_user_id = auth.uid()
   limit 1;

  -- 2. A file for this address, not yet claimed by a sign-in.
  if v_client is null then
    select id into v_client from public.clients
     where partner_scope_id = p_org and lower(email::text) = lower(v_email::text)
     limit 1;

    if v_client is not null then
      update public.clients set portal_user_id = auth.uid()
       where id = v_client and portal_user_id is null;
      /* Somebody else holds the login on that file. Refuse loudly rather than
         hand this person another human's credit report. */
      if not exists (select 1 from public.clients where id = v_client and portal_user_id = auth.uid()) then
        raise exception 'A client record for this email is already linked to a different sign-in' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 3. Genuinely new.
  if v_client is null then
    insert into public.clients
      (agency_id, organization_id, mode, first_name, last_name, email, phone,
       portal_user_id, status, provenance, created_by)
    values (v_agency, p_org, 'saas_pulled', nullif(trim(p_first_name), ''), trim(p_last_name),
            v_email, nullif(trim(p_phone), ''), auth.uid(), 'active', 'diy_self_serve', auth.uid())
    returning id into v_client;
  end if;

  insert into public.diy_journeys (client_id) values (v_client)
  on conflict (client_id) do nothing;

  perform public.log_audit('diy.enrolled', 'client', v_client::text, p_org, null,
                           jsonb_build_object('reused_existing', v_client is not null));
  return v_client;
end $$;
revoke all on function public.diy_enroll(uuid, text, text, text) from public, anon;
grant execute on function public.diy_enroll(uuid, text, text, text) to authenticated;
