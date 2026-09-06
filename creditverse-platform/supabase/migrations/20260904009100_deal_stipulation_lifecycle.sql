-- 0113 — The stipulation lifecycle, as a machine.
--
-- 0112 widened the enum; Postgres will not let a new enum value be USED in the
-- transaction that added it, so the functions live here.
--
-- Two writers, both SECURITY INVOKER. That is not incidental: the first thing
-- each does is SELECT the request, and under INVOKER that select is filtered
-- by `document_requests_select`. A caller who cannot see the row gets no row
-- and is refused. Written as DEFINER these would read every organization's
-- stipulations and decide access themselves — which is exactly the regression
-- that reached the live database once already in this build.
--
-- The lifecycle Dee specified, with `open` as Requested:
--
--   open ─→ assigned ─→ waiting_on_client ─→ received ─→ under_review
--                                                          │
--                                        submitted_to_lender ─→ satisfied
--
-- Every state may be waived. Backward steps are allowed where real work goes
-- backwards — a document under review that turns out to be the wrong month
-- returns to waiting_on_client; a lender that rejects what was sent returns
-- the stipulation to under_review. What is NOT allowed is skipping to
-- satisfied: a stipulation is satisfied when the lender has it and accepted
-- it, and nothing else may assert that.

create or replace function public.document_request_transition_allowed(
  p_from public.document_request_status,
  p_to   public.document_request_status
) returns boolean language sql immutable set search_path = public as $$
  select case
    when p_from = p_to then false
    when p_to = 'waived' then p_from <> 'satisfied'
    when p_from = 'waived' then p_to = 'open'
    when p_from = 'open' then p_to in ('assigned', 'waiting_on_client', 'received')
    when p_from = 'assigned' then p_to in ('open', 'waiting_on_client', 'received')
    when p_from = 'waiting_on_client' then p_to in ('assigned', 'received')
    when p_from = 'received' then p_to in ('under_review', 'waiting_on_client')
    when p_from = 'under_review' then p_to in ('waiting_on_client', 'submitted_to_lender')
    when p_from = 'submitted_to_lender' then p_to in ('under_review', 'satisfied')
    -- Satisfied reopens only through the document path: superseding the
    -- instance that satisfied it already sets the row back to `open`.
    when p_from = 'satisfied' then false
    else false
  end
$$;
revoke all on function public.document_request_transition_allowed(public.document_request_status, public.document_request_status) from public, anon;
grant execute on function public.document_request_transition_allowed(public.document_request_status, public.document_request_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Move one requirement or stipulation along its lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.move_document_request(
  p_request uuid,
  p_status  public.document_request_status,
  p_note    text default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  r public.document_requests%rowtype;
  t record;
  v_vis public.activity_visibility;
  v_client uuid;
begin
  select * into r from public.document_requests where id = p_request;
  if r.id is null then
    raise exception 'Requirement not visible' using errcode = '42501';
  end if;
  if not public.file_reviewer(r.file_id) then
    raise exception 'Not permitted to move this requirement' using errcode = '42501';
  end if;
  if r.status = p_status then return; end if;
  if not public.document_request_transition_allowed(r.status, p_status) then
    raise exception 'A requirement cannot go from % to %', r.status, p_status using errcode = '22023';
  end if;
  -- Waiving is a decision that has to say why (rule 11).
  if p_status = 'waived' and coalesce(trim(p_note), '') = '' then
    raise exception 'Waiving a requirement needs a reason' using errcode = '22023';
  end if;

  select * into t from public.funding_file_tenancy(r.file_id);
  v_vis := case when public.is_staff_of(t.agency_id) and t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                when public.is_staff_of(t.agency_id) then 'bes_internal'
                when t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                else 'organization_internal' end::public.activity_visibility;

  update public.document_requests
     set status        = p_status,
         waived_by     = case when p_status = 'waived' then auth.uid() else waived_by end,
         waived_reason = case when p_status = 'waived' then p_note else waived_reason end,
         waived_at     = case when p_status = 'waived' then now() else waived_at end
   where id = p_request;

  update public.funding_files set last_activity_at = now() where id = r.file_id;
  select client_id into v_client from public.funding_files where id = r.file_id;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, previous_value, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_file', r.file_id::text, auth.uid(),
          case when r.deal_id is null then 'Requirement moved' else 'Stipulation moved' end,
          coalesce(p_note, r.document_type || ' · ' || r.status::text || ' → ' || p_status::text),
          'document_request:' || p_request::text, r.status::text, p_status::text, v_vis);
end $$;
revoke execute on function public.move_document_request(uuid, public.document_request_status, text) from public, anon;
grant execute on function public.move_document_request(uuid, public.document_request_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Record what a lender asked for, against the deal that asked.
--
-- Deliberately separate from the requirement resolver: a resolved requirement
-- comes from a versioned rule and carries `rule_id`/`rule_version`; a
-- stipulation comes from a person at a lender and carries what they said. The
-- two must never be confused, so this writer refuses to set rule provenance
-- and the resolver never sets `deal_id`.
-- ---------------------------------------------------------------------------
create or replace function public.add_deal_stipulation(
  p_deal          uuid,
  p_document_type text,
  p_lender_note   text default null,
  p_party         uuid default null,
  p_period        text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  d public.funding_deals%rowtype;
  t record;
  v_vis public.activity_visibility;
  v_id uuid;
begin
  select * into d from public.funding_deals where id = p_deal;
  if d.id is null then
    raise exception 'Deal not visible' using errcode = '42501';
  end if;
  if not public.file_reviewer(d.file_id) then
    raise exception 'Not permitted to add a stipulation to this deal' using errcode = '42501';
  end if;
  -- A lender cannot stipulate on something it has not seen.
  if d.status = 'Draft' then
    raise exception 'A stipulation belongs to a submitted deal; this one has only been selected'
      using errcode = '22023';
  end if;
  if coalesce(trim(p_document_type), '') = '' then
    raise exception 'A stipulation needs a document type' using errcode = '22023';
  end if;

  insert into public.document_requests (file_id, deal_id, party_id, document_type, period, requirement, status, lender_note, created_by)
  values (d.file_id, p_deal, p_party, p_document_type, p_period, 'required', 'open', p_lender_note, auth.uid())
  returning id into v_id;

  update public.funding_deals set stips_outstanding = (
    select count(*) from public.document_requests
     where deal_id = p_deal and status not in ('satisfied', 'waived')
  ) where id = p_deal;

  select * into t from public.funding_file_tenancy(d.file_id);
  v_vis := case when public.is_staff_of(t.agency_id) and t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                when public.is_staff_of(t.agency_id) then 'bes_internal'
                when t.organization_id is not null and public.bes_engaged_with(t.organization_id) then 'shared_with_partner'
                else 'organization_internal' end::public.activity_visibility;

  insert into public.activity_events (agency_id, organization_id, entity_type, entity_id, actor_id, action, detail, field, new_value, visibility)
  values (t.agency_id, t.organization_id, 'funding_file', d.file_id::text, auth.uid(), 'Stipulation requested',
          d.lender || ' asked for ' || p_document_type || coalesce(' — ' || p_lender_note, ''),
          'stipulation:' || v_id::text, p_document_type, v_vis);
  return v_id;
end $$;
revoke execute on function public.add_deal_stipulation(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.add_deal_stipulation(uuid, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep `funding_deals.stips_outstanding` honest whatever moved the row.
-- A count that only one writer maintains drifts the moment another writer
-- exists — and `satisfy_document_instance` is already another writer.
-- ---------------------------------------------------------------------------
create or replace function public.sync_deal_stips_outstanding()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deal uuid;
begin
  v_deal := coalesce(new.deal_id, old.deal_id);
  if v_deal is null then return coalesce(new, old); end if;
  update public.funding_deals set stips_outstanding = (
    select count(*) from public.document_requests
     where deal_id = v_deal and status not in ('satisfied', 'waived')
  ) where id = v_deal;
  return coalesce(new, old);
end $$;
revoke all on function public.sync_deal_stips_outstanding() from public, anon, authenticated;

drop trigger if exists document_requests_sync_stips on public.document_requests;
create trigger document_requests_sync_stips
  after insert or update of status, deal_id or delete on public.document_requests
  for each row execute function public.sync_deal_stips_outstanding();
