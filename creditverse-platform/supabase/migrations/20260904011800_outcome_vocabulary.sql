-- 0140 — What actually happened, said accurately (R5).
--
-- ---------------------------------------------------------------------------
-- THE DEFECT THIS FIXES, AND IT IS LIVE
--
-- `report_item_changes` (0071) says:
--
--     case when cur.id is null then 'deleted'
--
-- An account present in one import and absent from the next is labelled
-- DELETED. No coverage check, no completeness check, no account matching
-- beyond `account_ref`. That value flows into `report_facts`, into the KPI
-- catalogue (`outcomes.deleted_engine`), into the pivot, and from there into
-- progress reports and a client's own summary.
--
-- So today, an import that failed to read an account tells the client the
-- bureau deleted it. A renamed creditor does the same. That is the single
-- most consequential false statement the platform can make, because it is
-- made to the consumer about their own file, in writing.
--
-- CR-14 gave us the facts to stop it: `credit_reports.import_quality` says
-- whether a snapshot read completely, and `credit_reports.bureaus` says what
-- it covered. This migration makes the comparison use them.
--
-- ---------------------------------------------------------------------------
-- THE DISTINCTION THAT MATTERS MOST
--
--   BUREAU_CONFIRMED_DELETION   the result itself says the item was removed
--   NO_LONGER_OBSERVED          it is absent from a complete, comparable report
--
-- The second is an observation about our own reading. The first is the
-- bureau's own statement. They are never summed into one "deletions" figure,
-- and a reimport inference may never masquerade as a bureau response — which
-- is why every outcome carries how it was determined.
-- ---------------------------------------------------------------------------

create type public.dispute_outcome as enum (
  'bureau_confirmed_deletion',
  'no_longer_observed',
  'corrected',
  'updated',
  'unchanged',
  'newly_reported',
  'reappeared',
  'unable_to_compare',
  'ambiguous_match',
  'result_not_available',
  -- Legacy coarse values, mapped conservatively and NEVER upgraded. A row
  -- recorded before this vocabulary existed has no provenance for a stronger
  -- claim, and manufacturing one would be worse than leaving it coarse.
  'legacy_reported_deleted',
  'legacy_reported_updated',
  'legacy_reported_verified'
);

comment on type public.dispute_outcome is
  'What happened to a disputed item. bureau_confirmed_deletion needs the result to SAY so; no_longer_observed is our own reading of a complete comparable report. The two are never summed.';

create type public.outcome_source as enum (
  'cra_result_notice',
  'reimport_comparison',
  'operator_review',
  'consumer_provided_result',
  'other',
  'legacy_manual_entry'
);

comment on type public.outcome_source is
  'How an outcome was determined. Exists so a reimport inference can never be read as a bureau response.';

-- ── One reviewed outcome per disputed item per bureau ────────────────────
create table public.dispute_item_outcomes (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.fulfillment_clients(id) on delete cascade,
  /** The report the comparison was made against, where there was one. */
  report_id      uuid references public.credit_reports(id) on delete set null,
  /** The report compared FROM. Both null for a CRA notice with no reimport. */
  prev_report_id uuid references public.credit_reports(id) on delete set null,
  round_number   integer check (round_number is null or round_number >= 1),
  /** The stable handle that matches the same tradeline across imports. */
  account_ref    text not null check (length(trim(account_ref)) > 0),
  bureau         text not null check (bureau in ('EQ', 'EX', 'TU')),

  outcome        public.dispute_outcome not null,
  result_source  public.outcome_source not null,

  /** Which field the change was in, for CORRECTED and UPDATED. */
  field          text,
  previous_value text,
  current_value  text,

  /**
   * A person's own words. Required for the two outcomes that assert the
   * strongest thing: a bureau-confirmed deletion, and a correction. Neither
   * may be recorded silently, because both are claims about someone else's
   * conduct or about a dispute having worked.
   */
  note           text,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),

  /**
   * A bureau-confirmed deletion needs the bureau's own statement behind it.
   * `reimport_comparison` can never establish one: an item absent from a
   * report is absent from a report, and nothing more.
   */
  constraint dispute_item_outcomes_deletion_source_ck check (
    outcome <> 'bureau_confirmed_deletion'
    or result_source in ('cra_result_notice', 'consumer_provided_result', 'operator_review')
  ),
  /** …and a person's note saying where the statement came from. */
  constraint dispute_item_outcomes_deletion_note_ck check (
    outcome <> 'bureau_confirmed_deletion' or (note is not null and length(trim(note)) >= 10)
  ),
  /**
   * A correction is a claim that the dispute achieved something. It needs a
   * reviewed basis, not a diff: a field moving is UPDATED until somebody
   * establishes that it moved to the value asked for.
   */
  constraint dispute_item_outcomes_corrected_ck check (
    outcome <> 'corrected'
    or (result_source in ('cra_result_notice', 'operator_review', 'consumer_provided_result')
        and note is not null and length(trim(note)) >= 10)
  )
  /*
   * Deliberately NO unique constraint. The table is append-only, and a
   * reviewer who changes their mind must be able to record the second
   * conclusion without erasing the first — that is the whole reason the
   * rows are immutable. The read layer takes the most recent row per
   * (client, report, account, bureau, field); the history stays inspectable.
   */
);
create index dispute_item_outcomes_client_idx on public.dispute_item_outcomes (client_id, outcome);
create index dispute_item_outcomes_latest_idx on public.dispute_item_outcomes
  (client_id, account_ref, bureau, created_at desc);

comment on table public.dispute_item_outcomes is
  'One reviewed outcome per disputed item per bureau. Append-only: a later review is a new row, so what was concluded when stays visible.';

-- ── Authorization: the existing client chain, nothing parallel ──────────
alter table public.dispute_item_outcomes enable row level security;
revoke all on public.dispute_item_outcomes from public, anon;
-- No update, no delete: a conclusion drawn on a date is part of the record.
grant select, insert on public.dispute_item_outcomes to authenticated;

create policy dispute_item_outcomes_select on public.dispute_item_outcomes
  for select to authenticated using (public.credit_client_visible(client_id));
create policy dispute_item_outcomes_insert on public.dispute_item_outcomes
  for insert to authenticated
  with check (public.credit_client_writable(client_id) and created_by = auth.uid());

-- ── The comparison view, made honest ────────────────────────────────────
--
-- Same shape as 0071 so the pivot and `report-changes.ts` keep working, with
-- three changes:
--
--   1. `change` now uses the canonical vocabulary.
--   2. An absence is only `no_longer_observed` where the LATER report read
--      COMPLETELY. Otherwise `unable_to_compare` — an account missing from a
--      partial import is an account we did not read.
--   3. An absence where the later report holds a DIFFERENT handle with the
--      same creditor name is `ambiguous_match`, not a disappearance. A
--      re-issued card or a renamed furnisher is the same obligation.
--
-- `newly_reported` is added: 0071 walked only the earlier report's items, so
-- an item that appeared was invisible to the metrics entirely.
--
-- SECURITY INVOKER, unchanged — the view sees exactly what its caller may.
create or replace view public.report_item_changes
with (security_invoker = true) as
with ordered as (
  select r.id as report_id, r.fulfillment_client_id as client_id, r.pulled_at,
         r.import_quality, r.bureaus,
         lag(r.id) over (partition by r.fulfillment_client_id order by r.pulled_at, r.created_at) as prev_report_id
    from public.credit_reports r
   where r.fulfillment_client_id is not null
),
pairs as (select * from ordered where prev_report_id is not null),
/* Everything the earlier report held, judged against the later one. */
carried as (
  select p.client_id, p.report_id, p.prev_report_id, p.pulled_at::date as observed_on,
         prev.account_ref, prev.kind, prev.name,
         case
           /* An absence proves nothing unless the later report read
              completely. This is the whole point of the migration. */
           when cur.id is null and coalesce(p.import_quality::text, 'unknown') <> 'complete'
             then 'unable_to_compare'
           when cur.id is null and exists (
                  select 1 from public.report_items other
                   where other.report_id = p.report_id
                     and other.kind = prev.kind
                     and lower(other.name) = lower(prev.name)
                     and other.account_ref <> prev.account_ref)
             then 'ambiguous_match'
           when cur.id is null then 'no_longer_observed'
           when cur.status <> prev.status
             or coalesce(cur.balance_cents, -1) <> coalesce(prev.balance_cents, -1)
             then 'updated'
           else 'unchanged'
         end as change,
         prev.status as previous_status, cur.status as current_status,
         prev.balance_cents as previous_balance_cents, cur.balance_cents as current_balance_cents,
         prev.bureaus
    from pairs p
    join public.report_items prev on prev.report_id = p.prev_report_id and prev.kind = 'Account'
    left join public.report_items cur on cur.report_id = p.report_id and cur.account_ref = prev.account_ref
),
/* …and everything the later report holds that the earlier one did not. */
appeared as (
  select p.client_id, p.report_id, p.prev_report_id, p.pulled_at::date as observed_on,
         cur.account_ref, cur.kind, cur.name,
         'newly_reported'::text as change,
         null::text as previous_status, cur.status as current_status,
         null::bigint as previous_balance_cents, cur.balance_cents as current_balance_cents,
         cur.bureaus
    from pairs p
    join public.report_items cur on cur.report_id = p.report_id and cur.kind = 'Account'
   where not exists (
     select 1 from public.report_items prev
      where prev.report_id = p.prev_report_id and prev.account_ref = cur.account_ref)
)
select * from carried
union all
select * from appeared;
revoke all on public.report_item_changes from public, anon;
grant select on public.report_item_changes to authenticated;

comment on view public.report_item_changes is
  'Consecutive imports compared. An absence is no_longer_observed ONLY where the later report read completely; otherwise unable_to_compare. Nothing here is a bureau-confirmed deletion — that needs the bureau''s own statement.';

-- ── Facts and KPIs: the counts stay distinct ────────────────────────────
--
-- `report_facts` keeps its shape; only the outcome vocabulary changes, and the
-- reviewed outcomes join as their own source so a bureau-confirmed deletion is
-- counted from the bureau's statement rather than from a diff.
alter table public.kpi_definitions drop constraint if exists kpi_definitions_source_check;
alter table public.kpi_definitions add constraint kpi_definitions_source_check
  check (source in ('production', 'time', 'status_change', 'letter', 'submission', 'funded',
                    'manual_outcome', 'report_outcome', 'reviewed_outcome'));

/* The old key matched {"outcome":"deleted"}, which the view no longer emits.
   Relabelled and rematched rather than left to silently count zero — a KPI
   that quietly stops counting is worse than one that changes its name. */
update public.kpi_definitions
   set key = 'outcomes.no_longer_observed',
       label = 'No longer observed (from reports)',
       description = 'Accounts present in one import and absent from the next COMPLETE comparable import, observed on the later import. Not a bureau-confirmed deletion.',
       match = '{"outcome":"no_longer_observed"}'
 where key = 'outcomes.deleted_engine';

update public.kpi_definitions
   set match = '{"outcome":"updated"}',
       description = 'Accounts whose status or balance changed between imports. A change, not a correction.'
 where key = 'outcomes.updated_engine';

/* Legacy manual counts keep counting, under names that say what they are. */
update public.kpi_definitions
   set label = 'Items reported deleted (legacy manual)',
       description = 'Recorded by hand from an outside CRM before outcome provenance existed. No bureau statement behind it — never merged with bureau-confirmed deletions.'
 where key = 'outcomes.deleted';
update public.kpi_definitions
   set label = 'Items reported verified (legacy manual)',
       description = 'Recorded by hand. "Verified" here means the bureau returned the item unchanged — it is not a finding that the reporting is accurate.'
 where key = 'outcomes.verified';

insert into public.kpi_definitions (key, label, description, service, source, aggregation, match, bes_internal, sort) values
  ('outcomes.bureau_confirmed_deletion', 'Deleted by bureau (confirmed)',
   'The result itself states the item was removed. Never inferred from an item being absent from a report.',
   'creditops', 'reviewed_outcome', 'count', '{"outcome":"bureau_confirmed_deletion"}', false, 30),
  ('outcomes.corrected', 'Corrected (reviewed)',
   'A disputed field changed to the value asked for, established by a reviewed result. A field simply moving is UPDATED, not corrected.',
   'creditops', 'reviewed_outcome', 'count', '{"outcome":"corrected"}', false, 31),
  ('outcomes.reappeared', 'Reappeared',
   'Observed again after not being observed on a complete comparable report. A question, not a finding.',
   'creditops', 'reviewed_outcome', 'count', '{"outcome":"reappeared"}', false, 32),
  ('outcomes.unable_to_compare', 'Unable to compare',
   'The reports could not be compared — a partial import, differing bureau coverage, or an unresolved match.',
   'creditops', 'report_outcome', 'count', '{"outcome":"unable_to_compare"}', false, 33)
on conflict (key) do nothing;

create or replace view public.report_facts
with (security_invoker = true) as
  select * from (
    select 'production'::text as source, p.work_date as fact_date, p.agency_id, p.organization_id, p.outsourcing_group_id,
           p.division_id as service, p.department::text as department, p.employee_id, p.client_id, null::uuid as funding_file_id,
           p.production_unit_type as unit, p.production_unit_quantity::numeric as quantity, null::integer as minutes, null::numeric as amount,
           null::text as outcome, null::text as status_from, null::text as status_to
      from public.production_logs p where not p.is_voided
    union all
    select 'time', t.work_date, t.agency_id, t.organization_id, null, t.division_id, null, t.employee_id, t.client_id, null,
           null, null, t.duration_minutes, null, null, null, null
      from public.time_entries t where t.ended_at is not null
    union all
    select 'status_change', a.created_at::date, a.agency_id, a.organization_id, null, 'creditops', null, a.actor_id, (a.entity_id)::uuid, null,
           null, null, null, null, null, a.previous_value, a.new_value
      from public.activity_events a
     where a.entity_type = 'fulfillment_client' and a.action = 'Status changed' and a.entity_id ~ '^[0-9a-f-]{36}$'
    union all
    select 'letter', l.created_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
           null, null, null, null, 'built', null, null
      from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id
    union all
    select 'letter', l.mailed_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
           null, null, null, null, 'mailed', null, null
      from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id where l.mailed_at is not null
    union all
    select 'letter', l.responded_at::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', l.created_by, l.client_id, null,
           null, null, null, null, 'responded', null, null
      from public.dispute_letters l join public.fulfillment_clients c on c.id = l.client_id where l.responded_at is not null
    union all
    /* Legacy manual counts, kept under their own outcome names so they can
       never be summed with a bureau-confirmed deletion. */
    select 'manual_outcome', o.outcome_date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', o.recorded_by, o.client_id, null,
           o.bureau, v.qty, null, null, v.kind, null, null
      from public.client_round_outcomes o join public.fulfillment_clients c on c.id = o.client_id
      cross join lateral (values ('deleted', o.deleted::numeric), ('updated', o.updated::numeric), ('verified', o.verified::numeric), ('disputed', o.items_disputed::numeric)) as v(kind, qty)
    union all
    select 'report_outcome', ch.observed_on, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute', null, ch.client_id, null,
           array_to_string(ch.bureaus, ','), 1, null, null, ch.change, ch.previous_status, ch.current_status
      from public.report_item_changes ch join public.fulfillment_clients c on c.id = ch.client_id
     where ch.change in ('no_longer_observed', 'updated', 'newly_reported', 'unable_to_compare', 'ambiguous_match')
    union all
    /* Reviewed outcomes. This is the only source a bureau-confirmed deletion
       can come from, and the reason it can never come from a diff. */
    select 'reviewed_outcome', coalesce(o.reviewed_at, o.created_at)::date, c.agency_id, c.organization_id, c.outsourcing_group_id, 'creditops', 'Dispute',
           coalesce(o.reviewed_by, o.created_by), o.client_id, null,
           o.bureau, 1, null, null, o.outcome::text, o.previous_value, o.current_value
      from public.dispute_item_outcomes o join public.fulfillment_clients c on c.id = o.client_id
    union all
    select 'submission', coalesce(d.submitted_at, d.created_at)::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Submissions', f.assigned_agent_id, null, d.file_id,
           d.lender, null, null, d.amount, d.status::text, null, null
      from public.funding_deals d join public.funding_files f on f.id = d.file_id join public.funding_clients fc on fc.id = f.client_id
     where d.status <> 'Draft'
    union all
    select 'funded', fd.funded_at::date, fc.agency_id, fc.organization_id, fc.outsourcing_group_id, 'fundingops', 'Funded Deals', fd.confirmed_by, null, fd.file_id,
           fd.lender_name, null, null, fd.gross_funded, 'funded', null, null
      from public.funded_deals fd join public.funding_files f on f.id = fd.file_id join public.funding_clients fc on fc.id = f.client_id
  ) facts;
revoke all on public.report_facts from public, anon;
grant select on public.report_facts to authenticated;
