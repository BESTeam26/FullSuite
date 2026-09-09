-- =============================================================================
-- People management, part 2: leave with rules, and derived attendance.
--
-- LEAVE — the same approval doctrine as time (0236): a person REQUESTS, a
-- lead or manager DECIDES (never their own), both identities and both states
-- are recorded, and the requester is told. Leave types are ROWS, not an enum
-- (rule 17: customization is data). The overlap rule is a database
-- constraint, so two approved requests for the same day cannot exist no
-- matter which screen asks.
--
-- ATTENDANCE — derived, never hand-marked (rule 9). late / absent /
-- over-break / over-lunch are arithmetic over three canonical sources:
-- work_schedules (what was expected), time_entries (what happened),
-- leave_requests (what was excused). Nobody writes an attendance row;
-- there is nothing to falsify and nothing to forget.
-- =============================================================================

create extension if not exists btree_gist;

-- ── Leave types are rows ──────────────────────────────────────────────────
create table public.leave_types (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  code       text not null check (length(trim(code)) between 1 and 40),
  label      text not null check (length(trim(label)) between 1 and 80),
  paid       boolean not null default true,
  active     boolean not null default true,
  sort       integer not null default 100,
  created_at timestamptz not null default now(),
  constraint leave_types_code_uq unique (agency_id, code)
);
alter table public.leave_types enable row level security;
create policy leave_types_select on public.leave_types
  for select to authenticated using (is_staff_of(agency_id));
create policy leave_types_manage on public.leave_types
  for all to authenticated
  using (is_manager_of(agency_id)) with check (is_manager_of(agency_id));

insert into public.leave_types (agency_id, code, label, paid, sort)
select a.id, v.code, v.label, v.paid, v.sort
  from public.agencies a,
       (values ('vacation', 'Vacation', true,  10),
               ('sick',     'Sick leave', true, 20),
               ('personal', 'Personal day', true, 30),
               ('unpaid',   'Unpaid leave', false, 40)) as v(code, label, paid, sort)
on conflict (agency_id, code) do nothing;

-- ── Requests ──────────────────────────────────────────────────────────────
create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type_id       uuid not null references public.leave_types(id),
  starts_on     date not null,
  ends_on       date not null,
  reason        text,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  constraint leave_requests_dates_ck check (
    ends_on >= starts_on
    and ends_on - starts_on < 62            -- one request, not a sabbatical
    and starts_on < (now() at time zone 'utc')::date + 366
  ),
  /* THE rule: one person cannot hold two live requests over the same day.
     Enforced here, so it holds for every writer forever. */
  constraint leave_requests_no_overlap exclude using gist (
    user_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status in ('pending', 'approved'))
);
create index leave_requests_user_idx on public.leave_requests (user_id, starts_on desc);
create index leave_requests_agency_idx on public.leave_requests (agency_id, status);

alter table public.leave_requests enable row level security;

/* Read: your own; managers, all; a lead, their team's. */
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (
    is_staff_of(agency_id)
    and (
      user_id = auth.uid()
      or is_manager_of(agency_id)
      or exists (
        select 1
          from public.team_memberships lead_m
          join public.team_memberships member_m on member_m.team_id = lead_m.team_id
         where lead_m.user_id = auth.uid() and lead_m.is_lead
           and member_m.user_id = leave_requests.user_id
      )
    )
  );

/* A person submits their own request, pending, nothing decided. */
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated
  with check (
    user_id = auth.uid() and is_staff_of(agency_id)
    and status = 'pending' and decided_by is null and decided_at is null
  );

/* The only self-service change: withdrawing your own request while it is
   still pending. Decisions go through decide_leave_request. */
create policy leave_requests_cancel on public.leave_requests
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled'
              and decided_by is null and decided_at is null);

-- ── Submission tells the leads ────────────────────────────────────────────
create or replace function public.notify_leave_requested()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_name text; v_type text;
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name
    from public.profiles where id = new.user_id;
  select label into v_type from public.leave_types where id = new.type_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  select distinct tm2.user_id, new.agency_id, 'leave', 'leave_request', new.id::text,
         'Team EOD', v_name || ' requested ' || coalesce(v_type, 'leave'),
         to_char(new.starts_on, 'FMMon DD') ||
           case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'FMMon DD') else '' end ||
           coalesce('. "' || nullif(trim(new.reason), '') || '"', '') ||
           ' Decide it from Team EOD.',
         'bes_internal'
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.is_lead
   where tm.user_id = new.user_id
     and tm2.user_id <> new.user_id;
  return null;
end $function$;

create trigger leave_requests_notify
  after insert on public.leave_requests
  for each row execute function public.notify_leave_requested();

-- ── Decision: a lead or manager, never their own ──────────────────────────
create or replace function public.decide_leave_request(
  p_request uuid, p_approve boolean, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $function$
declare
  r record;
  v_allowed boolean;
  v_decider text;
  v_type text;
begin
  select * into r from public.leave_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then
    raise exception 'This request was already %', r.status;
  end if;
  if r.user_id = auth.uid() then
    raise exception 'You cannot decide your own leave request' using errcode = '42501';
  end if;

  v_allowed := public.is_manager_of(r.agency_id)
    or exists (
      select 1
        from public.team_memberships lead_m
        join public.team_memberships member_m on member_m.team_id = lead_m.team_id
       where lead_m.user_id = auth.uid() and lead_m.is_lead
         and member_m.user_id = r.user_id
    );
  if not v_allowed then
    raise exception 'Deciding leave needs a lead of their team, or management access'
      using errcode = '42501';
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  select coalesce(nullif(trim(full_name), ''), email) into v_decider
    from public.profiles where id = auth.uid();
  select label into v_type from public.leave_types where id = r.type_id;

  insert into public.notifications (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
  values (r.user_id, r.agency_id, 'leave', 'leave_request', r.id::text, 'My Time',
          'Your ' || coalesce(v_type, 'leave') || ' request was ' || case when p_approve then 'approved' else 'declined' end,
          to_char(r.starts_on, 'FMMon DD') ||
            case when r.ends_on <> r.starts_on then '–' || to_char(r.ends_on, 'FMMon DD') else '' end ||
            ' · decided by ' || v_decider ||
            coalesce('. "' || nullif(trim(coalesce(p_note, '')), '') || '"', ''),
          'bes_internal');
end $function$;

revoke execute on function public.decide_leave_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave_request(uuid, boolean, text) to authenticated;

-- ── The notification vocabulary grows by one ──────────────────────────────
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention', 'dm',
                  'handoff', 'announcement', 'attention', 'timer', 'leave'));

-- entity_visible learns leave_request (default-deny hides unknown types).
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id::text = p_entity_id)
    when 'leave_request'      then exists (select 1 from public.leave_requests lr where lr.id::text = p_entity_id)
    else false
  end
$function$;

-- ── Attendance, derived ───────────────────────────────────────────────────
-- SECURITY DEFINER with its own explicit gate, deliberately: leads must see
-- their team's attendance, but the base time_entries policy is self-or-
-- manager, and widening the raw table for leads would expose every entry's
-- client and note. This exposes ARITHMETIC — minutes and marks — to exactly
-- self ∪ manager(all) ∪ lead(their teams).
create or replace function public.attendance_for(p_from date, p_to date)
returns table (
  user_id            uuid,
  day                date,
  scheduled          boolean,
  on_leave           boolean,
  leave_label        text,
  first_in           timestamptz,
  last_out           timestamptz,
  work_minutes       integer,
  break_minutes      integer,
  lunch_minutes      integer,
  late_minutes       integer,
  overbreak_minutes  integer,
  overlunch_minutes  integer,
  status             text
)
language sql stable security definer set search_path = public as $function$
  with bounds as (
    select p_from as from_d, p_to as to_d
     where p_to >= p_from and p_to - p_from < 62   -- bounded, always (rule 7)
  ),
  visible_people as (
    select am.user_id, am.agency_id
      from public.agency_memberships am
     where am.status = 'active'
       and public.is_staff_of(am.agency_id)
       and (
         am.user_id = auth.uid()
         or public.is_manager_of(am.agency_id)
         or exists (
           select 1
             from public.team_memberships lead_m
             join public.team_memberships member_m on member_m.team_id = lead_m.team_id
            where lead_m.user_id = auth.uid() and lead_m.is_lead
              and member_m.user_id = am.user_id
         )
       )
  ),
  days as (
    select p.user_id, p.agency_id, d::date as day
      from visible_people p, bounds b, generate_series(b.from_d, b.to_d, interval '1 day') d
  ),
  with_schedule as (
    select d.*, s.work_days, s.shift_start, s.shift_end, s.lunch_minutes as lunch_allowed,
           s.break_minutes as break_allowed, s.grace_minutes, s.timezone
      from days d
      left join lateral (
        select * from public.work_schedules ws
         where ws.user_id = d.user_id and ws.effective_from <= d.day
         order by ws.effective_from desc limit 1
      ) s on true
  ),
  with_time as (
    select w.*,
           t.first_in, t.last_out, t.work_min, t.break_min, t.lunch_min
      from with_schedule w
      left join lateral (
        select min(te.started_at) filter (where te.kind = 'work') as first_in,
               max(te.ended_at)   filter (where te.kind = 'work') as last_out,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'work'), 0)::int as work_min,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'break'), 0)::int as break_min,
               coalesce(sum(coalesce(te.duration_minutes,
                 floor(extract(epoch from (now() - te.started_at)) / 60)::int))
                 filter (where te.kind = 'lunch'), 0)::int as lunch_min
          from public.time_entries te
         where te.employee_id = w.user_id and te.work_date = w.day
      ) t on true
  ),
  with_leave as (
    select w.*, l.label as leave_label
      from with_time w
      left join lateral (
        select lt.label
          from public.leave_requests lr
          join public.leave_types lt on lt.id = lr.type_id
         where lr.user_id = w.user_id and lr.status = 'approved'
           and w.day between lr.starts_on and lr.ends_on
         limit 1
      ) l on true
  )
  select
    w.user_id, w.day,
    (w.work_days is not null and extract(isodow from w.day)::smallint = any (w.work_days)) as scheduled,
    (w.leave_label is not null) as on_leave,
    w.leave_label,
    w.first_in, w.last_out,
    w.work_min, w.break_min, w.lunch_min,
    /* Late: first work clock-in after shift start + grace, in the schedule's
       own timezone. No schedule, or not a working day, or on leave → 0. */
    case
      when w.work_days is null or w.leave_label is not null
        or extract(isodow from w.day)::smallint <> all (w.work_days)
        or w.first_in is null then 0
      else greatest(0, floor(extract(epoch from (
             w.first_in - ((w.day + w.shift_start) at time zone w.timezone
                           + make_interval(mins => w.grace_minutes)))) / 60)::int)
    end as late_minutes,
    greatest(0, w.break_min - coalesce(w.break_allowed, 0)) as overbreak_minutes,
    greatest(0, w.lunch_min - coalesce(w.lunch_allowed, 0)) as overlunch_minutes,
    case
      when w.leave_label is not null then 'on_leave'
      when w.work_days is null then 'no_schedule'
      when extract(isodow from w.day)::smallint <> all (w.work_days) then 'off'
      when w.first_in is null and w.day < (now() at time zone w.timezone)::date then 'absent'
      when w.first_in is null then 'not_in_yet'
      when w.first_in > ((w.day + w.shift_start) at time zone w.timezone
                         + make_interval(mins => w.grace_minutes)) then 'late'
      else 'present'
    end as status
  from with_leave w
  order by w.user_id, w.day
$function$;

revoke execute on function public.attendance_for(date, date) from public, anon;
grant execute on function public.attendance_for(date, date) to authenticated;

comment on function public.attendance_for(date, date) is
  'Derived attendance (rule 9): late/absent/over-break/over-lunch computed '
  'from schedules, time entries and approved leave. Never hand-marked; '
  'visible to self, team leads (their teams) and managers only.';
