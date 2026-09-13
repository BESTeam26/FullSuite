-- =============================================================================
-- `on conflict` has to repeat a partial index's predicate.
--
-- The uniqueness that makes the recurring sweep safe lives in a PARTIAL index
-- — `where billing_id is not null and period_key is not null` — because a
-- one-off invoice has neither and must not collide with anything. Postgres
-- cannot infer a partial index from the columns alone, so the insert failed
-- outright:
--
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT
--
-- Caught by the probe on the first run, before any invoice existed to be
-- duplicated.
-- =============================================================================

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

    continue when v_start > current_date;

    insert into public.partner_invoices
      (agency_id, group_id, billing_id, period_key, invoice_number, issue_date, due_date,
       currency, subtotal_cents, discount_cents, tax_cents, total_cents, amount_paid_cents,
       status, notes, sent_at)
    values (r.agency_id, r.group_id, r.billing_id, v_key,
            public.next_invoice_number(r.agency_id), current_date, v_due,
            coalesce(r.currency, 'USD'), r.rate_cents, 0, 0, r.rate_cents, 0,
            'sent', 'Generated automatically for ' || v_key, now())
    /* The predicate is repeated so Postgres can match the partial index. */
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
