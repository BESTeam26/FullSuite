-- =============================================================================
-- Creating a Partner establishes its Primary Contact, in one transaction.
--
-- Dee, 2026-09-12: "I should NOT have to: create Partner, save Partner, go to
-- Contacts, create the same person/contact again. That is unnecessary manual
-- work."
--
-- She is describing the cost of the split, but the evidence is worse than the
-- annoyance: 26 of 27 partners have ZERO contacts. Nobody did the second step,
-- which means no partner can be given portal access without somebody going
-- back and re-typing a person who was already named on the partner record.
--
-- ── PARTNER AND CONTACT ARE STILL DIFFERENT ENTITIES ────────────────────────
--
-- This creates a contact FOR the partner. It does not make the partner a
-- person, and it emphatically does not create an End Client — the consumer
-- fields (round, dispute status, CreditOps SLA) belong to `fulfillment_clients`
-- and are never touched here.
--
-- ── MATCHING IS BY EMAIL, EXACTLY, AND ONLY WITHIN THIS PARTNER ─────────────
--
-- An address already on THIS partner is reused and promoted to primary. The
-- same address on a DIFFERENT partner gets its own row: one person can be the
-- contact for two companies, and merging them because the string matched would
-- collapse two relationships into one. Names never match anything (rule 4).
--
-- ── WHY DEFINER ────────────────────────────────────────────────────────────
--
-- Both inserts must succeed together or neither should. The authorization the
-- policies would have applied is re-checked explicitly and identically:
-- `is_manager_of` + `partners.create` for the partner, which is strictly
-- stronger than the contact table's own insert rule, so nothing is reachable
-- here that was not reachable before.
-- =============================================================================

create or replace function public.create_partner_with_contact(
  p_agency uuid,
  p_partner jsonb,
  p_contact jsonb default '{}'::jsonb
) returns table (partner_id uuid, contact_id uuid, contact_reused boolean)
language plpgsql security definer set search_path = public as $function$
declare
  v_partner uuid := coalesce((p_partner->>'id')::uuid, gen_random_uuid());
  v_email text := nullif(btrim(coalesce(p_contact->>'email', p_partner->>'contact_email')), '');
  v_name  text := nullif(btrim(coalesce(p_contact->>'full_name', p_partner->>'primary_contact', p_partner->>'name')), '');
  v_phone text := nullif(btrim(coalesce(p_contact->>'phone', p_partner->>'phone')), '');
  v_contact uuid;
  v_reused boolean := false;
begin
  if not (public.is_manager_of(p_agency) and public.agency_can('partners.create')) then
    raise exception 'Creating partners requires the partners.create capability'
      using errcode = '42501';
  end if;

  insert into public.outsourcing_groups (
    id, agency_id, name, contact_email, partner_name, phone, address, notes,
    primary_contact, service, contract_ref, lifecycle, started_on, saas_plan,
    account_manager_id, team_id, source_list_ref
  ) values (
    v_partner, p_agency,
    btrim(p_partner->>'name'),
    v_email,
    nullif(btrim(coalesce(p_partner->>'partner_name', '')), ''),
    v_phone,
    nullif(btrim(coalesce(p_partner->>'address', '')), ''),
    nullif(btrim(coalesce(p_partner->>'notes', '')), ''),
    v_name,
    nullif(btrim(coalesce(p_partner->>'service', '')), ''),
    nullif(btrim(coalesce(p_partner->>'contract_ref', '')), ''),
    coalesce((p_partner->>'lifecycle')::public.partner_lifecycle, 'active'),
    coalesce((p_partner->>'started_on')::date, current_date),
    nullif(btrim(coalesce(p_partner->>'saas_plan', '')), ''),
    (p_partner->>'account_manager_id')::uuid,
    (p_partner->>'team_id')::uuid,
    nullif(btrim(coalesce(p_partner->>'source_list_ref', '')), '')
  );

  /* No email, no contact. A partner BES has only a company name for is a
     legitimate record; inventing a person for it would be worse than leaving
     Contacts empty, and the Portal toggle asks for one when it is needed. */
  if v_email is null then
    partner_id := v_partner; contact_id := null; contact_reused := false;
    return next; return;
  end if;

  select id into v_contact from public.partner_contacts
   where group_id = v_partner and lower(email) = lower(v_email);

  if v_contact is not null then
    v_reused := true;
    update public.partner_contacts
       set is_primary = true,
           full_name = coalesce(nullif(btrim(full_name), ''), v_name),
           updated_at = now()
     where id = v_contact;
  else
    insert into public.partner_contacts (agency_id, group_id, full_name, email, phone, is_primary, created_by)
    values (p_agency, v_partner, coalesce(v_name, v_email), v_email, v_phone, true, auth.uid())
    returning id into v_contact;
  end if;

  /* One primary per partner. A second would make "the primary contact" a
     question with two answers. */
  update public.partner_contacts set is_primary = false
   where group_id = v_partner and id <> v_contact and is_primary;

  partner_id := v_partner; contact_id := v_contact; contact_reused := v_reused;
  return next;
end $function$;

comment on function public.create_partner_with_contact(uuid, jsonb, jsonb) is
  'Create a Partner and establish its Primary Contact atomically. Reuses an existing contact on the SAME partner matched on email exactly; never merges across partners, never matches on a name, and never creates an End Client (Dee, 2026-09-12).';

revoke execute on function public.create_partner_with_contact(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_partner_with_contact(uuid, jsonb, jsonb) to authenticated;

-- ── Backfilling the partners that never got one ─────────────────────────────
/**
 * Every existing partner with a contact email and no contact row gets one,
 * from the details already on the partner record. Nothing is invented: the
 * name is whatever `primary_contact` or the partner name already said, and a
 * partner with no email is left alone.
 */
create or replace function public.backfill_primary_partner_contacts()
returns table (created int, skipped_no_email int)
language plpgsql security definer set search_path = public as $function$
declare g record;
begin
  if not public.agency_can('partners.edit') then
    raise exception 'Editing partners is required' using errcode = '42501';
  end if;
  created := 0; skipped_no_email := 0;
  for g in
    select id, agency_id, name, primary_contact, contact_email, phone
      from public.outsourcing_groups
     where is_fixture = false and archived_at is null
       and not exists (select 1 from public.partner_contacts c where c.group_id = outsourcing_groups.id)
  loop
    if nullif(btrim(coalesce(g.contact_email, '')), '') is null then
      skipped_no_email := skipped_no_email + 1;
      continue;
    end if;
    insert into public.partner_contacts (agency_id, group_id, full_name, email, phone, is_primary, created_by)
    values (g.agency_id, g.id,
            coalesce(nullif(btrim(coalesce(g.primary_contact, '')), ''), g.name),
            btrim(g.contact_email), nullif(btrim(coalesce(g.phone, '')), ''), true, auth.uid());
    created := created + 1;
  end loop;
  return next;
end $function$;

revoke execute on function public.backfill_primary_partner_contacts() from public, anon;
grant execute on function public.backfill_primary_partner_contacts() to authenticated;
