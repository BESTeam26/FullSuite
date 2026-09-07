-- 0141 — a count without its window is not a count.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG
--
-- A consumer report states the same noun over different scopes. The real
-- SmartCredit export prints, on its summary page:
--
--     Inquiries (2 Years)        per bureau, a two-year window
--
-- and thirty pages later, over the inquiry listing:
--
--     We found 49 inquiries in the past 3 years
--                                all bureaus, a three-year window
--
-- Both parsers were checking the first against a parse of the second. On the
-- real file that compares 23 against a population of 49 — a discrepancy
-- manufactured entirely out of the two figures counting different periods.
-- Either the import is graded short when nothing is missing, or a genuine
-- shortfall hides inside the difference. Nobody reading the result could tell
-- which.
--
-- So a stated figure now carries the window it covers, the section it came
-- from, and the source's own wording, and two figures reconcile only when
-- their metric AND window agree. A pair that does not agree is recorded with
-- BOTH numbers and marked `comparable = false`.
--
-- ---------------------------------------------------------------------------
-- WHY THE VERDICT HAD TO CHANGE WITH IT
--
-- The verdict is derived here, from the checks the caller supplies, and it
-- counted every `ok <> true` row as a failure. A not-comparable row would
-- therefore have graded the import partial in the database while the
-- application ignored it — one import, two verdicts, and the database's the
-- one that sticks.
--
-- A check that measured nothing grades nothing. It cannot pass (that would
-- claim a verification that never happened) and it cannot fail (that would
-- report a shortfall from invalid arithmetic). What DOES still fail is a
-- like-for-like check: the inquiry listing against the total the listing
-- itself states. That comparison is real, and it is the one that catches an
-- unread inquiry.
--
-- And if nothing at all was comparable, the verdict is review_required —
-- "we could not verify this" — never complete.
-- ---------------------------------------------------------------------------

alter table public.report_reconciliation
  add column if not exists comparable        boolean not null default true,
  add column if not exists count_window      text,
  add column if not exists source_section    text,
  add column if not exists source_definition text;

comment on column public.report_reconciliation.comparable is
  'False when the stated figure and the parsed count cover different populations or periods. Both numbers are kept and neither was compared; the row grades nothing.';
comment on column public.report_reconciliation.count_window is
  'The period the stated figure covers: all_shown, 2_years, 3_years, 7_years, 10_years, or unstated. Also encoded in check_key wherever a metric exists over more than one window, because (report, bureau, check_key) is unique and two windows sharing a key would overwrite each other.';
comment on column public.report_reconciliation.source_section is
  'Where in the document the figure was read, so a reviewer can find it.';
comment on column public.report_reconciliation.source_definition is
  'The source''s own wording for what it counted, verbatim, so the scope can be checked by hand.';

CREATE OR REPLACE FUNCTION public.create_credit_report(p_org uuid, p_group uuid, p_client uuid, p_consumer uuid, p_bureaus text[], p_pulled_at date, p_source text, p_file uuid, p_parser_version text, p_items jsonb, p_scores jsonb, p_completeness jsonb DEFAULT NULL::jsonb, p_reconciliation jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id       uuid;
  v_failed   int := 0;
  v_blocking int := 0;
  v_measured int := 0;
  v_quality  public.import_quality;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A credit report needs at least one item' using errcode = '22023';
  end if;

  if p_reconciliation is not null and jsonb_typeof(p_reconciliation) = 'array' then
    /* A check marked NOT COMPARABLE measured nothing, so it grades nothing.
       Two figures counting different periods — the summary's two-year
       inquiry count against a three-year listing — can neither pass nor
       fail: passing would claim a verification that never happened, failing
       would report a shortfall out of arithmetic that was never valid.
       Without this exclusion every SmartCredit import would sit in
       review_required for ever on the strength of one such pair, and the
       database's verdict would contradict the one the application shows. */
    select count(*) filter (where (c->>'ok')::boolean is not true
                              and coalesce((c->>'comparable')::boolean, true)),
           count(*) filter (where (c->>'ok')::boolean is not true
                              and coalesce((c->>'comparable')::boolean, true)
                              and (c->>'stated' is null or c->>'check_key' like 'section:%')),
           count(*) filter (where coalesce((c->>'comparable')::boolean, true))
      into v_failed, v_blocking, v_measured
      from jsonb_array_elements(p_reconciliation) as c;
  end if;
  v_quality := case
                 when p_reconciliation is null or jsonb_typeof(p_reconciliation) <> 'array' then null
                 /* Nothing was actually compared: not verified, so not complete. */
                 when v_measured = 0 then 'review_required'::public.import_quality
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
     filed_on, reference_number, court, liability_cents, asset_cents, exempt_cents,
     inquiry_date, inquiry_type,
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
         b->>'filed_on', b->>'reference_number', b->>'court',
         nullif(b->>'liability_cents','')::bigint,
         nullif(b->>'asset_cents','')::bigint,
         nullif(b->>'exempt_cents','')::bigint,
         b->>'inquiry_date', b->>'inquiry_type',
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
    insert into public.report_reconciliation
      (report_id, bureau, check_key, stated, parsed, ok, reason,
       comparable, count_window, source_section, source_definition)
    select v_id, nullif(c->>'bureau',''), c->>'check_key',
           nullif(c->>'stated','')::int, coalesce(nullif(c->>'parsed','')::int, 0),
           coalesce((c->>'ok')::boolean, false), nullif(c->>'reason',''),
           coalesce((c->>'comparable')::boolean, true),
           nullif(c->>'window',''), nullif(c->>'source_section',''),
           nullif(c->>'source_definition','')
      from jsonb_array_elements(p_reconciliation) as c
      on conflict do nothing;
  end if;

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $function$

;
