-- =============================================================================
-- FullSuite generates the recurring invoices, from the terms already recorded.
--
-- Dee: "recurring invoices should be generated from canonical billing
-- schedules, with a unique schedule-period key so the same weekly/monthly
-- cycle cannot create duplicates."
--
-- ── THE PERIOD KEY IS THE WHOLE SAFETY MECHANISM ────────────────────────────
--
-- `2026-W38` for a weekly agreement, `2026-09` for a monthly one, unique per
-- billing row. A sweep that runs hourly, twice at once, or is replayed after a
-- crash produces ONE invoice for that week — because the second insert is
-- refused by a unique index rather than avoided by a check somebody has to
-- remember to write. It is also readable: when a partner asks which week an
-- invoice was for, the answer is on the invoice.
--
-- ── GENERATION IS NOT COLLECTION ────────────────────────────────────────────
--
-- Dee: "Recurring invoice creation and automatic collection are separate.
-- Wise Personal or PayPal Personal can still have automatically generated
-- invoices even if the actual payment must be manually reconciled." So this
-- sweep never charges anything. It writes an invoice and lets the partner see
-- it; what collects it — AutoPay later, a Wise transfer today — is a separate
-- question this function deliberately does not ask.
--
-- ── WHAT IT REFUSES TO GUESS ────────────────────────────────────────────────
--
-- A billing row with no rate cannot become an invoice, and inventing one would
-- bill a partner an amount nobody agreed. Those rows are SURFACED in
-- `billing_terms_needing_rate` instead — there is one in production today.
-- =============================================================================

alter table public.partner_invoices
  add column if not exists billing_id uuid references public.partner_service_billing(id) on delete set null,
  add column if not exists period_key text;

comment on column public.partner_invoices.period_key is
  'Which billing cycle this invoice covers — `2026-W38`, `2026-09`. Unique per billing row, which is what makes the recurring sweep safe to run twice (2026-09-13).';

create unique index if not exists partner_invoices_one_per_period
  on public.partner_invoices (billing_id, period_key)
  where billing_id is not null and period_key is not null;

/**
 * Which cycle a date falls in, as a readable key.
 *
 * Weeks are ISO weeks, so the key does not change meaning at a year boundary
 * — `2026-W01` is the same seven days whichever way you count into January.
 */
create or replace function public.billing_period_key(p_model text, p_on date)
returns text
language sql immutable set search_path = public as $function$
  select case p_model
    when 'RECURRING_WEEKLY'    then to_char(p_on, 'IYYY-"W"IW')
    when 'RECURRING_BIWEEKLY'  then to_char(p_on, 'IYYY') || '-B'
                                  || lpad((((extract(week from p_on)::int - 1) / 2) + 1)::text, 2, '0')
    when 'RECURRING_MONTHLY'   then to_char(p_on, 'YYYY-MM')
    when 'RETAINER'            then to_char(p_on, 'YYYY-MM')
    when 'RECURRING_QUARTERLY' then to_char(p_on, 'YYYY-"Q"Q')
    when 'RECURRING_ANNUAL'    then to_char(p_on, 'YYYY')
    else null
  end
$function$;

/** The first day of the cycle `p_on` falls in. */
create or replace function public.billing_period_start(p_model text, p_on date)
returns date
language sql immutable set search_path = public as $function$
  select case p_model
    when 'RECURRING_WEEKLY'    then date_trunc('week', p_on)::date
    when 'RECURRING_BIWEEKLY'  then date_trunc('week', p_on)::date
                                    - (case when ((extract(week from p_on)::int - 1) % 2) = 1 then 7 else 0 end)
    when 'RECURRING_MONTHLY'   then date_trunc('month', p_on)::date
    when 'RETAINER'            then date_trunc('month', p_on)::date
    when 'RECURRING_QUARTERLY' then date_trunc('quarter', p_on)::date
    when 'RECURRING_ANNUAL'    then date_trunc('year', p_on)::date
    else null
  end
$function$;

/**
 * When the invoice for a cycle is due.
 *
 * `invoice_day` is free text somebody typed — "Monday", "Every Friday", "End
 * of the month", "Every other Monday". It is read for a weekday name or for
 * "end", and anything it cannot read falls back to the last day of the cycle
 * rather than to a guess: a due date invented from an unreadable note is how a
 * partner is chased four days early.
 */
create or replace function public.billing_period_due(
  p_model text, p_invoice_day text, p_start date
) returns date
language plpgsql immutable set search_path = public as $function$
declare
  v_end date;
  v_txt text := lower(coalesce(p_invoice_day, ''));
  v_dow int;
begin
  v_end := case p_model
    when 'RECURRING_WEEKLY'    then p_start + 6
    when 'RECURRING_BIWEEKLY'  then p_start + 13
    when 'RECURRING_MONTHLY'   then (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    when 'RETAINER'            then (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    when 'RECURRING_QUARTERLY' then (date_trunc('quarter', p_start) + interval '3 months - 1 day')::date
    when 'RECURRING_ANNUAL'    then (date_trunc('year', p_start) + interval '1 year - 1 day')::date
    else p_start
  end;

  v_dow := case
    when v_txt like '%monday%'    then 1 when v_txt like '%tuesday%'  then 2
    when v_txt like '%wednesday%' then 3 when v_txt like '%thursday%' then 4
    when v_txt like '%friday%'    then 5 when v_txt like '%saturday%' then 6
    when v_txt like '%sunday%'    then 0 else null
  end;

  if v_dow is not null and p_model in ('RECURRING_WEEKLY', 'RECURRING_BIWEEKLY') then
    /* The named weekday inside this cycle. `date_trunc('week')` is Monday. */
    return p_start + ((v_dow + 6) % 7);
  end if;

  return v_end;
end $function$;

/** Terms nobody can invoice, surfaced rather than skipped in silence. */
create or replace view public.billing_terms_needing_rate as
  select sb.id, g.name as partner_name, sb.billing_model, sb.payment_frequency,
         sb.currency, sb.effective_from
    from public.partner_service_billing sb
    join public.partner_services ps on ps.id = sb.service_id
    join public.outsourcing_groups g on g.id = ps.group_id
    join public.partner_billing_models bm on bm.code = sb.billing_model
   where sb.billing_status = 'active'
     and sb.superseded_by is null
     and bm.recurring
     and public.billing_period_key(sb.billing_model, current_date) is not null
     and coalesce(sb.rate_cents, 0) <= 0;

alter view public.billing_terms_needing_rate set (security_invoker = true);
comment on view public.billing_terms_needing_rate is
  'Recurring billing terms with no rate. They cannot become an invoice and are shown rather than skipped quietly — inventing an amount would bill a partner something nobody agreed (2026-09-13).';
grant select on public.billing_terms_needing_rate to authenticated;

/**
 * Generate this cycle's invoices.
 *
 * Only for terms that are active, not superseded, in effect, recurring, and
 * carry a rate. The period key does the rest.
 */
create or replace function public.billing_recurring_sweep()
returns table(invoices_created integer, terms_without_rate integer)
language plpgsql security definer set search_path = public as $function$
declare
  v_created int := 0;
  v_norate int;
  r record;
  v_start date;
  v_key text;
  v_due date;
  v_invoice uuid;
begin
  select count(*) into v_norate from public.billing_terms_needing_rate;

  for r in
    select sb.id as billing_id, sb.service_id, sb.billing_model, sb.invoice_day,
           sb.rate_cents, sb.currency, ps.group_id, g.agency_id, ps.service_type
      from public.partner_service_billing sb
      join public.partner_services ps on ps.id = sb.service_id
      join public.outsourcing_groups g on g.id = ps.group_id
      join public.partner_billing_models bm on bm.code = sb.billing_model
     where sb.billing_status = 'active'
       and sb.superseded_by is null
       and bm.recurring
       and coalesce(sb.rate_cents, 0) > 0
       and sb.effective_from <= current_date
       and (sb.effective_to is null or sb.effective_to >= current_date)
       and g.archived_at is null
       and not g.is_fixture
       and public.billing_period_key(sb.billing_model, current_date) is not null
  loop
    v_start := public.billing_period_start(r.billing_model, current_date);
    v_key   := public.billing_period_key(r.billing_model, current_date);
    v_due   := public.billing_period_due(r.billing_model, r.invoice_day, v_start);

    /* Nothing is generated before its cycle has started. */
    continue when v_start > current_date;

    insert into public.partner_invoices
      (agency_id, group_id, billing_id, period_key, invoice_number, issue_date, due_date,
       currency, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents,
       status, notes, sent_at)
    values (r.agency_id, r.group_id, r.billing_id, v_key,
            public.next_invoice_number(r.agency_id), current_date, v_due,
            coalesce(r.currency, 'USD'), r.rate_cents, 0, 0, r.rate_cents, 0,
            'sent', 'Generated automatically for ' || v_key, now())
    on conflict (billing_id, period_key) do nothing
    returning id into v_invoice;

    if v_invoice is not null then
      insert into public.partner_invoice_lines
        (invoice_id, service_id, description, quantity, unit_label, unit_amount_cents, amount_cents, sort)
      values (v_invoice, r.service_id,
              coalesce(r.service_type, 'Services') || ' · ' || v_key,
              1, 'cycle', r.rate_cents, r.rate_cents, 10);
      v_created := v_created + 1;

      perform public.log_audit('partner.invoice_generated', 'partner_invoice', v_invoice::text, null, null,
        jsonb_build_object('partner', r.group_id, 'period', v_key, 'amount_cents', r.rate_cents,
                           'due', v_due, 'billing', r.billing_id));
      v_invoice := null;
    end if;
  end loop;

  return query select v_created, v_norate;
end $function$;
revoke execute on function public.billing_recurring_sweep() from public, anon;
grant execute on function public.billing_recurring_sweep() to authenticated;

/* Daily, early. A cycle that started overnight is invoiced before anybody is
   at their desk, and running it twice is harmless by construction. */
select cron.unschedule('billing-recurring-sweep') where exists (
  select 1 from cron.job where jobname = 'billing-recurring-sweep');
select cron.schedule('billing-recurring-sweep', '10 5 * * *',
  $cron$ select public.billing_recurring_sweep() $cron$);
