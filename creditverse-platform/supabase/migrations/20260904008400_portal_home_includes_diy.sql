-- 0106 — the portal home includes DIY, so a phone makes one request.
--
-- Rule 14, found by the pre-completion inspection. The client portal loaded
-- like this:
--
--   RequirePortalClient  -> client_portal_home()      request 1
--   ClientPortal         -> waits for clientId
--   useDiyJourney        -> diy_journeys              request 2  (waterfall)
--   DiySection           -> diy_consents              request 3  (waterfall)
--
-- Three sequential round trips before a client on a phone sees their own
-- status, and the second could not start until the first finished because it
-- needed the client id. That is exactly the shape rule 14 forbids.
--
-- The journey is one row keyed by the client this function already selects, so
-- it belongs in the same select. Consents drop out entirely: the STAGE proves
-- consent, because diy_advance() refuses to leave `enrolled` without one.
--
-- One request. No waterfall. Nothing else changes — the same policies, the
-- same visibility, the same everything.

/* The return type changes, so the old signature is dropped first — Postgres
   will not widen a table-returning function in place. */
drop function if exists public.client_portal_home();

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
  published_updates  integer,
  has_diy            boolean,
  diy_stage          text,
  diy_round          integer,
  diy_identity_theft boolean
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
          or (ae.entity_type = 'funding_client' and ae.entity_id = fu.id::text)))::integer,
    j.client_id is not null,
    j.stage::text,
    j.round_number,
    coalesce(j.identity_theft_pathway, false)
  from public.clients c
  left join public.organizations o on o.id = c.organization_id
  left join public.fulfillment_clients fc on fc.client_id = c.id
  left join public.funding_clients fu on fu.client_id = c.id
  left join public.diy_journeys j on j.client_id = c.id
  where c.portal_user_id = auth.uid()
$$;
revoke all on function public.client_portal_home() from public, anon;
grant execute on function public.client_portal_home() to authenticated;
