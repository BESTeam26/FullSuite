# Background jobs

Ten `pg_cron` jobs. The database is the scheduler; outbound HTTP goes through
`pg_net` to an Edge Function, never from inside a business transaction.

```sql
select jobname, schedule, command, active from cron.job order by jobid;
select * from cron.job_run_details order by start_time desc limit 20;
```

## The jobs

| Job | Schedule (UTC) | Calls | Purpose | Idempotency | Failure mode |
|---|---|---|---|---|---|
| `timer-auto-stop` | `*/10 * * * *` | `auto_stop_stale_timers()` | Stops timers past the 10-hour cap; notifies leads | Only stops timers still running past the cap | Timers keep running; hours overstated until the next pass. Visible to the agent |
| `payroll-auto-sweep` | `30 * * * *` | `payroll_auto_sweep()` | Advances payroll periods, releases to expense | Period state machine; a released period is not re-released | A payroll period stays open. Money is not moved twice |
| `dst-calendar-sweep` | `15 6 * * *` | `dst_calendar_sweep()` | Re-derives schedules across DST | Recomputes from schedule rows | Shift times drift by an hour after a DST change |
| `ghl-outbound-dispatch` | `* * * * *` | `ghl_outbound_dispatch()` | Drains the GHL outbound queue via `net.http_post` | Queue rows claimed by state | **Historically the dangerous one** — see below |
| `due-date-sweep` | `5 * * * *` | `due_date_sweep()` | Flags work approaching or past its due date | Derived flags, recomputed each pass | Due-date attention is late |
| `sla-sweep` | `20 * * * *` | `sla_sweep()` | Raises Attention on CreditOps SLA breach | Derived; does not reassign anything | A breach is noticed late. Nothing is reassigned automatically, by design |
| `billing-reminder-sweep` | `25 * * * *` | `billing_reminder_sweep()` | Decides which overdue invoices need a reminder; **queues** the email | One `partner_invoice_reminders` row per invoice per stage | Reminders are late. **Never duplicated** |
| `billing-reactivation-sweep` | `40 * * * *` | `billing_reactivation_sweep()` | Lifts suspension when the balance settles | Only lifts a live suspension whose balance is clear | A paid-up partner stays suspended longer than they should. **Visible and complained about** |
| `billing-recurring-sweep` | `10 5 * * *` | `billing_recurring_sweep()` | Generates invoices from `partner_billing_schedule` | Partial unique index on (schedule, period) — the predicate is repeated in `ON CONFLICT` | **Historically the dangerous one** — see below |
| `billing-email-dispatch` | `*/5 * * * *` | `billing_email_dispatch()` | `net.http_post` → `billing-email` Edge Function → Resend | `dedupe_key` unique on the outbox; only `pending`/`failed` claimed | Mail is late, never doubled. The queue holds and the count says how much is waiting |

## The pattern for outbound calls

```
sweep function (transaction)   decides WHAT, writes a queue row
        ↓
dispatch function              pg_net → Edge Function → provider
        ↓
outbox row marked sent/failed  with the provider's own message
```

**Never put an HTTP call inside the transaction that decides the work.** A slow
provider holds a lock on the invoice table; a failed one rolls back a decision
that had already been made. Both happened in earlier designs.

`pg_net` calls are authenticated with a shared secret from **Supabase Vault**,
compared in **constant time** at the Edge Function.

## Two jobs with history

### `ghl-outbound-dispatch` — failed silently for four days

It called `extensions.net.http_post`. Postgres reads a three-part name as
`database.schema.function`, so it parsed, failed at run time inside a function
body, and **cron logged success every minute since 2026-09-09**. Nothing sent,
nothing raised.

Fixed to `net.http_post`. **`npm run probe:sql` now fails if any function body
contains a three-part `net.` name**, and also checks that every cron job's
target function exists and is active.

### `billing-recurring-sweep` — nearly sent real escalating reminders

It generated five real invoices with **due dates in the past**. The reminder
sweep did exactly what it should with an overdue invoice and queued **fifteen**
escalating reminder emails to real partners. Held within seconds; **zero were
sent.**

Fixed so a due date can never precede its issue date — **an invoice is never
born overdue**. The bad invoices were repaired and the phantom reminder rows
deleted.

## Operating them

```sql
-- pause a job without deleting it
update cron.job set active = false where jobname = 'billing-email-dispatch';

-- run a sweep once, by hand, to observe it
select public.billing_reminder_sweep();

-- what is waiting to go out
select state, count(*) from public.billing_email_outbox group by 1;
```

**Before running a billing sweep by hand on production, know what it will do.**
The recurring sweep creates real invoices, and the reminder sweep queues real
email to real partners. Read the function first.

## If you add a job

1. The work function is idempotent, and says how in a comment.
2. Outbound HTTP goes through a dispatch function, never inside the sweep.
3. `net.http_post`, never `extensions.net.http_post`.
4. `SECURITY DEFINER` with a pinned `search_path`.
5. `npm run probe:sql` must stay green — it will check 1, 3 and 4 for you.
