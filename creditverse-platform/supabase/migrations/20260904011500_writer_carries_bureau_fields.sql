-- 0137 — The writer carries the six fields 0136 added.
--
-- Separate from 0136 because 0136 was already applied when the writer change
-- was written. Two migrations for one logical step, which is the honest way
-- round: re-editing an applied file would leave the live function unchanged
-- while the file claimed otherwise.
--
-- Verified against `pg_get_functiondef` on the live database first, as
-- CLAUDE.md requires. The live function is **security invoker**; the 0085
-- draft was once transcribed as `security definer`, which would have quietly
-- escalated its privileges. This is the live body plus six columns.

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

  /* Two statements, not one data-modifying CTE: a CTE's inserted rows share
     the statement's snapshot, so the child's WITH CHECK sub-select would find
     no parent and refuse every row. */
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

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $$;
revoke execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_credit_report(uuid, uuid, uuid, uuid, text[], date, text, uuid, text, jsonb, jsonb) to authenticated;
