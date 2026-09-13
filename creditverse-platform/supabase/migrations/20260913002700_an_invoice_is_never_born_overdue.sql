-- =============================================================================
-- An invoice cannot be due before it was issued.
--
-- The recurring sweep ran for the first time this morning and generated five
-- real invoices — correctly, from the right terms, for the right amounts — and
-- dated them due in the PAST. A weekly agreement billed on "Monday" got the
-- Monday of the current week, which by Saturday is six days gone. The invoice
-- was therefore born overdue, and the reminder sweep immediately queued Day 1,
-- Day 2, Day 3 and the Day 5 warning for it: four escalating notices, in one
-- batch, about an invoice raised that morning.
--
-- Nothing reached a partner — the emails were caught in the outbox — but that
-- was luck of timing, not design.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
--
-- The billing day says WHEN IN THE CYCLE payment is due. It cannot reach
-- backwards past the day the invoice exists. So the due date is the later of
-- the two: the configured day, or the issue date. A partner billed on a
-- Monday, invoiced on a Saturday, gets a Saturday due date this once and a
-- Monday due date every week after — which is what "due on Monday" means to a
-- human, and is never a demand for money before the bill.
-- =============================================================================

create or replace function public.billing_period_due(
  p_model text, p_invoice_day text, p_start date, p_issued date default current_date
) returns date
language plpgsql immutable set search_path = public as $function$
declare
  v_end date;
  v_due date;
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
    v_due := p_start + ((v_dow + 6) % 7);
  else
    v_due := v_end;
  end if;

  /* The billing day says when in the cycle payment falls due. It does not
     reach back past the day the invoice exists. */
  return greatest(v_due, coalesce(p_issued, current_date));
end $function$;

/* The three-argument form is dropped rather than left beside this one: a
   defaulted parameter creates an OVERLOAD, and an ambiguous call is how
   inviting anybody broke on 2026-09-13. */
drop function if exists public.billing_period_due(text, text, date);

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
    v_due   := public.billing_period_due(r.billing_model, r.invoice_day, v_start, current_date);

    continue when v_start > current_date;

    insert into public.partner_invoices
      (agency_id, group_id, billing_id, period_key, invoice_number, issue_date, due_date,
       currency, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents,
       status, notes, sent_at)
    values (r.agency_id, r.group_id, r.billing_id, v_key,
            public.next_invoice_number(r.agency_id), current_date, v_due,
            coalesce(r.currency, 'USD'), r.rate_cents, 0, 0, r.rate_cents, 0,
            'sent', 'Generated automatically for ' || v_key, now())
    on conflict (billing_id, period_key) where billing_id is not null and period_key is not null
    do nothing
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
