-- Telling people, and showing each person the right people.
--
-- Dee, 2026-09-16: *"Team Lead gets an in-app notification: James submitted
-- their EOD report. Blockers/help-needed submissions should be visually
-- prioritized. Employee gets: Your EOD report was submitted successfully, and
-- later: Your EOD was reviewed by your Team Lead."* And separately: *"Team
-- Leads should see their team. Authorized management should see broader
-- organizational rollups. Normal agents should see only their own EOD history."*

-- ── 'eod' is a kind of notification ────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array[
    'assigned', 'unassigned', 'note', 'status', 'mention', 'dm', 'handoff',
    'announcement', 'attention', 'timer', 'leave', 'payroll', 'due_soon',
    'overdue',
    /* New. The list is a CHECK rather than an enum, which is why this is an
       ordinary migration and not a type change with a rewrite behind it. */
    'eod'
  ]));

-- ── Who hears what ─────────────────────────────────────────────────────────

create or replace function public.eod_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name     text;
  v_urgent   boolean;
  v_detail   text;
begin
  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  /* SUBMITTED. Only on the transition in — a later edit is a revision. */
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null) then

    /* Dee: "Blockers/help-needed submissions should be visually prioritized."
       The urgency is decided HERE, from what the person actually wrote, and
       carried in the text — so the list can sort and style on it without
       re-reading every report. */
    v_urgent := coalesce(nullif(trim(new.blockers), ''), nullif(trim(new.escalations), '')) is not null;
    v_detail := to_char(new.work_date, 'FMMon FMDD')
                || case when v_urgent then ' · blockers or help needed' else '' end;

    if new.routed_to is not null then
      insert into public.notifications
        (recipient_id, actor_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail)
      values (new.routed_to, new.employee_id, new.agency_id, 'eod', 'eod_submission',
              new.id::text, 'Team EOD',
              v_name || ' submitted their EOD report', v_detail);
    end if;

    /* And the person who submitted it, so "did that go?" is answered without
       asking anybody. */
    insert into public.notifications
      (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail)
    values (new.employee_id, new.agency_id, 'eod', 'eod_submission',
            new.id::text, 'End of Day',
            'Your EOD report was submitted successfully',
            case when new.routed_to is not null
                 then v_detail || ' · sent to your team lead'
                 /* Honest rather than reassuring: no lead resolved means
                    nobody has been told, and the person should know that. */
                 else v_detail || ' · no team lead is set, so nobody was notified' end);
  end if;

  /* REVIEWED. Only on the transition, and never to yourself. */
  if tg_op = 'UPDATE'
     and new.reviewed_at is not null and old.reviewed_at is null
     and new.reviewed_by is distinct from new.employee_id then
    insert into public.notifications
      (recipient_id, actor_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail)
    values (new.employee_id, new.reviewed_by, new.agency_id, 'eod', 'eod_submission',
            new.id::text, 'End of Day',
            case when new.state = 'needs_clarification'
                 then 'Your team lead asked about your EOD report'
                 else 'Your EOD was reviewed by your team lead' end,
            to_char(new.work_date, 'FMMon FMDD')
              || case when nullif(trim(new.review_note), '') is not null
                      then ' · ' || left(new.review_note, 120) else '' end);
  end if;

  return new;
end $$;

drop trigger if exists eod_submissions_notify on public.eod_submissions;
create trigger eod_submissions_notify
  after insert or update on public.eod_submissions
  for each row execute function public.eod_notify();

-- ── Whose EOD may this person see? ─────────────────────────────────────────

create or replace function public.eod_visible_people()
returns table (employee_id uuid, employee_name text, team_name text, relationship text)
language sql
stable
security definer
set search_path to 'public'
as $$
  /* Three answers, one per kind of reader, and a person may qualify for more
     than one — a lead is also an employee — so the rows are unioned and
     de-duplicated on the strongest relationship. */
  with me as (
    select coalesce(p.full_name, p.email, 'You') as name from public.profiles p where p.id = auth.uid()
  ),
  mine as (
    select auth.uid() as employee_id, (select name from me) as employee_name,
           null::text as team_name, 'self'::text as relationship
     where public.is_agency_staff()
  ),
  my_team as (
    select distinct tm.user_id, coalesce(p.full_name, p.email, 'Unknown'), t.name, 'led'::text
      from public.team_memberships lead
      join public.teams t on t.id = lead.team_id and t.archived_at is null
      join public.team_memberships tm on tm.team_id = t.id and tm.user_id <> auth.uid()
      join public.profiles p on p.id = tm.user_id
     where lead.user_id = auth.uid() and lead.is_lead and public.is_agency_staff()
  ),
  everyone as (
    /* Management sees the organisation. Gated on ops.manage, not on being an
       administrator by role: the capability is the thing that can be granted. */
    select distinct m.user_id, coalesce(p.full_name, p.email, 'Unknown'),
           null::text, 'managed'::text
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active' and m.user_id <> auth.uid()
       and public.is_agency_staff() and public.agency_can('ops.manage')
  ),
  all_rows as (select * from mine union all select * from my_team union all select * from everyone)
  select distinct on (employee_id) employee_id, employee_name, team_name, relationship
    from all_rows
   /* self beats led beats managed, so somebody on your team is shown as yours
      rather than as one of the hundred. */
   order by employee_id, case relationship when 'self' then 0 when 'led' then 1 else 2 end
$$;

comment on function public.eod_visible_people() is
  'Whose EOD the caller may read: always themselves, everybody on a team they lead, and — with ops.manage — the whole agency. An ordinary agent gets exactly one row.';

grant execute on function public.eod_visible_people() to authenticated;
