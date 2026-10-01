-- Reminders the system raises (Dee, 2026-10-01): clock in, clock out, and
-- submit your End of Day — for everyone whose membership says they must,
-- read from their schedule and the agency's EOD cutoff. And every
-- notification now reaches the open app the moment it is written.
--
-- One engine, no second inbox: a reminder is an ordinary `notifications`
-- row (kind 'reminder'), so the bell, the page, the toast, the desktop
-- notification and — later — push all deliver it the same way. The sweep
-- runs every five minutes and writes each reminder once per person per day
-- (`reminder_marks`), never on approved leave, never on a day off.
begin;

-- ── 1. 'reminder' is a notification kind ────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'assigned', 'unassigned', 'note', 'status', 'mention', 'dm', 'handoff',
    'announcement', 'attention', 'timer', 'leave', 'payroll', 'due_soon',
    'overdue', 'eod', 'reminder'
  ]));

-- ── 2. Live delivery: the open app hears its own rows ───────────────────
-- Row Level Security applies to realtime as it does to a select: a person
-- receives only rows whose recipient_id is their own.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ── 3. Once per person, per day, per reminder ───────────────────────────
create table if not exists public.reminder_marks (
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  work_date  date not null,
  kind       text not null check (kind in ('clock_in', 'clock_out', 'eod', 'eod_final')),
  sent_at    timestamptz not null default now(),
  primary key (user_id, work_date, kind)
);
comment on table public.reminder_marks is
  'Idempotency for reminders_sweep(): a reminder is raised once per person per day per kind. No client reads or writes this.';
alter table public.reminder_marks enable row level security;

-- ── 4. The sweep ────────────────────────────────────────────────────────
create or replace function public.reminders_sweep(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_local timestamp;
  v_today date;
  v_time  time;
  v_cutoff time;
  v_eod_at time;
  v_sent integer := 0;
begin
  for r in
    select m.user_id, m.agency_id, m.time_tracking_required, m.eod_required,
           s.shift_start, s.shift_end, s.grace_minutes, s.timezone, s.work_days,
           a.eod_cutoff_local, a.eod_timezone
      from public.agency_memberships m
      join public.agencies a on a.id = m.agency_id
      join lateral (
        select * from public.work_schedules ws
         where ws.user_id = m.user_id
           and ws.effective_from <= (p_now at time zone coalesce(ws.timezone, 'America/New_York'))::date
         order by ws.effective_from desc limit 1
      ) s on true
      join public.profiles p on p.id = m.user_id and not coalesce(p.is_fixture, false)
     where m.status = 'active'
       and m.workforce_managed
  loop
    v_local := p_now at time zone r.timezone;
    v_today := v_local::date;
    v_time  := v_local::time;

    /* A day off, or approved leave, is not a day to be reminded on. */
    continue when not (extract(isodow from v_local)::smallint = any (r.work_days));
    continue when exists (
      select 1 from public.leave_requests l
       where l.user_id = r.user_id and l.status = 'approved'
         and v_today between l.starts_on and l.ends_on);

    /* Clock in: from grace end until two hours after the shift began — later
       than that is attendance's question, not a reminder's. */
    if r.time_tracking_required
       and v_time >= r.shift_start + make_interval(mins => r.grace_minutes)
       and v_time <  r.shift_start + interval '2 hours'
       and not exists (select 1 from public.time_entries t
                        where t.employee_id = r.user_id and t.work_date = v_today and t.kind = 'work')
       and not exists (select 1 from public.reminder_marks k
                        where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'clock_in')
    then
      insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'clock_in');
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values (r.user_id, r.agency_id, 'reminder', 'time_clock', v_today::text || ':clock_in', 'My Time',
              'Time to clock in',
              'Your shift started at ' || to_char(r.shift_start, 'FMHH12:MI AM') || ' ET and you are not clocked in yet. Clock in on My Time.',
              'bes_internal');
      v_sent := v_sent + 1;
    end if;

    /* Clock out: the shift has ended and a work timer is still running. */
    if r.time_tracking_required
       and v_time >= r.shift_end
       and exists (select 1 from public.time_entries t
                    where t.employee_id = r.user_id and t.work_date = v_today and t.kind = 'work' and t.ended_at is null)
       and not exists (select 1 from public.reminder_marks k
                        where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'clock_out')
    then
      insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'clock_out');
      insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values (r.user_id, r.agency_id, 'reminder', 'time_clock', v_today::text || ':clock_out', 'My Time',
              'Your shift has ended — clock out',
              'Your shift ended at ' || to_char(r.shift_end, 'FMHH12:MI AM') || ' ET and your timer is still running. Clock out on My Time when you finish.',
              'bes_internal');
      v_sent := v_sent + 1;
    end if;

    /* End of Day: at the cutoff minus 30 minutes when the agency has one,
       otherwise at the end of the shift; a final nudge at the cutoff. */
    if r.eod_required then
      v_cutoff := r.eod_cutoff_local;
      v_eod_at := coalesce(v_cutoff - interval '30 minutes', r.shift_end);
      if v_time >= v_eod_at
         and not exists (select 1 from public.eod_submissions e
                          where e.employee_id = r.user_id and e.work_date = v_today and e.submitted_at is not null)
         and not exists (select 1 from public.reminder_marks k
                          where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'eod')
      then
        insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'eod');
        insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
        values (r.user_id, r.agency_id, 'reminder', 'eod_day', v_today::text || ':eod', 'End of Day',
                'Submit your End of Day',
                'Your EOD for ' || to_char(v_today, 'FMMon DD') || ' is not submitted yet.' ||
                case when v_cutoff is not null then ' It is due by ' || to_char(v_cutoff, 'FMHH12:MI AM') || ' ET.' else ' Submit it before you finish for the day.' end,
                'bes_internal');
        v_sent := v_sent + 1;
      end if;
      if v_cutoff is not null and v_time >= v_cutoff
         and not exists (select 1 from public.eod_submissions e
                          where e.employee_id = r.user_id and e.work_date = v_today and e.submitted_at is not null)
         and not exists (select 1 from public.reminder_marks k
                          where k.user_id = r.user_id and k.work_date = v_today and k.kind = 'eod_final')
      then
        insert into public.reminder_marks (agency_id, user_id, work_date, kind) values (r.agency_id, r.user_id, v_today, 'eod_final');
        insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
        values (r.user_id, r.agency_id, 'reminder', 'eod_day', v_today::text || ':eod_final', 'End of Day',
                'Your End of Day is overdue',
                'The ' || to_char(v_cutoff, 'FMHH12:MI AM') || ' ET cutoff has passed and your EOD for ' || to_char(v_today, 'FMMon DD') || ' is still not submitted.',
                'bes_internal');
        v_sent := v_sent + 1;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;

revoke all on function public.reminders_sweep(timestamptz) from public, anon, authenticated;
comment on function public.reminders_sweep(timestamptz) is
  'Every five minutes (cron reminders-sweep): clock-in, clock-out and End of Day reminders as notifications, once per person per day, from schedules, time entries, submissions and leave. p_now exists so a test can ask about another moment.';

select cron.unschedule('reminders-sweep') where exists (select 1 from cron.job where jobname = 'reminders-sweep');
select cron.schedule('reminders-sweep', '*/5 * * * *', $$select public.reminders_sweep()$$);

commit;
