-- A job switched off on purpose says so, and says why.
--
-- Dee, 2026-09-24: "If those five jobs are intentionally disabled because
-- invoicing moved to GHL, the contract probe should classify them as
-- intentionally inactive, not failed. A security/reliability gate that treats
-- intentional shutdowns as failures trains everyone to ignore red."
--
-- Five billing jobs were deactivated on 2026-09-22 when Dee moved invoicing to
-- GoHighLevel. The contract probe has reported them as failures every run
-- since — five red lines that are correct behaviour, sitting beside the one
-- red line that was a real two-day outage (`attachment_purge_dispatch`). That
-- is how a real failure gets missed.
--
-- ── WHY A TABLE AND NOT A LIST IN THE PROBE ───────────────────────────────
--
-- A list in a test file answers "should this be red?" and nothing else.
-- Whoever finds the job switched off next month, in the database, still has
-- no idea why — and the person who turns invoicing back on has no reason to
-- go and edit a probe. The decision belongs where the job is.
--
-- So the reason is a row, with a date and an owner, and the probe reads it.
-- Re-arming a job means deleting its row, which is the same gesture as
-- reactivating it and cannot be forgotten separately: the probe FAILS on a
-- job that is active while still carrying a pause note, so the record cannot
-- quietly disagree with reality in either direction.
--
-- Pausing stays a migration rather than a screen. Switching off a scheduled
-- job is the kind of decision that should leave a trail, and there are five
-- of them in the system's whole history.
--
-- Cost impact: no material increase. Five rows, read once per probe run.

begin;

create table if not exists public.cron_job_pauses (
  jobname    text primary key,
  reason     text not null,
  paused_on  date not null default current_date,
  /* Who decided. Null where the decision predates anybody recording it. */
  paused_by  uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.cron_job_pauses is
  'Scheduled jobs deliberately switched off, and why. Read by '
  'sql-contract-probe so an intentional pause is not reported as a failure '
  '(Dee, 2026-09-24). A job that is active while listed here is a failure: '
  'the note must not outlive the decision.';

alter table public.cron_job_pauses enable row level security;

/* Operational context, not client data: any BES staff member may read why a
   job is off. Nobody writes it from a session — pausing is a migration. */
create policy cron_job_pauses_select on public.cron_job_pauses
  for select to authenticated
  using (public.is_agency_staff());

revoke all on public.cron_job_pauses from anon, public;
grant select on public.cron_job_pauses to authenticated;

insert into public.cron_job_pauses (jobname, reason, paused_on) values
  ('billing-recurring-sweep',
   'Invoicing moved to GoHighLevel. Dee, 2026-09-22: "I will have all my invoicing automated in GHL For now. Stop all invoice generation for now." The engine is intact; only the schedule is off.',
   date '2026-09-22'),
  ('billing-reminder-sweep',
   'Invoicing moved to GoHighLevel (Dee, 2026-09-22). No BES invoices exist to remind anybody about.',
   date '2026-09-22'),
  ('billing-email-dispatch',
   'Invoicing moved to GoHighLevel (Dee, 2026-09-22). Nothing queues billing email while generation is stopped.',
   date '2026-09-22'),
  ('billing-reactivation-sweep',
   'Invoicing moved to GoHighLevel (Dee, 2026-09-22). Reactivation follows payment state BES no longer records.',
   date '2026-09-22'),
  ('partner-autopay-sweep',
   'Invoicing moved to GoHighLevel (Dee, 2026-09-22). Autopay must not charge a card against invoices BES is not generating.',
   date '2026-09-22')
on conflict (jobname) do nothing;

/* Every row here describes a job that exists and is genuinely off. A pause
   note for a job nobody can find, or for one that is running, is the rot this
   table is meant to prevent — so it cannot be created in the first place. */
do $$
declare v_bad text;
begin
  select string_agg(p.jobname || ' (' || coalesce(j.active::text, 'no such job') || ')', ', ')
    into v_bad
    from public.cron_job_pauses p
    left join cron.job j on j.jobname = p.jobname
   where j.jobname is null or j.active;
  if v_bad is not null then
    raise exception 'pause notes that do not match reality: %', v_bad;
  end if;
end $$;

commit;
