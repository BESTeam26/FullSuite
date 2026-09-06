-- 0099 — the Client Portal. C3: a view on the canonical client, nothing new.
--
-- Dee: "Build it as a view/access layer on the canonical Organization-level
-- Client record we just established. Do NOT create a second client identity, a
-- second login model, duplicate documents, duplicate messages, duplicate
-- activity/history, or a separate DIY-only client model."
--
-- So this migration creates NO table. Not one. It adds:
--
--   • two helpers that answer "is the caller this client";
--   • a client branch on the policies that already govern each record;
--   • one reader that returns a whole portal home in a single round trip.
--
-- Everything the portal shows is the same row an agent sees. What differs is
-- WHICH rows and WHICH FIELDS reach them, and that is decided by row-level
-- security, not by the interface. The interface is not the security layer, and
-- the tests for this migration exist to prove it: they call as the client with
-- no interface in the picture at all.
--
-- ── The visibility rule, stated once ────────────────────────────────────────
--
-- The activity table already carries four visibilities:
--
--   bes_internal           BES only. Never the customer, never the client.
--   organization_internal  The organization's staff. Never the client.
--   shared_with_partner    Between BES and the organization. Never the client.
--   client_visible         Published to the client. This one, and only this.
--
-- A client sees `client_visible` and nothing else. Internal notes, staff
-- workload, SLA timers, dispute strategy, lender notes and commissions are all
-- carried on the first three, so they are excluded by the value on the row
-- rather than by a list of things to hide. That is the important part: a new
-- internal feature is private by default, because the default visibility is
-- not client_visible.

-- ---------------------------------------------------------------------------
-- 1. Who the caller is.
-- ---------------------------------------------------------------------------

/**
 * The canonical clients this signed-in person IS.
 *
 * Plural on purpose. One person may be a client of two different organizations
 * — they left one credit repair company for another — and both records are
 * real. What must never happen is a second IDENTITY for the same person inside
 * one organization, and the unique index on (partner_scope_id, lower(email))
 * already prevents that.
 */
create or replace function public.my_client_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where portal_user_id = auth.uid()
$$;
revoke all on function public.my_client_ids() from public, anon;
grant execute on function public.my_client_ids() to authenticated;

create or replace function public.is_client_of(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c where c.id = p_client and c.portal_user_id = auth.uid())
$$;
revoke all on function public.is_client_of(uuid) from public, anon;
grant execute on function public.is_client_of(uuid) to authenticated;

/** Is this signed-in person a portal client at all? Cheap, for route guards. */
create or replace function public.is_portal_client()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients where portal_user_id = auth.uid())
$$;
revoke all on function public.is_portal_client() from public, anon;
grant execute on function public.is_portal_client() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Their own engine records — the credit case and the funding record.
--
-- A client reads these; they never write them. Stage, status and round are the
-- organization's to set, and a client who could edit their own dispute round
-- would be editing the record of work done for them (rules 10 and 11).
-- ---------------------------------------------------------------------------
create policy fulfillment_clients_portal_select on public.fulfillment_clients
  for select to authenticated
  using (client_id in (select public.my_client_ids()));

create policy funding_clients_portal_select on public.funding_clients
  for select to authenticated
  using (client_id in (select public.my_client_ids()));

create policy funding_files_portal_select on public.funding_files
  for select to authenticated
  using (exists (
    select 1 from public.funding_clients fc
     where fc.id = funding_files.client_id
       and fc.client_id in (select public.my_client_ids())
  ));

-- ---------------------------------------------------------------------------
-- 3. Activity: client_visible only.
--
-- can_view_activity() ends in `else false`, so a portal client currently sees
-- nothing. The live definition was read with pg_get_functiondef and this adds
-- one branch to it, leaving the BES and organization branches exactly as they
-- are (the 0066 lesson: a function can have moved on since the migration that
-- created it).
-- ---------------------------------------------------------------------------
create or replace function public.can_view_activity(p_agency uuid, p_org uuid, p_visibility activity_visibility, p_entity_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_org is not null and public.is_org_member(p_org) then
      p_visibility in ('organization_internal', 'shared_with_partner', 'client_visible')

    when public.is_staff_of(p_agency) then
      case p_visibility
        when 'bes_internal' then true
        when 'organization_internal' then false
        else
          p_org is null
          or (public.activity_service(p_entity_type) is null)
          or public.bes_may_fulfil(p_org, null, public.activity_service(p_entity_type))
      end

    -- A portal client. One visibility, and the record still has to be theirs:
    -- entity_visible() is applied alongside this by the policy.
    when public.is_portal_client() then
      p_visibility = 'client_visible'

    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. Files.
--
-- Two directions, and they are not symmetrical.
--
-- READ: a client sees a file attached to a record of theirs, and only when the
-- activity it hangs off was published to them. An internal note's attachment
-- stays internal because the note does.
--
-- WRITE: a client uploads against a document REQUEST addressed to them. They
-- cannot attach a file to an arbitrary record, and they cannot delete anything
-- once uploaded — a document produced to satisfy a request is part of the file
-- from that moment (rule 11).
-- ---------------------------------------------------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (
    case
      when entity_type = 'activity_event' then exists (
        select 1 from public.activity_events ae where ae.id = public.try_bigint(files.entity_id)
      )
      when entity_type = 'funding_file' and uploaded_by = auth.uid() and public.is_borrower_of_file(entity_id::uuid) then true
      -- The client's own client-level documents.
      when entity_type = 'client' then public.is_client_of(entity_id::uuid)
      -- A funding file belonging to a client of theirs.
      when entity_type = 'funding_file' then
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id))
          or exists (
            select 1 from public.funding_files ff
              join public.funding_clients fc on fc.id = ff.client_id
             where ff.id = files.entity_id::uuid
               and fc.client_id in (select public.my_client_ids())
          ))
        and public.entity_visible(entity_type, entity_id)
      else
        (public.is_staff_of(agency_id) or (organization_id is not null and public.is_org_member(organization_id)))
        and public.entity_visible(entity_type, entity_id)
    end
  );

-- ---------------------------------------------------------------------------
-- 5. Document requests and what satisfies them.
--
-- A request addressed to a client's funding file is theirs to see and answer.
-- The DISPOSITION — whether a reviewer accepted it, and why they did not — is
-- deliberately excluded from what the portal reads; that is internal review,
-- and the client is told the request's status instead.
-- ---------------------------------------------------------------------------
create policy document_requests_portal_select on public.document_requests
  for select to authenticated
  using (exists (
    select 1 from public.funding_files ff
      join public.funding_clients fc on fc.id = ff.client_id
     where ff.id = document_requests.file_id
       and fc.client_id in (select public.my_client_ids())
  ));

create policy document_instances_portal_select on public.document_instances
  for select to authenticated
  using (uploaded_by = auth.uid() and exists (
    select 1 from public.funding_files ff
      join public.funding_clients fc on fc.id = ff.client_id
     where ff.id = document_instances.file_id
       and fc.client_id in (select public.my_client_ids())
  ));

-- ---------------------------------------------------------------------------
-- 6. Offers — only once somebody chose to present them.
--
-- `presented_at` is the publication switch. An offer being negotiated, or one
-- the organization decided not to put forward, is not the client's to see, and
-- the difference is a timestamp rather than a judgement call in the interface.
-- ---------------------------------------------------------------------------
create policy offers_portal_select on public.offers
  for select to authenticated
  using (
    presented_at is not null
    and exists (
      select 1 from public.funding_files ff
        join public.funding_clients fc on fc.id = ff.client_id
       where ff.id = offers.file_id
         and fc.client_id in (select public.my_client_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. The portal home, in one round trip.
--
-- Rule 14: a phone on a bad connection should not make eight requests before
-- anything appears. Every count below is scoped by the same policies above, so
-- this reader cannot show more than the client could already read.
-- ---------------------------------------------------------------------------
create or replace function public.client_portal_home()
returns table (
  client_id          uuid,
  public_id          text,
  full_name          text,
  organization_name  text,
  has_creditops      boolean,
  credit_status      text,
  credit_round       text,
  has_fundingops     boolean,
  funding_status     text,
  open_funding_files integer,
  open_document_requests integer,
  presented_offers   integer,
  published_updates  integer
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.public_id, c.full_name, o.name,
    fc.id is not null,
    fc.status::text,
    fc.round::text,
    fu.id is not null,
    fu.status::text,
    (select count(*) from public.funding_files ff
      where ff.client_id = fu.id and ff.stage::text not in ('Funded', 'Declined', 'Withdrawn'))::integer,
    (select count(*) from public.document_requests dr
       join public.funding_files ff on ff.id = dr.file_id
      where ff.client_id = fu.id and dr.status::text = 'requested')::integer,
    (select count(*) from public.offers ofr
       join public.funding_files ff on ff.id = ofr.file_id
      where ff.client_id = fu.id and ofr.presented_at is not null)::integer,
    (select count(*) from public.activity_events ae
      where ae.visibility = 'client_visible'
        and ((ae.entity_type = 'fulfillment_client' and ae.entity_id = fc.id::text)
          or (ae.entity_type = 'funding_client' and ae.entity_id = fu.id::text)))::integer
  from public.clients c
  left join public.organizations o on o.id = c.organization_id
  left join public.fulfillment_clients fc on fc.client_id = c.id
  left join public.funding_clients fu on fu.client_id = c.id
  where c.portal_user_id = auth.uid()
$$;
revoke all on function public.client_portal_home() from public, anon;
grant execute on function public.client_portal_home() to authenticated;
