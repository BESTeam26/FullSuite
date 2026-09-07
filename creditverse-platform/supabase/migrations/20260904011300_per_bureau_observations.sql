-- 0135 — What each bureau actually said, and what the source said when we
--        cannot tell who said it.
--
-- CR-2. Approved by Dee 2026-09-07 with four refinements, all applied below.
-- Proposal: ARCHITECTURE_PROPOSAL_PER_BUREAU_OBSERVATIONS.md
-- Doctrine: docs/creditops/CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md §9
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM THIS CLOSES
--
-- BES reads which bureau reported what, and throws it away before storing it.
-- `pdf-report-parser.firstColumn()` splits a tri-merge row, notices the
-- columns disagree, keeps `columns[0]` and discards the rest. `report_items`
-- then holds ONE status, ONE balance, ONE dofd, plus `bureaus text[]` — a list
-- of who reports the account, with no record of what each of them said.
--
-- The cost was not one rule. `BUREAU.VALUE_DIFFERS` sat in the integrity
-- catalogue with its authorities, its route and its remedy, unreachable. Six
-- of the condition detector's cross-bureau conditions were unreachable. And
-- `detectConditions` itself had no product caller at all, because its input is
-- `BureauRecord[]` and nothing in the application could build one.
--
-- ---------------------------------------------------------------------------
-- THE CONSTRAINT THAT DECIDES THE DESIGN
--
-- COLUMN ORDER IS NOT BUREAU ORDER.
--
-- Attributing a column to a bureau by position, without a header that names
-- them in that order, is inferring identity from layout — the same mistake as
-- inferring ownership from a display name (project rule 4). It would
-- manufacture the sentence "Equifax says $1,400 and TransUnion says $0" out of
-- nothing, and that sentence is the whole point of the feature.
--
-- So there are TWO destinations, and which one a value reaches is decided by
-- evidence, never by convenience:
--
--   attribution proven   → public.report_item_bureau_values (one row per bureau)
--   attribution NOT proven → public.report_items.source_columns (jsonb)
--
-- The second is Dee's refinement 1, and it matters: the earlier design reduced
-- an unattributed row to the remark "Bureau columns differ", losing the
-- figures. Now the source values are preserved verbatim under the field label
-- the parser matched, with nobody's name attached.
--
--   PRESERVE WHAT THE SOURCE SAID WITHOUT INVENTING WHO SAID IT.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- NO BACKFILL (refinement 3). Existing `report_items` rows get no child rows
-- and no `source_columns`. A single stored value cannot be split back into
-- three bureaus' worth of truth, and a reconstructed one would be a fact
-- nobody reported. Historical absence stays UNKNOWN. New imports and
-- reimports populate the structure where the parser has real attribution.
--
-- NO RULE ACTIVATION (refinement 2). This migration is storage. It does not
-- wire the dormant detector into production, and nothing here upgrades a
-- cross-bureau difference past OBSERVED_REPORTING_DIFFERENCE.
-- ---------------------------------------------------------------------------

-- ── 1. Unattributed source columns ────────────────────────────────────────
--
-- Shape: { "<field label>": ["<col 1>", "<col 2>", ...] }
-- e.g.   { "balance": ["$500", "$500", "$520"], "status": ["Open", "Open", "Closed"] }
--
-- One nullable jsonb column rather than a second child table, because these
-- values have no key to be keyed by — that is precisely what is missing about
-- them. A row here is a record of ambiguity, and it is honest about it.
alter table public.report_items
  add column if not exists source_columns jsonb;

comment on column public.report_items.source_columns is
  'Raw column values from a multi-bureau row whose header did NOT prove which column belongs to which bureau. Field label -> ordered raw values, exactly as printed. Never treat position as bureau identity; attributed values live in report_item_bureau_values.';

-- ── 2. Attributed per-bureau observations ─────────────────────────────────
create table public.report_item_bureau_values (
  id              uuid primary key default gen_random_uuid(),
  report_item_id  uuid not null references public.report_items(id) on delete cascade,
  bureau          text not null check (bureau in ('EQ', 'EX', 'TU')),

  -- The BureauRecord shape, as the report prints it. Every field nullable:
  -- absence is a distinct answer from a bad value, and a rule that needs a
  -- field it does not have must return UNKNOWN rather than assume a zero.
  status                  text,
  payment_status          text,
  account_type            text,
  account_number_masked   text,
  balance_cents           bigint,
  high_balance_cents      bigint,
  credit_limit_cents      bigint,
  past_due_cents          bigint,
  monthly_payment_cents   bigint,
  term_months             integer,
  open_date               text,
  date_closed             text,
  date_last_payment       text,
  date_last_active        text,
  dofd                    text,
  payment_history         text[],
  remarks                 text,

  -- ── Provenance (refinement 4) ───────────────────────────────────────────
  --
  -- `source_type` says what kind of thing this value was read from. The
  -- Rulebook's eight-value list; a consumer-facing display is the only one
  -- this table can hold today, and the check keeps it that way rather than
  -- leaving the door open to a value that claims more than it is.
  source_type     text not null default 'consumer_report_presentation'
                  check (source_type in ('consumer_report_presentation',
                                         'authorized_structured_credit_data',
                                         'consumer_document',
                                         'creditor_document',
                                         'court_or_government_record')),

  -- A HARD INVARIANT, not a default. This table stores V1 consumer-report
  -- observations. A consumer disclosure is a transformed presentation, not the
  -- furnisher's transmitted record, so no row here may ever claim to be a
  -- verified Metro 2 field. That claim belongs to the V2 validation layer,
  -- which needs authorized source data and a licensed rule basis BES does not
  -- have. Mirrors report_findings.raw_metro2_verified.
  raw_metro2_verified boolean not null default false
                      check (raw_metro2_verified = false),

  /** The period this value describes, where the report states one. Absent is
      common and meaningful: without it, "same reporting period?" cannot be
      asked, and a stale figure cannot be told from a wrong one. */
  reporting_period         text,
  /** The report's own "as of" date for this bureau's data, where stated. */
  account_information_date text,
  /** Where in the source this came from — page, region, or a label path.
      Shape is the extractor's; it exists so a finding can be checked by hand. */
  source_locator           jsonb,
  /** Which parser produced it. A finding must be re-derivable, and a parser
      change is a reason a value may differ from an older snapshot. */
  parser_version           text not null,

  created_at      timestamptz not null default now(),

  -- One row per bureau per item. A duplicate would be two answers to "what did
  -- Equifax say", which is the ambiguity this table exists to remove.
  unique (report_item_id, bureau)
);

create index report_item_bureau_values_item_idx
  on public.report_item_bureau_values (report_item_id);

comment on table public.report_item_bureau_values is
  'What ONE bureau said about ONE report item, stored only where the source proved the attribution. Belongs to an immutable snapshot: no update, no delete. Corrections arrive as a later report, never by rewriting history.';

-- ── 3. Authorization ──────────────────────────────────────────────────────
--
-- Derived entirely through the existing chain, and deliberately identical in
-- shape to `report_items_select`:
--
--   report_item_bureau_values → report_items → credit_reports
--     → credit_report_visible(client, consumer, org)
--       → entity_visible('fulfillment_client', …) | consumer self
--         | is_org_member + org_entitled('diyCredit') | bes_engaged_with(org)
--
-- No organization_id lives on this table, so the frontend has nothing to
-- supply and nothing to forge. The sub-selects are RLS-filtered because this
-- is a policy expression evaluated as the caller — so a row is reachable only
-- when its parent item is, and its parent item only when the report is.
alter table public.report_item_bureau_values enable row level security;
revoke all on public.report_item_bureau_values from public, anon;

-- No update, no delete: an observation belongs to the snapshot it was read
-- from (refinement 6, and the same rule report_items already follows).
grant select, insert on public.report_item_bureau_values to authenticated;

create policy report_item_bureau_values_select
  on public.report_item_bureau_values for select to authenticated
  using (exists (
    select 1 from public.report_items i where i.id = report_item_id
  ));

-- Insert is narrower than select on purpose: only the person doing the import,
-- and only while the parent report is theirs. Mirrors report_items_insert.
create policy report_item_bureau_values_insert
  on public.report_item_bureau_values for insert to authenticated
  with check (exists (
    select 1
      from public.report_items i
      join public.credit_reports r on r.id = i.report_id
     where i.id = report_item_id
       and r.imported_by = auth.uid()
  ));

-- ── 4. The writer ─────────────────────────────────────────────────────────
--
-- Verified against `pg_get_functiondef` on the live database before applying,
-- and the check earned its keep once already: the 0085 draft was transcribed
-- as `security definer` while the live function is **security invoker**.
-- Applying that would have quietly escalated its privileges. The body below is
-- the live one plus `source_columns` and the child insert, and it stays
-- INVOKER — policies decide, not the function.
create or replace function public.create_credit_report(
  p_org uuid, p_group uuid, p_client uuid, p_consumer uuid,
  p_bureaus text[], p_pulled_at date, p_source text, p_file uuid,
  p_parser_version text, p_items jsonb, p_scores jsonb
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A credit report needs at least one item' using errcode = '22023';
  end if;
  insert into public.credit_reports
    (organization_id, outsourcing_group_id, fulfillment_client_id, consumer_user_id, bureaus, pulled_at, source, file_id, parser_version, imported_by)
  values (p_org, p_group, p_client, p_consumer, p_bureaus, p_pulled_at, p_source, p_file, p_parser_version, auth.uid())
  returning id into v_id;

  /* TWO STATEMENTS, not one with a data-modifying CTE.
     A CTE's inserted rows are invisible to the rest of the same statement —
     they share its snapshot — so the child's WITH CHECK sub-select would find
     no parent and refuse every row. Split, the second statement sees the
     first's rows inside the transaction. */
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
         /* Unattributed source columns, preserved verbatim. Null when the row
            had a single column, or when the attribution was proven and the
            values went to the child table instead. */
         case when jsonb_typeof(i->'source_columns') = 'object'
              then i->'source_columns' else null end
    from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  /* Attributed per-bureau values. Joined to the parent by POSITION, which is
     unique per report, so a child row cannot land on the wrong item.
     `bureau_values` absent → no rows at all, which is the ordinary case and
     stays UNKNOWN rather than becoming an assumption. */
  insert into public.report_item_bureau_values
    (report_item_id, bureau, status, payment_status, account_type, account_number_masked,
     balance_cents, high_balance_cents, credit_limit_cents, past_due_cents,
     monthly_payment_cents, term_months, open_date, date_closed, date_last_payment,
     date_last_active, dofd, payment_history, remarks,
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

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $$;
revoke execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) to authenticated;
