-- 0139 — Public records and inquiries as canonical items (S-15, S-16).
--
-- The last two SmartCredit sections with nowhere to land. Spec:
-- docs/creditops/sources/SMARTCREDIT_SOURCE_MAPPING.md §4.5 and §4.6.
--
-- ---------------------------------------------------------------------------
-- ONE PUBLIC RECORD IS ONE report_item. ONE INQUIRY IS ONE report_item.
--
-- Not a tradeline, and not one item per field. `report_items.kind` already
-- distinguishes 'Public Record' and 'Inquiry'; what was missing was somewhere
-- to put what each bureau said about them.
--
-- So these columns go on `report_item_bureau_values`, the table CR-2 created,
-- whose whole purpose is "what ONE bureau said about ONE report item".
-- Additive and nullable: no new table, no policy, no grant, and therefore no
-- new authorization surface. Authorization, append-only behaviour and the
-- raw_metro2_verified invariant are inherited unchanged.
--
-- ---------------------------------------------------------------------------
-- WHAT THESE COLUMNS DO NOT DO
--
-- They record what the source printed and stop there. A record whose Type
-- reads "Chapter 7 Bankruptcy" and whose Status reads "Discharged" is stored
-- as those two strings. Nothing here infers what a discharge covered, whether
-- a debt was reaffirmed, or which tradelines it should have touched — those
-- are legal readings, and no column may imply one.
--
-- `inquiry_type` is the sharpest case. SmartCredit does not state it, so it
-- stays NULL, which reads as UNKNOWN. It is never guessed from the
-- subscriber's name, the section it sat in, or how recent it is — and
-- `metro2/section-j`'s retention rule is written for HARD inquiries, so from
-- this source it must return UNKNOWN rather than assume.
-- ---------------------------------------------------------------------------

alter table public.report_item_bureau_values
  -- Public records
  add column if not exists filed_on         text,
  add column if not exists reference_number text,
  add column if not exists court            text,
  add column if not exists liability_cents  bigint,
  add column if not exists asset_cents      bigint,
  add column if not exists exempt_cents     bigint,
  -- Inquiries
  add column if not exists inquiry_date     text,
  add column if not exists inquiry_type     text;

/**
 * The date the record was filed or first reported, as the source states it.
 *
 * Deliberately NOT folded into `open_date`. A bankruptcy's filing date is the
 * date § 1681c(a)(1)'s ten years runs from, and a tradeline's opening date is
 * a different fact with a different consequence. One column doing both would
 * make an obsolescence rule read the wrong number.
 */
comment on column public.report_item_bureau_values.filed_on is
  'Public record: date filed or reported, verbatim. Never conflated with open_date — the ten-year period runs from the FILING date, not the discharge and not an account opening.';

comment on column public.report_item_bureau_values.reference_number is
  'Public record: docket or case reference as printed. Not an account number, and never stored in account_number_masked.';

comment on column public.report_item_bureau_values.court is
  'Public record: the court as the source names it, verbatim. Never normalised — two bureaus naming the same court differently is a fact worth keeping.';

comment on column public.report_item_bureau_values.liability_cents is
  'Public record: liability as stated. Absent means the source did not state one, never zero.';

comment on column public.report_item_bureau_values.asset_cents is
  'Public record: asset amount as stated. Absent means the source did not state one, never zero.';

comment on column public.report_item_bureau_values.exempt_cents is
  'Public record: exempt amount as stated. Absent means the source did not state one, never zero.';

comment on column public.report_item_bureau_values.inquiry_date is
  'Inquiry: the date of the enquiry as stated. Separate from filed_on so neither section borrows the other''s meaning.';

/**
 * Hard, soft, promotional, account review — ONLY where the source says so.
 *
 * NULL is UNKNOWN and must stay unknown. It is never inferred from the
 * subscriber's name, the section, or recency. Section J's twenty-four-month
 * retention rule applies to hard inquiries, so on a source that does not state
 * the type that rule returns UNKNOWN rather than assuming every enquiry is
 * hard and disputing half a healthy file.
 */
comment on column public.report_item_bureau_values.inquiry_type is
  'Inquiry type ONLY where the source states it. Null is UNKNOWN — never inferred from a creditor name, a section, or recency.';

-- ── The writer carries them ──────────────────────────────────────────────
--
-- Verified against `pg_get_functiondef` on the live database first. The live
-- function is **security invoker** and stays that way.
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
