-- 0085 — The credit limit an account actually states
--
-- Utilization is the fastest-moving score factor and the one clients are told
-- to act on, and it needs a limit. Until now no importer captured one, so the
-- analysis assumed $5,000 per open card — a percentage, and paydown advice,
-- built on a number nobody reported. That assumption is gone (see
-- `scoreUtilization`); this migration gives the limit somewhere to live so the
-- figure can be real instead of absent.
--
-- Nullable on purpose: a report that does not state a limit must keep saying
-- so. An account with no limit is left out of the calculation, never filled in.

alter table public.report_items
  add column if not exists credit_limit_text  text,
  add column if not exists credit_limit_cents bigint;

comment on column public.report_items.credit_limit_cents is
  'The limit as printed on the report. Null means the report did not state one — never an assumption.';

-- Verified against `pg_get_functiondef` on the live database before applying,
-- and the check earned its keep: the first draft of this file was transcribed
-- from the 0048 migration and said `security definer`, while the live function
-- is **security invoker**. Applying that would have quietly escalated this
-- function's privileges. The body below is the live one, with only the two new
-- columns added.
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

  insert into public.report_items
    (report_id, position, kind, name, subtype, status, balance_text, balance_cents,
     credit_limit_text, credit_limit_cents,
     bureaus, dofd, open_date, linked_creditor, remarks, account_ref, raw)
  select v_id, (ord - 1)::int,
         i->>'kind', i->>'name', i->>'subtype', i->>'status', i->>'balance_text',
         nullif(i->>'balance_cents','')::bigint,
         i->>'credit_limit_text',
         nullif(i->>'credit_limit_cents','')::bigint,
         array(select jsonb_array_elements_text(coalesce(i->'bureaus','[]'::jsonb))),
         i->>'dofd', i->>'open_date', i->>'linked_creditor', i->>'remarks',
         coalesce(nullif(i->>'account_ref',''), lower(i->>'name')),
         i->'raw'
    from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  if p_scores is not null and jsonb_typeof(p_scores) = 'array' then
    insert into public.report_scores (report_id, bureau, model, score)
    select v_id, s->>'bureau', s->>'model', (s->>'score')::int
      from jsonb_array_elements(p_scores) as s;
  end if;
  return v_id;
end $$;
