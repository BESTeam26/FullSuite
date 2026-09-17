-- The canonical billing chain, part 2: the ledger cannot be written by hand.
--
-- Three holes the §40 probe found, all of the same shape: a figure that is
-- supposed to be DERIVED from the ledger could be set directly instead.
--
-- Dee §5: "Never manually type amount_paid as an independent truth."
-- Dee §14: "Payment must be immutable in principle."
-- Dee §36: "Agency Admin alone does NOT imply money access."

-- ── F · An invoice could be marked paid with no payment behind it ─────────
--
-- `partner_invoices` grants UPDATE to anybody holding `partners.invoices.manage`,
-- and nothing stopped that update touching `amount_paid_cents` or `status`.
-- Probe F set an invoice to paid with no payment row and the balance went to
-- zero — the invoice disappeared from receivables, from the reminder sweep and
-- from the ageing, and the money was never collected.
--
-- Those two columns now belong to `partner_invoice_recompute` alone. It
-- announces itself with a transaction-local setting; any other writer is
-- refused, whatever capability they hold.

create or replace function public.partner_invoices_guard_derived()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  /* `true` means the recompute is running. `current_setting(..., true)`
     returns null rather than raising when the setting has never been set. */
  if coalesce(current_setting('bes.recomputing_invoice', true), '') = new.id::text then
    return new;
  end if;

  if new.amount_paid_cents is distinct from old.amount_paid_cents then
    raise exception
      'An invoice''s paid total is derived from its payments and cannot be set directly. Record a payment, or apply account credit.'
      using errcode = '42501';
  end if;

  /* Status follows the money, with two exceptions a person genuinely makes:
     issuing a draft, and voiding or cancelling an invoice. */
  if new.status is distinct from old.status
     and not (old.status = 'draft' and new.status in ('scheduled', 'sent'))
     and not (new.status in ('void', 'cancelled'))
     and not (old.status in ('void', 'cancelled')) then
    raise exception
      'An invoice''s payment status is derived from its payments. Record a payment, or void the invoice.'
      using errcode = '42501';
  end if;

  return new;
end $$;

comment on function public.partner_invoices_guard_derived() is
  'Refuses any direct write to amount_paid_cents, and to status except issuing a draft or voiding. Those figures belong to partner_invoice_recompute, which announces itself with bes.recomputing_invoice.';

drop trigger if exists partner_invoices_guard_derived on public.partner_invoices;
create trigger partner_invoices_guard_derived
  before update on public.partner_invoices
  for each row execute function public.partner_invoices_guard_derived();

/* The recompute, unchanged in what it computes — it now says who it is. */
create or replace function public.partner_invoice_recompute(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_paid bigint;
  v_total bigint;
  v_status public.partner_invoice_status;
  v_due date;
  v_current public.partner_invoice_status;
begin
  if p_invoice is null then return; end if;

  select total_cents, due_date, status into v_total, v_due, v_current
    from public.partner_invoices where id = p_invoice;
  if not found then return; end if;

  select coalesce(sum(case when status = 'succeeded'
                           then greatest(amount_cents - refund_amount_cents, 0)
                           else 0 end), 0)
    into v_paid
    from public.partner_payments where invoice_id = p_invoice;

  /* An invoice records what it was OWED. Anything beyond that is the
     partner's money on account, and counting it here as well would put the
     same cents in two places. */
  if v_total > 0 then
    v_paid := least(v_paid, v_total);
  end if;

  v_status := case
    when v_current in ('void', 'cancelled') then v_current
    when v_total > 0 and v_paid >= v_total then 'paid'
    when v_paid > 0 then 'partially_paid'
    when v_current = 'draft' then 'draft'
    when v_current = 'scheduled' then 'scheduled'
    when v_due < current_date then 'overdue'
    else 'sent'
  end;

  /* Transaction-local, and the invoice's own id: the guard trigger will let
     THIS row through and nothing else, even inside the same statement. */
  perform set_config('bes.recomputing_invoice', p_invoice::text, true);

  update public.partner_invoices
     set amount_paid_cents = v_paid,
         status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
   where id = p_invoice;

  perform set_config('bes.recomputing_invoice', '', true);
end $$;

-- ── 11c · A void invoice could still be paid ──────────────────────────────
--
-- The card path refuses it. `record_partner_payment` did not, so a manual Wise
-- or PayPal payment could be recorded against a cancelled invoice — money
-- attached to a debt that no longer exists, and an invoice whose status says
-- void while its balance says settled.

create or replace function public.record_partner_payment(
  p_group uuid, p_amount_cents bigint, p_provider public.partner_payment_provider,
  p_invoice uuid default null, p_paid_on date default current_date,
  p_reference text default null, p_note text default null, p_currency text default 'USD')
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  i public.partner_invoices%rowtype;
  v_id uuid;
  v_state text;
  v_owed bigint;
  v_excess bigint;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  if not (public.is_staff_of(g.agency_id) and public.agency_can('partners.payments.record')) then
    raise exception 'Recording a payment is owner-granted' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment needs an amount' using errcode = '22023';
  end if;

  if p_invoice is not null then
    /* Locked, so the balance this reads is the balance it acts on. */
    select * into i from public.partner_invoices where id = p_invoice for update;
    if i.id is null then
      raise exception 'That invoice does not exist' using errcode = '22023';
    end if;
    if i.group_id <> p_group then
      raise exception 'That invoice belongs to a different partner' using errcode = '22023';
    end if;
    /* A void invoice is not a debt. Money received against one is real and
       must be kept — as an unmatched payment on the partner's account, which
       is what leaving p_invoice null does. */
    if i.status in ('void', 'cancelled') then
      raise exception 'That invoice is %: record the payment without an invoice and match it, or reissue', i.status
        using errcode = '22023';
    end if;
    v_owed := public.invoice_balance_cents(p_invoice);
  end if;

  v_state := case when p_invoice is null then 'review_required' else 'matched' end;

  insert into public.partner_payments
    (agency_id, group_id, invoice_id, provider, provider_transaction_id, amount_cents,
     currency, paid_on, status, method, source, reconciliation_state,
     reconciled_at, notes, recorded_by)
  values (g.agency_id, p_group, p_invoice, p_provider, nullif(btrim(coalesce(p_reference, '')), ''),
          p_amount_cents, coalesce(p_currency, 'USD'), coalesce(p_paid_on, current_date),
          'succeeded', initcap(replace(p_provider::text, '_', ' ')), 'manual', v_state,
          case when p_invoice is null then null else now() end,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  /* Whatever the invoice did not need is the partner's money, not a rounding
     error. Kept as ACCOUNT CREDIT — cents, its own ledger, its own word. */
  if p_invoice is not null and v_owed is not null and p_amount_cents > v_owed then
    v_excess := p_amount_cents - v_owed;
    insert into public.partner_account_credit_ledger
      (agency_id, group_id, kind, amount_cents, currency, description,
       source_payment_id, created_by)
    values (g.agency_id, p_group, 'overpayment', v_excess, coalesce(p_currency, 'USD'),
            'Overpayment on ' || coalesce(i.invoice_number, 'an invoice'), v_id, auth.uid());
  end if;

  if p_invoice is not null then
    perform public.billing_reactivation_sweep();
  end if;

  perform public.log_audit('partner.payment_recorded', 'partner_payment', v_id::text, null, null,
    jsonb_build_object('partner', p_group, 'invoice', p_invoice, 'amount_cents', p_amount_cents,
                       'provider', p_provider, 'reference', p_reference, 'state', v_state,
                       'account_credit_cents', coalesce(v_excess, 0)));
  return v_id;
end $$;

-- ── 19c · Anybody could suspend a partner by passing p_actor => null ──────
--
-- The check read `if p_actor is not null and not (capability)` — an escape
-- hatch for the reminder sweep, which has no actor. But `p_actor` is an
-- ARGUMENT, so any signed-in person could pass null and skip the check
-- entirely. Probe 19c suspended a partner as an admin holding no money grant.
--
-- The right question is not what the caller passed; it is whether there is a
-- session at all. Cron and the service role have no `auth.uid()`.

create or replace function public.suspend_partner(
  p_group uuid, p_reason text default 'nonpayment', p_detail text default null,
  p_invoices uuid[] default '{}', p_actor uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.outsourcing_groups%rowtype;
  v_id uuid;
begin
  select * into g from public.outsourcing_groups where id = p_group;
  if g.id is null then raise exception 'That partner does not exist' using errcode = '22023'; end if;

  /* auth.uid(), not p_actor. A person in a session needs the capability
     whatever they pass; the sweep, which has no session, does not. */
  if auth.uid() is not null
     and not (public.is_staff_of(g.agency_id) and public.agency_can('partners.invoices.manage')) then
    raise exception 'Suspending a partner for nonpayment is owner-granted' using errcode = '42501';
  end if;

  select id into v_id from public.partner_suspensions
   where group_id = p_group and lifted_at is null;
  if v_id is not null then return v_id; end if;

  insert into public.partner_suspensions (agency_id, group_id, reason, detail, suspended_by)
  values (g.agency_id, p_group, p_reason, p_detail, coalesce(p_actor, auth.uid()))
  returning id into v_id;

  insert into public.partner_suspension_invoices (suspension_id, invoice_id)
  select v_id, i from unnest(coalesce(p_invoices, '{}')) as i
   where exists (select 1 from public.partner_invoices pi where pi.id = i)
  on conflict do nothing;

  /* Hold the partner's open work. `assigned_to` is deliberately untouched:
     reactivation reroutes by current rules rather than restoring a stale
     assignee (Dee §23). */
  update public.work_items w
     set on_hold = true, updated_at = now()
   where w.id in (
     select w2.id from public.work_items w2
       join public.workspaces ws on ws.id = w2.workspace_id
      where ws.partner_group_id = p_group
      union
     select w2.id from public.work_items w2
       join public.crm_projects p on p.id::text = w2.related_ref
      where p.partner_group_id = p_group
   )
   and coalesce(w.on_hold, false) = false;

  perform public.log_audit('partner.suspended', 'outsourcing_group', p_group::text, null, null,
    jsonb_build_object('reason', p_reason, 'detail', p_detail, 'suspension', v_id));
  return v_id;
end $$;

comment on function public.suspend_partner(uuid, text, text, uuid[], uuid) is
  'Opens a suspension episode and holds the partner''s open work. Gated on auth.uid() rather than on the p_actor argument — a caller in a session needs partners.invoices.manage whatever they pass.';
