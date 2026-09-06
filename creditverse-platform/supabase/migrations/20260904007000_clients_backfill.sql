-- 0092 — the Client as an organization asset. Step 2 of 5: the backfill.
--
-- One `clients` row per real person, and a `client_id` on each engine record
-- pointing at them. Reversible: drop the columns and the rows.
--
-- ---------------------------------------------------------------------------
-- THE DEDUPE KEY IS THE EMAIL ADDRESS, AND NOTHING ELSE.
--
-- Rule 4 forbids inferring identity from a display name. Two "J. Smith"
-- records in one organization are two people until a human says otherwise, and
-- a wrong merge here would invent a person who does not exist and hand them
-- somebody else's credit report. Both engines already enforce one email per
-- partner, so `(partner_scope_id, lower(email))` is exact, not a guess.
--
-- What the backfill will NOT do: match on name, match on phone, match across
-- partners. A person who appears under two different partners stays two
-- clients — they left one company for another, and each company's record of
-- them is its own (rule 16).
--
-- What it flags instead. `needs_review` is set, with a note, when:
--   • the single `name` field did not split into a given name and a surname;
--   • the credit record and the funding record for the same email disagree
--     about the person's name.
-- Neither is guessed at. A person confirms or splits them, and Dee decided on
-- 2026-09-06 that the person who imported the record resolves it, not only an
-- administrator.
-- ---------------------------------------------------------------------------

alter table public.fulfillment_clients add column if not exists client_id uuid references public.clients(id) on delete restrict;
alter table public.funding_clients     add column if not exists client_id uuid references public.clients(id) on delete restrict;
create index if not exists fulfillment_clients_client_idx on public.fulfillment_clients (client_id);
create index if not exists funding_clients_client_idx     on public.funding_clients (client_id);

comment on column public.fulfillment_clients.client_id is
  'The person this credit case is about. The case is the work; the client is the person.';
comment on column public.funding_clients.client_id is
  'The person this funding record is about. Same client row as the credit case, when they have both.';

-- ---------------------------------------------------------------------------
-- Splitting one `name` into a given name and a surname.
--
-- Last whitespace-separated token is the surname; everything before it is the
-- given name(s). "Mary Anne Blake" → "Mary Anne" + "Blake", which is right
-- more often than any cleverer rule, and wrong in ways a human can see and fix
-- rather than in ways that silently mis-address a dispute letter.
-- ---------------------------------------------------------------------------
create or replace function public.split_person_name(p_name text)
returns table (given_name text, surname text, clean boolean)
language sql immutable set search_path = public as $$
  with n as (select trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')) as v)
  select
    case when position(' ' in n.v) > 0
         then substring(n.v from 1 for length(n.v) - position(' ' in reverse(n.v)))
         else null end,
    case when position(' ' in n.v) > 0
         then substring(n.v from length(n.v) - position(' ' in reverse(n.v)) + 2)
         else nullif(n.v, '') end,
    position(' ' in n.v) > 0
  from n
$$;
comment on function public.split_person_name(text) is
  'Best-effort split of a single name field. `clean` is false when there was nothing to split, which is what needs_review is for.';

-- ---------------------------------------------------------------------------
-- The backfill itself. One statement per source so the order is plain:
-- CreditOps first (it is the older and larger list), then FundingOps adds only
-- the people CreditOps did not already have.
-- ---------------------------------------------------------------------------
do $$
declare
  v_credit  integer;
  v_funding integer;
  v_review  integer;
begin
  -- 1. A client for every credit case.
  insert into public.clients
    (agency_id, organization_id, outsourcing_group_id, mode, first_name, last_name,
     email, phone, status, provenance, needs_review, review_note, created_by, created_at)
  select
    c.agency_id, c.organization_id, c.outsourcing_group_id, c.mode,
    s.given_name,
    coalesce(s.surname, '(name not given)'),
    c.email, c.phone,
    case when c.status = 'Completed' then 'archived' else 'active' end::public.client_status,
    case when c.mode = 'outsourcing_only' then 'outsourcing_only' else 'saas_pulled' end::public.client_provenance,
    not s.clean,
    case when not s.clean then 'Imported from CreditOps with a single-word name; check the given name and surname.' end,
    c.created_by, c.created_at
  from public.fulfillment_clients c
  cross join lateral public.split_person_name(c.name) s
  where c.client_id is null
  on conflict (partner_scope_id, lower(email::text)) do nothing;

  update public.fulfillment_clients c
     set client_id = k.id
    from public.clients k
   where c.client_id is null
     and k.partner_scope_id = c.partner_scope_id
     and lower(k.email::text) = lower(c.email::text);
  get diagnostics v_credit = row_count;

  -- 2. A client for every funding record that is not already one of them.
  insert into public.clients
    (agency_id, organization_id, outsourcing_group_id, mode, first_name, last_name,
     email, phone, portal_user_id, status, provenance, needs_review, review_note, created_by, created_at)
  select
    f.agency_id, f.organization_id, f.outsourcing_group_id, f.mode,
    s.given_name,
    coalesce(s.surname, '(name not given)'),
    f.email, f.phone, f.portal_user_id,
    'active'::public.client_status,
    case when f.mode = 'outsourcing_only' then 'outsourcing_only' else 'saas_pulled' end::public.client_provenance,
    not s.clean,
    case when not s.clean then 'Imported from FundingOps with a single-word name; check the given name and surname.' end,
    f.created_by, f.created_at
  from public.funding_clients f
  cross join lateral public.split_person_name(f.name) s
  where f.client_id is null
  on conflict (partner_scope_id, lower(email::text)) do nothing;

  update public.funding_clients f
     set client_id = k.id
    from public.clients k
   where f.client_id is null
     and k.partner_scope_id = f.partner_scope_id
     and lower(k.email::text) = lower(f.email::text);
  get diagnostics v_funding = row_count;

  -- 3. The funding login, where the client did not come from FundingOps.
  update public.clients k
     set portal_user_id = f.portal_user_id
    from public.funding_clients f
   where f.client_id = k.id and f.portal_user_id is not null and k.portal_user_id is null;

  -- 4. Flag the merges where the two engines disagree about the person's name.
  --    Nothing is changed — the credit name stands and a human decides.
  update public.clients k
     set needs_review = true,
         review_note = coalesce(k.review_note || ' ', '')
                     || 'CreditOps and FundingOps hold different names for this email address; confirm they are the same person.'
    from public.fulfillment_clients c
    join public.funding_clients f on f.client_id = c.client_id
   where c.client_id = k.id
     and lower(trim(c.name)) <> lower(trim(f.name));

  select count(*) into v_review from public.clients where needs_review;

  raise notice 'clients backfill: % credit cases linked, % funding records linked, % flagged for review',
    v_credit, v_funding, v_review;

  -- Nothing may be left unlinked: an engine record with no client is a person
  -- the platform can no longer answer questions about.
  if exists (select 1 from public.fulfillment_clients where client_id is null)
     or exists (select 1 from public.funding_clients where client_id is null) then
    raise exception 'backfill incomplete: an engine record has no client';
  end if;
end $$;

-- Now that every row is linked, the link is required. A credit case or a
-- funding record without a person is not a thing that should exist.
alter table public.fulfillment_clients alter column client_id set not null;
alter table public.funding_clients     alter column client_id set not null;
