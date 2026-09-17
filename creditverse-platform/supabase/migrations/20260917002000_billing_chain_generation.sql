-- The canonical billing chain, part 1: generation, due dates, collection.
--
-- Dee's architecture brief, 2026-09-17: "FullSuite owns the billing lifecycle.
-- Payment providers only execute payment." The §40 acceptance probe found
-- eight places where that was not yet true. Three of them are here; the
-- integrity holes and the delivery gap follow in 002100 and 002200.
--
-- Each is a measured failure from `billing-architecture-probe.mjs`, not a
-- reading of the code.

-- ── 17a · Pausing a SERVICE did not stop billing ──────────────────────────
--
-- The sweep filtered on `partner_service_billing.billing_status`, never on the
-- service's own status. So a service moved to `paused`, `cancelled`, `ended`
-- or `completed` kept raising invoices every month, because its billing terms
-- were still marked active — and nothing in the pause flow closes them.
--
-- Dee §30: "If Partner service pauses/cancels: recurring invoice generation
-- stops according to effective date." Probe 17a proved it did not.

create or replace function public.billing_recurring_sweep()
returns table (invoices_created integer, terms_without_rate integer)
language plpgsql
security definer
set search_path to 'public'
as $$
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
       /* The service itself must still be running. Billing terms outlive a
          pause — nothing closes them when somebody pauses the work — so the
          terms alone were never the right question. */
       and ps.status = 'active'
       and bm.recurring
       and coalesce(sb.rate_cents, 0) > 0
       and sb.effective_from <= current_date
       and (sb.effective_to is null or sb.effective_to >= current_date)
       and g.archived_at is null
       and not g.is_fixture
       /* A suspended or archived partner is not invoiced again while their
          work is held. Their existing invoices stand. */
       and g.lifecycle not in ('suspended', 'archived')
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
end $$;

comment on function public.billing_recurring_sweep() is
  'The ONE recurring invoice engine. Generates at most one invoice per billing term per cycle key, for services that are still active, on partners that are not suspended or archived. Safe to run repeatedly: the (billing_id, period_key) unique index is the idempotency.';

-- ── E · A manual invoice could be born already overdue ────────────────────
--
-- `billing_period_due` clamps a generated invoice's due date to its issue
-- date. Manual creation goes through the browser and had no such rule, so
-- `partner_invoices` accepted a due date thirty days before the invoice
-- existed — instantly overdue, instantly in the reminder sweep, instantly on
-- its way to suspending a partner who had never been asked to pay.
--
-- Dee §20: "Due date must never precede issue date." Now it cannot, for any
-- path, because it is a constraint rather than a policy.

alter table public.partner_invoices drop constraint if exists partner_invoices_due_after_issue_ck;
alter table public.partner_invoices add constraint partner_invoices_due_after_issue_ck
  check (due_date >= issue_date);

comment on constraint partner_invoices_due_after_issue_ck on public.partner_invoices is
  'Dee §20. The generator already clamped this; the constraint makes it true for the manual path and every future one.';

-- ── H · An invoice could not say how it expects to be paid ────────────────
--
-- `partner_invoices.payment_provider` exists and is null on all 11 invoices —
-- an unused column. Dee §9 wants every invoice to resolve one collection path:
-- manual · card_one_time · card_on_file · autopay · paypal · wise.
--
-- Derived, not stored. A stored method would be a second truth that drifts the
-- moment a partner saves a card or switches autopay off — and Dee's own rule
-- for `overdue` in §4 is the same rule: "avoids a second status drifting from
-- reality."

create or replace function public.invoice_collection_method(p_invoice uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    /* Nothing is collected from an invoice that is not asking for money. */
    when i.status in ('draft', 'scheduled', 'void', 'cancelled', 'paid', 'refunded') then 'none'
    when pp.autopay_enabled then 'autopay'
    when pp.id is not null then 'card_on_file'
    when exists (select 1 from public.partner_payment_methods m
                  where m.group_id = i.group_id and m.enabled
                    and m.method in ('authorize_net_pay_now', 'authorize_net_autopay')) then 'card_one_time'
    when exists (select 1 from public.partner_payment_methods m
                  where m.group_id = i.group_id and m.enabled and m.method = 'paypal') then 'paypal'
    when exists (select 1 from public.partner_payment_methods m
                  where m.group_id = i.group_id and m.enabled and m.method = 'wise') then 'wise'
    else 'manual'
  end
    from public.partner_invoices i
    left join public.partner_payment_profiles pp on pp.group_id = i.group_id and pp.is_default
   where i.id = p_invoice
$$;

comment on function public.invoice_collection_method(uuid) is
  'How this invoice is expected to be paid: none · autopay · card_on_file · card_one_time · paypal · wise · manual. DERIVED from the partner''s current arrangement, so it cannot drift from it (Dee §9).';

grant execute on function public.invoice_collection_method(uuid) to authenticated;

/* The unused column is retired in name rather than dropped: it is referenced
   by nothing, and dropping a column on a money table to tidy a report is not
   worth the migration. This says plainly that it is not the answer. */
comment on column public.partner_invoices.payment_provider is
  'LEGACY, unused and null on every row. The collection method is derived by invoice_collection_method(); do not start writing here.';
