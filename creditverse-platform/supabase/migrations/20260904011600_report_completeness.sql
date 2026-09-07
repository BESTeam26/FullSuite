-- 0138 — What we know about what we know, and whether the parse is trustworthy.
--
-- CR-14. Approved by Dee 2026-09-07, ahead of CR-3.
-- Spec: docs/creditops/sources/SMARTCREDIT_SOURCE_MAPPING.md §5 and §6.
--
-- ---------------------------------------------------------------------------
-- THIS IS A DATA-INTEGRITY GUARDRAIL, NOT AN OPERATOR GATE.
--
-- Dee's doctrine, and it decides every design choice below. If the source says
-- 30 accounts and BES parsed 24:
--
--   • the import is PARTIAL, and says so
--   • exactly what failed reconciliation is shown
--   • the operator may inspect and work the 24 that parsed
--   • the 6 that did not parse are NOT deleted, absent, or non-reporting
--   • the import is not marked complete
--   • completeness-dependent analysis does not run
--   • a reparse, a correction, or an authorised acceptance with a recorded
--     reason are all available
--
-- A partial snapshot may be perfectly usable. BES simply has to stay honest
-- that it is partial. Nothing here requires an evidence upload, nothing here
-- blocks an operator from working, and nothing here belongs to an
-- organization's dispute SOP.
--
-- ---------------------------------------------------------------------------
-- WHY THE VERDICT IS COMPUTED IN THE DATABASE
--
-- The browser supplies the CHECKS — what the source stated, what the parser
-- read — because only the parser has seen the document. It does not supply the
-- verdict. `create_credit_report` derives `import_quality` from the checks it
-- was given, so a client cannot claim a complete import over a partial parse.
-- It could still misreport a count; it cannot misreport the conclusion.
-- ---------------------------------------------------------------------------

-- ── The eight states. Provider-agnostic, on purpose ───────────────────────
--
-- The rule that makes them worth having: A STATE IS NEVER UPGRADED BY ABSENCE.
-- `parse_failed`, `blank_in_source` and `not_exposed_by_provider` are three
-- different failures with three different owners — us, the bureau, the
-- provider — and `explicit_not_reported` is a fourth thing again: the source
-- telling us it looked and found nothing.
create type public.completeness_state as enum (
  'present',
  'explicit_not_reported',
  'blank_in_source',
  'bureau_not_present',
  'not_exposed_by_provider',
  'parse_failed',
  'ambiguous',
  'unknown'
);

comment on type public.completeness_state is
  'What we know about a field. A state is never upgraded by absence: not_exposed_by_provider is a statement about the FORMAT (e.g. SmartCredit exposes no DOFD) and is never evidence that a bureau omitted the field.';

create type public.import_quality as enum ('complete', 'partial', 'review_required');

comment on type public.import_quality is
  'complete: every reconciliation check passed. partial: a count the source stated is higher than the count parsed — we know what is missing in aggregate. review_required: a required section is missing, a parse failed, or ambiguity means the comparison could not be made at all.';

-- ── Completeness: one row per field we have something to say about ────────
create table public.report_completeness (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.credit_reports(id) on delete cascade,
  /** Null for a fact about the whole report — a format not exposing a field. */
  bureau          text check (bureau is null or bureau in ('EQ', 'EX', 'TU')),
  /** Null for a report-level fact; set where the state belongs to one item. */
  report_item_id  uuid references public.report_items(id) on delete cascade,
  /** The canonical field name, e.g. 'dofd', 'account_number_masked'. */
  field_key       text not null check (length(trim(field_key)) > 0),
  state           public.completeness_state not null,
  /** Why, in words a reviewer can act on. Required for every non-present state. */
  reason          text,
  created_at      timestamptz not null default now(),

  constraint report_completeness_reason_ck check (
    state = 'present' or (reason is not null and length(trim(reason)) > 0)
  ),
  unique (report_id, bureau, report_item_id, field_key)
);
create index report_completeness_report_idx on public.report_completeness (report_id, state);

comment on table public.report_completeness is
  'One row per field per bureau (or per report) stating what we know about what we know. Belongs to an immutable snapshot: no update, no delete.';

-- ── Reconciliation: the source checking our parser ────────────────────────
create table public.report_reconciliation (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.credit_reports(id) on delete cascade,
  /** Null for a report-level check, e.g. a required section being present. */
  bureau      text check (bureau is null or bureau in ('EQ', 'EX', 'TU')),
  /** 'accounts' | 'public_records' | 'inquiries' | 'scores' | 'section:<name>' */
  check_key   text not null check (length(trim(check_key)) > 0),
  /** What the source itself stated. Null where the source states no count. */
  stated      integer check (stated is null or stated >= 0),
  /** What the parser produced. */
  parsed      integer not null check (parsed >= 0),
  ok          boolean not null,
  /** Names what went wrong, for the operator, not for a log. */
  reason      text,
  created_at  timestamptz not null default now(),
  unique (report_id, bureau, check_key)
);
create index report_reconciliation_report_idx on public.report_reconciliation (report_id) where not ok;

comment on table public.report_reconciliation is
  'The source''s own counts against the parser''s. A mismatch means the snapshot is partial — it never means the missing rows are deleted, absent or non-reporting.';

-- ── The report's verdict, immutable ──────────────────────────────────────
alter table public.credit_reports
  add column if not exists import_quality public.import_quality;

comment on column public.credit_reports.import_quality is
  'Derived by create_credit_report from the reconciliation checks, never supplied by the client. Null on reports imported before 0138 — which is UNKNOWN, not complete.';

-- ── Authorised acceptance of a partial snapshot ──────────────────────────
--
-- Acceptance records a DECISION. It does not change a fact: `import_quality`
-- stays partial, every failed check stays failed, and every completeness state
-- stays as it was. All it says is that a named person, at a named time, chose
-- to proceed knowing this — and gave a reason.
create table public.report_partial_acceptances (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.credit_reports(id) on delete cascade,
  accepted_by  uuid not null references public.profiles(id) on delete restrict,
  /** Required. An acceptance with no stated reason is not a decision. */
  reason       text not null check (length(trim(reason)) >= 10),
  accepted_at  timestamptz not null default now(),
  unique (report_id)
);

comment on table public.report_partial_acceptances is
  'An authorised person chose to work a partial snapshot, and why. Records a decision, never a change to the completeness facts.';

-- ── Authorization: entirely through the parent report ────────────────────
--
-- None of these tables carries a tenancy column, so the frontend has nothing
-- to supply and nothing to forge. Every policy resolves through
-- credit_reports → credit_report_visible(client, consumer, org), the same
-- chain report_items and report_item_bureau_values already use.
alter table public.report_completeness         enable row level security;
alter table public.report_reconciliation       enable row level security;
alter table public.report_partial_acceptances  enable row level security;
revoke all on public.report_completeness, public.report_reconciliation, public.report_partial_acceptances from public, anon;

-- No update, no delete on the two fact tables: they belong to the snapshot.
grant select, insert on public.report_completeness   to authenticated;
grant select, insert on public.report_reconciliation to authenticated;
grant select, insert on public.report_partial_acceptances to authenticated;

create policy report_completeness_select on public.report_completeness for select to authenticated
  using (exists (select 1 from public.credit_reports r where r.id = report_id));
create policy report_completeness_insert on public.report_completeness for insert to authenticated
  with check (exists (select 1 from public.credit_reports r where r.id = report_id and r.imported_by = auth.uid()));

create policy report_reconciliation_select on public.report_reconciliation for select to authenticated
  using (exists (select 1 from public.credit_reports r where r.id = report_id));
create policy report_reconciliation_insert on public.report_reconciliation for insert to authenticated
  with check (exists (select 1 from public.credit_reports r where r.id = report_id and r.imported_by = auth.uid()));

/**
 * Acceptance is a WRITE on the client's case, not on the import, so it is
 * gated by write permission rather than by having done the import. The person
 * who uploaded the file is often not the person authorised to decide that a
 * partial snapshot may be worked.
 *
 * Mirrors report_findings_insert: credit_client_writable for a CreditOps case,
 * and organization membership for a consumer's own DIY report.
 */
create policy report_partial_acceptances_select on public.report_partial_acceptances for select to authenticated
  using (exists (select 1 from public.credit_reports r where r.id = report_id));
create policy report_partial_acceptances_insert on public.report_partial_acceptances for insert to authenticated
  with check (
    accepted_by = auth.uid()
    and exists (
      select 1 from public.credit_reports r
       where r.id = report_id
         and (
           (r.fulfillment_client_id is not null and public.credit_client_writable(r.fulfillment_client_id))
           or (r.consumer_user_id is not null and r.organization_id is not null and public.is_org_member(r.organization_id))
         )
    )
  );

-- ── The writer derives the verdict ───────────────────────────────────────
--
-- Verified against `pg_get_functiondef` on the live database first. The live
-- function is **security invoker** and stays that way — policies decide, not
-- the function.
create or replace function public.create_credit_report(
  p_org uuid, p_group uuid, p_client uuid, p_consumer uuid,
  p_bureaus text[], p_pulled_at date, p_source text, p_file uuid,
  p_parser_version text, p_items jsonb, p_scores jsonb,
  p_completeness jsonb default null, p_reconciliation jsonb default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id       uuid;
  v_failed   int := 0;
  v_blocking int := 0;
  v_quality  public.import_quality;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A credit report needs at least one item' using errcode = '22023';
  end if;

  /* THE VERDICT IS DERIVED HERE, from the checks the caller supplied — never
     accepted from the caller. A client that has parsed 24 of 30 accounts
     cannot claim a complete import.

       review_required  a check could not be made at all (no stated count),
                        or a required section is missing
       partial          a check was made and the counts disagree
       complete         every check passed */
  if p_reconciliation is not null and jsonb_typeof(p_reconciliation) = 'array' then
    select count(*) filter (where (c->>'ok')::boolean is not true),
           count(*) filter (where (c->>'ok')::boolean is not true
                              and (c->>'stated' is null or c->>'check_key' like 'section:%'))
      into v_failed, v_blocking
      from jsonb_array_elements(p_reconciliation) as c;
  end if;
  v_quality := case
                 when p_reconciliation is null or jsonb_typeof(p_reconciliation) <> 'array' then null
                 when v_blocking > 0 then 'review_required'::public.import_quality
                 when v_failed > 0 then 'partial'::public.import_quality
                 else 'complete'::public.import_quality
               end;

  insert into public.credit_reports
    (organization_id, outsourcing_group_id, fulfillment_client_id, consumer_user_id, bureaus, pulled_at, source, file_id, parser_version, imported_by, import_quality)
  values (p_org, p_group, p_client, p_consumer, p_bureaus, p_pulled_at, p_source, p_file, p_parser_version, auth.uid(), v_quality)
  returning id into v_id;

  insert into public.report_items
    (report_id, position, kind, name, subtype, status, balance_text, balance_cents,
     credit_limit_text, credit_limit_cents,
     bureaus, dofd, open_date, linked_creditor, remarks, account_ref, raw, source_columns)
  select v_id, (ord - 1)::int,
         i->>'kind', i->>'name', i->>'subtype', i->>'status', i->>'balance_text',
         nullif(i->>'balance_cents','')::bigint,
         i->>'credit_limit_text',
         nullif(i->>'credit_limit_cents','')::bigint,
         array(select jsonb_array_elements_text(coalesce(i->'bureaus','[]'::jsonb))),
         i->>'dofd', i->>'open_date', i->>'linked_creditor', i->>'remarks',
         coalesce(nullif(i->>'account_ref',''), lower(i->>'name')),
         i->'raw',
         case when jsonb_typeof(i->'source_columns') = 'object'
              then i->'source_columns' else null end
    from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  insert into public.report_item_bureau_values
    (report_item_id, bureau, status, payment_status, account_type, account_number_masked,
     balance_cents, high_balance_cents, credit_limit_cents, past_due_cents,
     monthly_payment_cents, term_months, open_date, date_closed, date_last_payment,
     date_last_active, dofd, payment_history, remarks,
     responsibility_raw, dispute_status, account_rating, creditor_type,
     payment_frequency, last_verified,
     source_type, reporting_period, account_information_date, source_locator, parser_version)
  select ri.id,
         b->>'bureau',
         b->>'status', b->>'payment_status', b->>'account_type', b->>'account_number_masked',
         nullif(b->>'balance_cents','')::bigint,
         nullif(b->>'high_balance_cents','')::bigint,
         nullif(b->>'credit_limit_cents','')::bigint,
         nullif(b->>'past_due_cents','')::bigint,
         nullif(b->>'monthly_payment_cents','')::bigint,
         nullif(b->>'term_months','')::integer,
         b->>'open_date', b->>'date_closed', b->>'date_last_payment',
         b->>'date_last_active', b->>'dofd',
         case when jsonb_typeof(b->'payment_history') = 'array'
              then array(select jsonb_array_elements_text(b->'payment_history')) end,
         b->>'remarks',
         b->>'responsibility_raw', b->>'dispute_status', b->>'account_rating',
         b->>'creditor_type', b->>'payment_frequency', b->>'last_verified',
         coalesce(nullif(b->>'source_type',''), 'consumer_report_presentation'),
         b->>'reporting_period', b->>'account_information_date',
         case when jsonb_typeof(b->'source_locator') = 'object' then b->'source_locator' end,
         p_parser_version
    from jsonb_array_elements(p_items) with ordinality as t(i, ord)
    join public.report_items ri
      on ri.report_id = v_id and ri.position = (ord - 1)::int
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(i->'bureau_values') = 'array' then i->'bureau_values' else '[]'::jsonb end
    ) as b;

  if p_completeness is not null and jsonb_typeof(p_completeness) = 'array' then
    insert into public.report_completeness (report_id, bureau, field_key, state, reason)
    select v_id, nullif(c->>'bureau',''), c->>'field_key',
           (c->>'state')::public.completeness_state, nullif(c->>'reason','')
      from jsonb_array_elements(p_completeness) as c
      on conflict do nothing;
  end if;

  if p_reconciliation is not null and jsonb_typeof(p_reconciliation) = 'array' then
    insert into public.report_reconciliation (report_id, bureau, check_key, stated, parsed, ok, reason)
    select v_id, nullif(c->>'bureau',''), c->>'check_key',
           nullif(c->>'stated','')::int, coalesce(nullif(c->>'parsed','')::int, 0),
           coalesce((c->>'ok')::boolean, false), nullif(c->>'reason','')
      from jsonb_array_elements(p_reconciliation) as c
      on conflict do nothing;
  end if;

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $$;
revoke execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

/* The 11-argument form is dropped: two optional arguments on the same name
   make every call ambiguous to PostgREST, and leaving it would mean an import
   could silently reach the version that records no completeness at all. */
drop function if exists public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb);

/**
 * May completeness-dependent analysis run against this report?
 *
 * FALSE for a partial or review-required snapshot, and false for a report
 * imported before 0138 — a null verdict is UNKNOWN, not complete.
 *
 * "Completeness-dependent" means an analysis whose conclusion changes if a
 * tradeline is missing: an item "no longer observed", a bureau "not
 * reporting", an obsolescence date computed from an absence. Those must not
 * run on a partial parse, because six unparsed accounts look exactly like six
 * accounts the consumer does not have.
 *
 * An authorised acceptance does NOT make this true. Acceptance records that a
 * person chose to work a partial snapshot; it does not make the snapshot
 * complete, and it must not silently re-enable the analyses that need it to be.
 */
create or replace function public.report_analysis_complete(p_report uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select r.import_quality = 'complete' from public.credit_reports r where r.id = p_report),
    false
  )
$$;
revoke all on function public.report_analysis_complete(uuid) from public, anon;
grant execute on function public.report_analysis_complete(uuid) to authenticated;
