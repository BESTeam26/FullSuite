-- The canonical billing chain, part 3: an invoice that is actually sent, and
-- a missing billing contact that is flagged before it costs anything.
--
-- ── G · AN ISSUED INVOICE WAS NEVER EMAILED TO ANYBODY ────────────────────
--
-- `billing_email_outbox.kind` allowed 'reminder', 'receipt' and 'reactivated'.
-- There was no 'invoice'. The recurring sweep writes `status = 'sent'` and
-- `sent_at = now()` — but nothing was ever sent. The first thing a partner
-- heard about an invoice was the Day 1 overdue reminder.
--
-- Dee §25: "Issuing/sending an invoice should use one canonical delivery
-- event… Resending invoice should not create another invoice. It creates
-- another delivery attempt."
--
-- So: one more kind, one function that queues a delivery, and a dedupe key
-- that makes a RESEND a deliberate new attempt rather than an accident.

alter table public.billing_email_outbox drop constraint if exists billing_email_outbox_kind_check;
alter table public.billing_email_outbox add constraint billing_email_outbox_kind_check
  check (kind in ('reminder', 'receipt', 'reactivated', 'invoice'));

create or replace function public.queue_invoice_email(p_invoice uuid, p_attempt integer default 1)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  i   public.partner_invoices%rowtype;
  v_to record;
  v_name text;
  v_state text;
  v_id uuid;
begin
  select * into i from public.partner_invoices where id = p_invoice;
  if i.id is null then raise exception 'That invoice does not exist' using errcode = '22023'; end if;
  /* A draft has not been issued and a void one is not owed. Neither is sent. */
  if i.status in ('draft', 'void', 'cancelled') then
    raise exception 'An invoice that is % is not sent', i.status using errcode = '22023';
  end if;

  select * into v_to from public.partner_billing_email(i.group_id);
  select name into v_name from public.outsourcing_groups where id = i.group_id;

  /* No destination is not a failure to retry — it is a configuration problem
     for a person, and `unavailable` is what puts it in Billing Attention.
     Dee §8: "email delivery must not pretend success." */
  v_state := case when v_to.email is null then 'unavailable' else 'pending' end;

  insert into public.billing_email_outbox
    (agency_id, group_id, kind, invoice_id, to_email, to_name, subject, payload, state, dedupe_key)
  values (i.agency_id, i.group_id, 'invoice', i.id, v_to.email, v_to.name,
          'Invoice ' || i.invoice_number || ' from BES',
          jsonb_build_object(
            'partner_name', v_name,
            'invoice_number', i.invoice_number,
            'issue_date', i.issue_date,
            'due_date', i.due_date,
            'currency', coalesce(i.currency, 'USD'),
            'total_cents', i.total_cents,
            'balance_cents', public.invoice_balance_cents(i.id),
            'collection_method', public.invoice_collection_method(i.id),
            'lines', coalesce((select jsonb_agg(jsonb_build_object(
                        'description', l.description, 'quantity', l.quantity,
                        'amount_cents', l.amount_cents) order by l.sort)
                      from public.partner_invoice_lines l where l.invoice_id = i.id), '[]'::jsonb)),
          v_state,
          /* The attempt is part of the key, so a resend is a NEW delivery of
             the SAME invoice — never a second invoice, and never a silent
             no-op that leaves Finance thinking it went out. */
          'invoice:' || i.id::text || ':' || p_attempt::text)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end $$;

comment on function public.queue_invoice_email(uuid, integer) is
  'One canonical invoice delivery event. A resend is a new attempt number against the same invoice (Dee §25). No destination means state=unavailable, which surfaces in Billing Attention rather than pretending success.';

revoke all on function public.queue_invoice_email(uuid, integer) from public;
grant execute on function public.queue_invoice_email(uuid, integer) to authenticated;

/* The generator now sends what it raises. Same function, one line added. */
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
       and ps.status = 'active'
       and bm.recurring
       and coalesce(sb.rate_cents, 0) > 0
       and sb.effective_from <= current_date
       and (sb.effective_to is null or sb.effective_to >= current_date)
       and g.archived_at is null
       and not g.is_fixture
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

      /* The invoice is now actually delivered, rather than marked sent and
         first heard of as an overdue reminder. */
      perform public.queue_invoice_email(v_invoice, 1);

      perform public.log_audit('partner.invoice_generated', 'partner_invoice', v_invoice::text, null, null,
        jsonb_build_object('partner', r.group_id, 'period', v_key, 'amount_cents', r.rate_cents,
                           'due', v_due, 'billing', r.billing_id));
      v_invoice := null;
    end if;
  end loop;

  return query select v_created, v_norate;
end $$;

-- ── 14a · A missing billing contact was invisible until an email failed ───
--
-- `billing_attention` derived `missing_billing_email` from an outbox row in
-- state `unavailable` — so a partner with no billing contact appeared only
-- AFTER something had already tried to write to them and failed. A partner who
-- had never been emailed was owed money with nowhere to send the bill, and
-- nothing said so.
--
-- Dee §8: "If none: Missing Billing Contact must appear in Billing Attention."
-- Now it appears because the contact is missing, not because a send failed.

create or replace view public.billing_attention
with (security_invoker = true) as
  select * from (
    select 'suspended_nonpayment'::text as kind,
           'Suspended Due To Non-Payment'::text as label,
           'critical'::text as severity,
           s.group_id, g.name as partner_name, g.agency_id,
           null::uuid as invoice_id, null::text as invoice_number,
           coalesce((select sum(public.invoice_balance_cents(i.id))
                       from public.partner_suspension_invoices si
                       join public.partner_invoices i on i.id = si.invoice_id
                      where si.suspension_id = s.id), 0)::numeric as amount_cents,
           s.suspended_at as since,
           coalesce(s.detail, 'Suspended for nonpayment') as detail
      from public.partner_suspensions s
      join public.outsourcing_groups g on g.id = s.group_id
     where s.lifted_at is null

    union all
    select 'final_reminder_sent', 'Billing Attention Required', 'high',
           r.group_id, g.name, r.agency_id, r.invoice_id, i.invoice_number,
           public.invoice_balance_cents(r.invoice_id)::numeric, r.sent_at,
           'Final reminder sent ' || r.days_overdue || ' days past due'
      from public.partner_invoice_reminders r
      join public.partner_invoices i on i.id = r.invoice_id
      join public.outsourcing_groups g on g.id = r.group_id
     where r.stage = 'day_7_final'
       and public.invoice_balance_cents(r.invoice_id) > 0
       and not public.partner_is_suspended(r.group_id)

    union all
    select 'past_due', 'Billing Attention Required', 'medium',
           i.group_id, g.name, i.agency_id, i.id, i.invoice_number,
           public.invoice_balance_cents(i.id)::numeric, i.due_date::timestamptz,
           (current_date - i.due_date) || ' days past due'
      from public.partner_invoices i
      join public.outsourcing_groups g on g.id = i.group_id
     where i.status in ('sent', 'partially_paid', 'overdue')
       and i.due_date < current_date
       and public.invoice_balance_cents(i.id) > 0
       and not exists (select 1 from public.partner_invoice_reminders r
                        where r.invoice_id = i.id and r.stage = 'day_7_final')

    union all
    /* CHANGED: asked of the PARTNER, not of a failed send. A partner with
       money owed and no resolvable billing email is a problem the moment the
       invoice exists, not the moment an email bounces off nothing. */
    select 'missing_billing_email', 'Billing Attention Required', 'high',
           g.id, g.name, g.agency_id, null::uuid, null::text,
           coalesce((select sum(public.invoice_balance_cents(i.id))
                       from public.partner_invoices i
                      where i.group_id = g.id
                        and i.status in ('sent', 'partially_paid', 'overdue')), 0)::numeric,
           g.created_at,
           'No billing email — invoices and reminders cannot be delivered'
      from public.outsourcing_groups g
     where g.archived_at is null
       and not g.is_fixture
       and not exists (select 1 from public.partner_billing_email(g.id))
       and exists (select 1 from public.partner_invoices i
                    where i.group_id = g.id
                      and i.status in ('sent', 'partially_paid', 'overdue')
                      and public.invoice_balance_cents(i.id) > 0)

    union all
    /* Kept as well: a delivery that actually failed is its own fact, and it
       can happen to a partner whose email resolves but is wrong. */
    select 'delivery_failed', 'Billing Attention Required', 'high',
           o.group_id, g.name, o.agency_id, o.invoice_id,
           (select invoice_number from public.partner_invoices where id = o.invoice_id),
           0::numeric, o.created_at,
           'Delivery ' || o.state || coalesce(' · ' || o.last_error, '')
      from public.billing_email_outbox o
      join public.outsourcing_groups g on g.id = o.group_id
     where o.state in ('unavailable', 'failed')

    union all
    select 'payment_matching_review', 'Billing Attention Required', 'high',
           p.group_id, g.name, p.agency_id, null::uuid, null::text,
           p.amount_cents::numeric, p.created_at,
           'Payment of ' || to_char(p.amount_cents / 100.0, 'FM999G999D00') || ' with no invoice'
      from public.partner_payments p
      join public.outsourcing_groups g on g.id = p.group_id
     where p.reconciliation_state = 'review_required' and p.status = 'succeeded'

    union all
    select 'billing_terms_missing_rate', 'Billing Configuration Required', 'medium',
           ps.group_id, g.name, sb.agency_id, null::uuid, null::text,
           0::numeric, sb.effective_from::timestamptz,
           'A live service has no billing rate, so it invoices nothing'
      from public.partner_service_billing sb
      join public.partner_services ps on ps.id = sb.service_id
      join public.outsourcing_groups g on g.id = ps.group_id
     where sb.billing_status = 'active' and sb.superseded_by is null
       and ps.status = 'active'
       and coalesce(sb.rate_cents, 0) = 0

    union all
    /* NEW: an unresolved charge is money that may or may not have moved.
       Nothing retries it automatically, so a person has to look. */
    select 'payment_unknown', 'Billing Attention Required', 'critical',
           c.group_id, g.name, c.agency_id, c.invoice_id,
           (select invoice_number from public.partner_invoices where id = c.invoice_id),
           c.amount_cents::numeric, c.created_at,
           'A card charge got no answer — confirm it at the processor before retrying'
      from public.partner_card_charges c
      join public.outsourcing_groups g on g.id = c.group_id
     where c.status = 'unknown'

    union all
    /* NEW: the most recent card attempt failed, so autopay will not collect. */
    select 'autopay_failed', 'Billing Attention Required', 'high',
           c.group_id, g.name, c.agency_id, c.invoice_id,
           (select invoice_number from public.partner_invoices where id = c.invoice_id),
           c.amount_cents::numeric, c.created_at,
           coalesce(c.response_text, 'The saved card was not accepted')
      from (select distinct on (group_id) * from public.partner_card_charges
             order by group_id, created_at desc) c
      join public.outsourcing_groups g on g.id = c.group_id
     where c.status in ('declined', 'error')
  ) rows;

comment on view public.billing_attention is
  'Every billing exception that needs a person, derived from canonical records only. A row disappears the moment the underlying fact is corrected — there is no exception table to keep in step (Dee §28).';

grant select on public.billing_attention to authenticated;
