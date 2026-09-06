-- 0112 — Lender stipulations belong to the DEAL, not to the funding file.
--
-- Dee, 2026-09-06: stipulations are "lender-requested requirements after a
-- submission or review". Today `document_requests` hangs off `funding_files`
-- only, which cannot express the ordinary case: two lenders on the same file
-- each asking for a bank statement, on their own schedule, satisfied
-- separately. One file-level request cannot be open for one lender and
-- satisfied for the other.
--
-- This migration is deliberately additive. Nothing existing changes meaning:
--
--   • `deal_id` is NULLABLE. Every existing row keeps deal_id NULL and stays
--     exactly what it was — a file-level requirement resolved from the
--     requirement rules, which is a different thing from a lender stipulation
--     and must stay a different thing.
--   • The five new status values are ADDED to the enum. No existing row's
--     status is rewritten. `open` continues to mean "Requested" — renaming it
--     would touch every row and three functions to gain a synonym.
--   • The uniqueness rule gains `deal_id`. For existing rows deal_id is NULL,
--     which coalesces to the same sentinel the party_id already uses, so the
--     index is identical for them.
--
-- Postgres will not let a value added to an enum be USED in the same
-- transaction, so the transition function that references the new values
-- lives in 0113. This migration only widens the type.

-- ---------------------------------------------------------------------------
-- The lifecycle Dee specified:
--   Requested → Assigned → Waiting on Client → Received → Under Review
--            → Submitted to Lender → Satisfied
-- `open` IS Requested. `waived` stays as the escape hatch it already was.
-- ---------------------------------------------------------------------------
alter type public.document_request_status add value if not exists 'assigned'            after 'open';
alter type public.document_request_status add value if not exists 'waiting_on_client'   after 'assigned';
alter type public.document_request_status add value if not exists 'received'            after 'waiting_on_client';
alter type public.document_request_status add value if not exists 'under_review'        after 'received';
alter type public.document_request_status add value if not exists 'submitted_to_lender' after 'under_review';

-- ---------------------------------------------------------------------------
-- The deal a stipulation belongs to, and who is chasing it.
-- ---------------------------------------------------------------------------
alter table public.document_requests
  add column if not exists deal_id     uuid references public.funding_deals(id) on delete cascade,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists lender_note text;

comment on column public.document_requests.deal_id is
  'NULL = a file-level requirement from the rules. Set = a stipulation this lender asked for on this deal.';
comment on column public.document_requests.lender_note is
  'What the lender actually said, verbatim. Never paraphrased into the requirement.';

create index if not exists document_requests_deal_idx
  on public.document_requests (deal_id, status) where deal_id is not null;
create index if not exists document_requests_assignee_idx
  on public.document_requests (assigned_to) where assigned_to is not null;

-- The same document type may now be requested once per deal AND once at file
-- level. Existing rows (deal_id NULL) keep the identical key they had.
drop index if exists public.document_requests_one_per_need;
create unique index document_requests_one_per_need
  on public.document_requests (
    file_id,
    coalesce(deal_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(party_id, '00000000-0000-0000-0000-000000000000'::uuid),
    document_type,
    coalesce(period, '')
  );

-- ---------------------------------------------------------------------------
-- A deal a reviewer may write to is not automatically a deal on THIS file.
--
-- The RLS policies check `file_reviewer(file_id)` and say nothing about
-- deal_id, so without this a reviewer of file A could attach a stipulation to
-- a deal belonging to file B — a cross-file write that every policy would
-- happily allow because the file_id it checked was correct (rule 4: preserve
-- explicit relationships).
--
-- SECURITY DEFINER is required and is the right choice here: the trigger must
-- read `funding_deals` to compare the two file ids, and the caller may
-- legitimately be unable to see the other deal. It grants nothing — it only
-- ever raises.
-- ---------------------------------------------------------------------------
create or replace function public.document_request_deal_matches_file()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_file uuid;
begin
  if new.deal_id is null then return new; end if;
  select file_id into v_file from public.funding_deals where id = new.deal_id;
  if v_file is null then
    raise exception 'deal does not exist' using errcode = '23503';
  end if;
  if v_file <> new.file_id then
    raise exception 'a stipulation must belong to a deal on the same funding file'
      using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.document_request_deal_matches_file() from public, anon, authenticated;

drop trigger if exists document_requests_deal_file on public.document_requests;
create trigger document_requests_deal_file
  before insert or update of deal_id, file_id on public.document_requests
  for each row execute function public.document_request_deal_matches_file();
