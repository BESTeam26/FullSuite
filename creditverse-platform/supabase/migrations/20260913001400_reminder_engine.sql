-- =============================================================================
-- The reminder schedule, and suspension that money can still stop.
--
-- Day 1 · Day 2 · Day 3 reminders, Day 5 warning, Day 7 final reminder, then
-- suspension — and Dee's rule for the last step, 2026-09-13:
--
--   "Day 7 final reminder and suspension must be invoice-balance driven, not
--    simply '7 days elapsed'… If paid before the suspension transaction
--    commits: do not suspend. If a payment and suspension sweep happen at
--    nearly the same time: use transaction-safe/idempotent logic so payment
--    wins when the overdue balance is satisfied."
--
-- ── HOW PAYMENT WINS ────────────────────────────────────────────────────────
--
-- The sweep does not decide from the row it read at the start. It takes
-- `select … for update` on the invoice, re-reads the balance INSIDE that lock,
-- and re-checks every condition before inserting the suspension. A payment
-- committing first has already run `partner_invoice_recompute` through its
-- trigger, so the locked re-read sees the new `amount_paid_cents` and the
-- sweep walks away. A payment arriving second blocks until the sweep finishes
-- and then lands against an invoice that is suspended-but-payable, which
-- reactivation handles.
--
-- ── IDEMPOTENCY IS A UNIQUE INDEX, NOT A FLAG ───────────────────────────────
--
-- One row per (invoice, stage), enforced by the database. The sweep can run
-- every hour, twice at once, or be replayed after a crash, and Day 3 is sent
-- exactly once — because the second insert is refused by Postgres rather than
-- avoided by a check somebody has to remember to write.
-- =============================================================================

create table if not exists public.partner_invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  invoice_id uuid not null references public.partner_invoices(id) on delete cascade,
  group_id uuid not null references public.outsourcing_groups(id) on delete cascade,
  /** Which step of the schedule this is. */
  stage text not null check (stage in ('day_1', 'day_2', 'day_3', 'day_5_warning', 'day_7_final')),
  /** Days past due when it fired — recorded, so a schedule change is visible in history. */
  days_overdue integer not null,
  /** What was still owed when it went. */
  balance_cents bigint not null,
  sent_at timestamptz not null default now(),
  /** How it was delivered. `portal` always; `email` once a mail path exists. */
  channels text[] not null default array['portal'],
  created_at timestamptz not null default now()
);

comment on table public.partner_invoice_reminders is
  'One row per reminder actually sent. The unique index below IS the idempotency: a sweep that runs twice cannot send Day 3 twice, because the second insert is refused by the database (Dee, 2026-09-13).';

create unique index if not exists partner_invoice_reminders_once
  on public.partner_invoice_reminders (invoice_id, stage);

create index if not exists partner_invoice_reminders_by_partner
  on public.partner_invoice_reminders (group_id, sent_at desc);

alter table public.partner_invoice_reminders enable row level security;
grant select on public.partner_invoice_reminders to authenticated;

drop policy if exists partner_invoice_reminders_select on public.partner_invoice_reminders;
create policy partner_invoice_reminders_select on public.partner_invoice_reminders
  for select to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('partners.invoices.view'));

/* No write policy. Reminders are sent by the sweep, never by hand — a
   hand-written reminder row would break the idempotency it exists to provide. */

/**
 * What is still owed on an invoice, in cents.
 *
 * Derived from the canonical columns the payment trigger maintains, so it
 * cannot disagree with the invoice's own status.
 */
create or replace function public.invoice_balance_cents(p_invoice uuid)
returns bigint
language sql stable security definer set search_path = public as $function$
  select greatest(coalesce(total_cents, 0) - coalesce(amount_paid_cents, 0), 0)
    from public.partner_invoices where id = p_invoice
$function$;
revoke execute on function public.invoice_balance_cents(uuid) from public, anon;
grant execute on function public.invoice_balance_cents(uuid) to authenticated;

/** The schedule, as data. Changing it is a row, not a release. */
create table if not exists public.billing_reminder_schedule (
  stage text primary key,
  day_offset integer not null,
  label text not null,
  /** True for the step after which suspension becomes possible. */
  is_final boolean not null default false,
  sort integer not null
);

insert into public.billing_reminder_schedule (stage, day_offset, label, is_final, sort) values
  ('day_1',         1, 'Payment reminder',            false, 10),
  ('day_2',         2, 'Second payment reminder',     false, 20),
  ('day_3',         3, 'Third payment reminder',      false, 30),
  ('day_5_warning', 5, 'Payment warning',             false, 40),
  ('day_7_final',   7, 'Final reminder before suspension', true, 50)
on conflict (stage) do update
  set day_offset = excluded.day_offset, label = excluded.label,
      is_final = excluded.is_final, sort = excluded.sort;

grant select on public.billing_reminder_schedule to authenticated;

/**
 * Send every reminder that is due, once, and suspend only what genuinely
 * remains unpaid.
 *
 * Returns what it did rather than nothing, so a scheduled run is legible in
 * the job log and a person can call it by hand and see the outcome.
 */
create or replace function public.billing_reminder_sweep()
returns table(reminders_sent integer, suspensions integer, invoices_marked_overdue integer)
language plpgsql security definer set search_path = public as $function$
declare
  v_sent int := 0;
  v_susp int := 0;
  v_overdue int := 0;
  r record;
  s record;
  v_balance bigint;
  v_prev_reminder timestamptz;
  v_paid_since int;
  v_who text;
begin
  /* Step one, and the reason `mark_overdue_invoices` exists: an invoice that
     has passed its due date says so before anybody is reminded about it. */
  v_overdue := public.mark_overdue_invoices();

  for r in
    select i.id, i.agency_id, i.group_id, i.invoice_number, i.due_date,
           (current_date - i.due_date) as days_overdue
      from public.partner_invoices i
     where i.status in ('sent', 'partially_paid', 'overdue')
       and i.due_date < current_date
       and coalesce(i.total_cents, 0) > coalesce(i.amount_paid_cents, 0)
  loop
    for s in
      select * from public.billing_reminder_schedule
       where day_offset <= r.days_overdue
       order by sort
    loop
      /* The unique index decides. `on conflict do nothing` means a second
         sweep in the same hour is silent rather than an error. */
      insert into public.partner_invoice_reminders
        (agency_id, invoice_id, group_id, stage, days_overdue, balance_cents)
      values (r.agency_id, r.id, r.group_id, s.stage, r.days_overdue,
              public.invoice_balance_cents(r.id))
      on conflict (invoice_id, stage) do nothing;

      if found then
        v_sent := v_sent + 1;
        /* Everyone at the partner who has actually activated the portal. A
           contact with no account gets the portal banner instead, which is
           why the reminder row itself is the record, not the notification. */
        insert into public.notifications
          (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
           entity_label, visibility, title, detail)
        select c.user_id, null, r.agency_id, null, 'due_soon', 'partner', r.group_id::text,
               g.name, 'shared_with_partner',
               s.label || ' · ' || r.invoice_number,
               'Invoice ' || r.invoice_number || ' was due ' || to_char(r.due_date, 'DD Mon YYYY')
                 || ' and has ' || to_char(public.invoice_balance_cents(r.id) / 100.0, 'FM999G999D00')
                 || ' outstanding.'
          from public.partner_contacts c
          join public.outsourcing_groups g on g.id = c.group_id
         where c.group_id = r.group_id and c.status = 'active' and c.user_id is not null
        on conflict do nothing;
      end if;
    end loop;

    -- ── Suspension: five checks, inside the lock ───────────────────────────
    if r.days_overdue >= (select day_offset from public.billing_reminder_schedule where is_final)
       and exists (select 1 from public.partner_invoice_reminders pr
                    where pr.invoice_id = r.id
                      and pr.stage = (select stage from public.billing_reminder_schedule where is_final))
       and not public.partner_is_suspended(r.group_id)
    then
      /* Everything below re-reads under the lock. The row this loop started
         with is a snapshot, and a payment may have committed since. */
      perform 1 from public.partner_invoices where id = r.id for update;

      v_balance := public.invoice_balance_cents(r.id);

      select max(pr.sent_at) into v_prev_reminder
        from public.partner_invoice_reminders pr
       where pr.invoice_id = r.id
         and pr.stage <> (select stage from public.billing_reminder_schedule where is_final);

      select count(*) into v_paid_since
        from public.partner_payments p
       where p.invoice_id = r.id
         and p.status = 'succeeded'
         and (v_prev_reminder is null or p.created_at > v_prev_reminder);

      if v_balance > 0
         and v_paid_since = 0
         and exists (select 1 from public.partner_invoices i2
                      where i2.id = r.id
                        and i2.status in ('sent', 'partially_paid', 'overdue'))
         and not public.partner_is_suspended(r.group_id)
      then
        perform public.suspend_partner(
          r.group_id, 'nonpayment',
          'Invoice ' || r.invoice_number || ' unpaid ' || r.days_overdue || ' days after its due date',
          array[r.id], null);
        v_susp := v_susp + 1;
      end if;
    end if;
  end loop;

  return query select v_sent, v_susp, v_overdue;
end $function$;
revoke execute on function public.billing_reminder_sweep() from public, anon;
grant execute on function public.billing_reminder_sweep() to authenticated;

/**
 * Reactivate anybody whose overdue balance is now satisfied.
 *
 * Separate from the reminder sweep so a payment recorded at 2am does not wait
 * until somebody notices. PARTIAL payment does not qualify: every invoice that
 * caused the suspension must be clear, which is Dee's §21 — "Do not silently
 * reactivate because $1 was paid."
 */
create or replace function public.billing_reactivation_sweep()
returns integer
language plpgsql security definer set search_path = public as $function$
declare v_count int := 0; r record;
begin
  for r in
    select s.id, s.group_id
      from public.partner_suspensions s
     where s.lifted_at is null and s.reason = 'nonpayment'
       and not exists (
         select 1 from public.partner_suspension_invoices si
           join public.partner_invoices i on i.id = si.invoice_id
          where si.suspension_id = s.id
            and public.invoice_balance_cents(i.id) > 0
            and i.status not in ('void', 'cancelled'))
  loop
    if public.lift_partner_suspension(r.group_id, 'Overdue balance settled', null) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $function$;
revoke execute on function public.billing_reactivation_sweep() from public, anon;
grant execute on function public.billing_reactivation_sweep() to authenticated;

/* Scheduled, because an unscheduled sweep is an unused function — which is
   exactly what `mark_overdue_invoices` had been since it was written. Hourly:
   the schedule is in days, so hourly is prompt without being busy. */
select cron.unschedule('billing-reminder-sweep') where exists (
  select 1 from cron.job where jobname = 'billing-reminder-sweep');
select cron.schedule('billing-reminder-sweep', '25 * * * *',
  $cron$ select public.billing_reminder_sweep() $cron$);

select cron.unschedule('billing-reactivation-sweep') where exists (
  select 1 from cron.job where jobname = 'billing-reactivation-sweep');
select cron.schedule('billing-reactivation-sweep', '40 * * * *',
  $cron$ select public.billing_reactivation_sweep() $cron$);
