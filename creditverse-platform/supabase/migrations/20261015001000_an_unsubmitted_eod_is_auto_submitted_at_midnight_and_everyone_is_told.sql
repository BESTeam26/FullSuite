-- An unsubmitted End of Day is auto-submitted at midnight, and everyone is told.
--
-- Dee, 2026-10-15: "Auto Submit — Midnight YES, then tag as AUTO Submitted
-- so management and the agent is aware." The cutoff is midnight Eastern
-- (agencies.eod_cutoff_local = 24:00:00, set 2026-10-15).
--
-- What existed: eod_run_cutoff(p_agency) submits the drafts left open past
-- the cutoff, marks them auto_submitted with no submitter named, and the
-- interface already labels those "Auto-submitted" (Agent EOD, Team EOD,
-- the member profile, the rollup). But it only ran when somebody opened the
-- EOD page, it needed a signed-in staff member (is_staff_of), and the
-- agency's eod_auto_submit flag was off — so nothing was ever auto-submitted.
--
-- What this adds, and nothing more:
--   1. eod_auto_submit on for BES.
--   2. eod_auto_submit_sweep(): the same submission rule, runnable by cron
--      (no caller), for every agency with the flag on. Idempotent: a draft is
--      past its cutoff or it is not, and once submitted it is never touched
--      again. Each auto-submission tells the agent, and tells every lead of a
--      team the agent sits on — "management and the agent", in the system's
--      own words for who manages whom (rule 20b: a relationship, not a rank).
--      One notification per person per report; the entity key makes a
--      repeat impossible.
--   3. A cron entry every 15 minutes. Hourly would leave an EOD unsubmitted
--      for up to an hour after midnight; every minute buys nothing. The
--      query is bounded by drafts past cutoff — a handful of rows a night.
--
-- Cost scales with: one notification per auto-submitted report per
-- recipient (the agent plus their leads) — a few rows a night, bounded by
-- head count.

update public.agencies set eod_auto_submit = true
 where name = 'Blessed Empire Services' and eod_cutoff_local is not null;

create or replace function public.eod_auto_submit_sweep()
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  a record;
  r record;
  v_count int := 0;
begin
  for a in
    select id, eod_cutoff_local, coalesce(eod_timezone, 'America/New_York') as tz
      from public.agencies
     where coalesce(eod_auto_submit, false) and eod_cutoff_local is not null
  loop
    for r in
      with due as (
        select e.id
          from public.eod_submissions e
         where e.agency_id = a.id
           and e.submitted_at is null
           and ((e.work_date + a.eod_cutoff_local) at time zone a.tz) < now()
           /* From the day the rule began. Drafts left open on earlier days
              (four real ones existed on 2026-10-15) are not rewritten as
              "auto-submitted" weeks after the fact and nobody is woken up
              about them; Dee can ask for those separately. */
           and e.work_date >= date '2026-10-15'
      ),
      done as (
        update public.eod_submissions e
           set state          = 'submitted',
               submitted_at   = now(),
               auto_submitted = true,
               submitted_by   = null
          from due
         where e.id = due.id
        returning e.id, e.employee_id, e.work_date
      )
      select * from done
    loop
      v_count := v_count + 1;

      /* The agent. */
      insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values
        (r.employee_id, a.id, 'reminder', 'eod_day', r.work_date::text || ':auto_submitted', 'End of Day',
         'Your End of Day was auto-submitted',
         'Your EOD for ' || to_char(r.work_date, 'FMMon DD') || ' was not submitted by the midnight cutoff, so the system submitted it as it stood. It is marked Auto-submitted.',
         'bes_internal')
      on conflict do nothing;

      /* Every lead of a team the agent sits on. */
      insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select distinct lead_m.user_id, a.id, 'reminder', 'eod_day',
             r.work_date::text || ':auto_submitted:' || r.employee_id::text, 'End of Day',
             coalesce(p.full_name, 'A team member') || '''s End of Day was auto-submitted',
             'The EOD for ' || to_char(r.work_date, 'FMMon DD') || ' was not submitted by the midnight cutoff and was submitted by the system as it stood. It is marked Auto-submitted.',
             'bes_internal'::public.activity_visibility
        from public.team_memberships member_m
        join public.team_memberships lead_m on lead_m.team_id = member_m.team_id and lead_m.is_lead
        join public.teams t on t.id = member_m.team_id and t.archived_at is null
        left join public.profiles p on p.id = r.employee_id
       where member_m.user_id = r.employee_id
         and lead_m.user_id <> r.employee_id
      on conflict do nothing;
    end loop;
  end loop;
  return v_count;
end $function$;

revoke all on function public.eod_auto_submit_sweep() from public, anon, authenticated;

comment on function public.eod_auto_submit_sweep() is
  'Cron: submits every draft EOD left open past its agency''s cutoff, marks it auto_submitted, and tells the agent and the leads of their teams. Idempotent; no caller context.';

select cron.schedule('eod-auto-submit', '*/15 * * * *', $$select public.eod_auto_submit_sweep()$$);
