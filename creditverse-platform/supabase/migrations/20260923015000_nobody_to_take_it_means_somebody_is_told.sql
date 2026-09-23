-- When nobody can take a file, a person is told.
--
-- The refined production rule, 2026-09-23, step 6: "If nobody qualifies, leave
-- it Unassigned and ALERT THE TEAM LEAD." And on Bureau Calling specifically:
-- "if there are no active Bureau Calling team members, do not assign it
-- anywhere else. Keep it Unassigned and raise an alert."
--
-- Both halves were already true except the alert. `creditops_assign_unclaimed`
-- leaves the file unassigned and never assigns outside the authorized pool —
-- it returns the gap in its result, and cron throws that result away. So the
-- system knew, hourly, and told nobody. That is the shape of a missing client:
-- tried, could not, said nothing.
--
-- Live right now: Bureau Calling, 2 actionable files, no team attached.
--
-- ── WHO IS TOLD ───────────────────────────────────────────────────────────
--
-- The leads of the teams attached to that department, and its department
-- managers. Not the whole agency: an alert everybody receives is one nobody
-- owns. If the department has neither — which is Bureau Calling's actual
-- situation, since it has no team at all — it goes to the people holding
-- agency scope, because otherwise the one case that most needs saying would
-- be the one case with no recipient.
--
-- ── ONCE A DAY, NOT ONCE AN HOUR ──────────────────────────────────────────
--
-- The sweep runs hourly and the condition persists until somebody staffs the
-- department. Sending it every hour would produce twenty-four identical
-- notices a day and train the team to ignore the channel — so the same
-- department is announced once per day per person. Deliberately not "once
-- ever": if it is still true tomorrow, that is worth saying again.
--
-- Cost impact: no material increase. At most one row per department per
-- recipient per day, on a sweep that already runs.

create or replace function public.creditops_alert_uncovered()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  v_sent int := 0;
begin
  for g in
    select s.department,
           c.agency_id,
           count(*) as files
      from public.client_department_statuses s
      join public.fulfillment_clients c on c.id = s.client_id
     where s.assignee_id is null
       and public.creditops_status_is_actionable(s.department, s.status)
       and c.archived_at is null
       and public.creditops_pick_assignee(s.department, c.agency_id, c.outsourcing_group_id) is null
     group by s.department, c.agency_id
  loop
    insert into public.notifications
      (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
    select r.user_id,
           g.agency_id,
           'unassigned',
           'creditops_queue',
           g.department::text,
           g.department::text || ' queue',
           g.files || ' file' || case when g.files = 1 then '' else 's' end
             || ' in ' || g.department || ' with nobody to work them',
           'Automatic assignment could not find an eligible agent for this queue. '
             || 'The files are still there and still unassigned — they need somebody added '
             || 'to the team, or reassigning by hand.',
           'bes_internal'
      from (
        /* Leads of the teams attached to this department, and its managers. */
        select distinct tm.user_id
          from public.team_memberships tm
          join public.teams t on t.id = tm.team_id and t.archived_at is null
          join public.departments d on d.id = t.department_id
         where tm.is_lead
           and d.division = 'creditops'
           and d.archived_at is null
           and t.agency_id = g.agency_id
           and d.key = case g.department
                         when 'Onboarding'     then 'support'
                         when 'Dispute'        then 'dispute'
                         when 'Support'        then 'support'
                         when 'Complaints'     then 'complaints'
                         when 'Bureau Calling' then 'bureau_calling'
                       end
        union
        select distinct ms.user_id
          from public.management_seats ms
          join public.departments d on d.id = ms.department_id
         where ms.seat::text = 'department_manager'
           and public.seat_is_live(ms.effective_from, ms.effective_to)
           and d.division = 'creditops'
           and d.archived_at is null
           and d.key = case g.department
                         when 'Onboarding'     then 'support'
                         when 'Dispute'        then 'dispute'
                         when 'Support'        then 'support'
                         when 'Complaints'     then 'complaints'
                         when 'Bureau Calling' then 'bureau_calling'
                       end
      ) r
     /* Once per person per department per day. */
     where not exists (
       select 1 from public.notifications n
        where n.recipient_id = r.user_id
          and n.kind = 'unassigned'
          and n.entity_type = 'creditops_queue'
          and n.entity_id = g.department::text
          and n.created_at >= date_trunc('day', now())
     );

    get diagnostics v_sent = row_count;

    /* A department with no team has no lead and no manager to tell — which is
       exactly the case that most needs saying. Fall back to agency scope
       rather than letting the alert vanish for want of a recipient. */
    if v_sent = 0 then
      insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select m.user_id, g.agency_id, 'unassigned', 'creditops_queue', g.department::text,
             g.department::text || ' queue',
             g.files || ' file' || case when g.files = 1 then '' else 's' end
               || ' in ' || g.department || ' with nobody to work them',
             'This queue has no team attached, so automatic assignment has nobody to give '
               || 'the work to. Nobody leads it either, so this is going to agency scope.',
             'bes_internal'
        from public.agency_memberships m
       where m.agency_id = g.agency_id
         and m.status = 'active'
         and m.scope::text = 'agency'
         and not exists (
           select 1 from public.notifications n
            where n.recipient_id = m.user_id
              and n.kind = 'unassigned'
              and n.entity_type = 'creditops_queue'
              and n.entity_id = g.department::text
              and n.created_at >= date_trunc('day', now())
         );
      get diagnostics v_sent = row_count;
    end if;
  end loop;

  return v_sent;
end $function$;

revoke execute on function public.creditops_alert_uncovered() from public, anon, authenticated;

comment on function public.creditops_alert_uncovered() is
  'Tells the team lead or department manager when a CreditOps queue has '
  'actionable work and no eligible agent. Once per person per department per '
  'day. Cron''s, not a user''s (2026-09-23).';

/* Onto the sweep that already runs, beside the assignment it reports on. */
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sla-sweep'),
  command := $job$select public.sla_sweep(); select public.creditops_assign_unclaimed(); select public.creditops_alert_uncovered();$job$
);

do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'sla-sweep';
  if position('creditops_alert_uncovered' in v_cmd) = 0
     or position('creditops_assign_unclaimed' in v_cmd) = 0
     or position('sla_sweep' in v_cmd) = 0 then
    raise exception 'the sla-sweep job lost one of its three steps: %', v_cmd;
  end if;
end $$;
