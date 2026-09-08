-- 0209 — POSITIONS. A seat in the company, which a person may or may not be in.
--
-- ---------------------------------------------------------------------------
-- WHY A SEAT IS NOT A PERSON
--
--   BES → Company Leadership → Operating Divisions → Departments → Teams
--       → POSITIONS → the people occupying them
--
-- Everything except POSITIONS existed. The reason the gap matters is that the
-- two questions an owner actually asks cannot be answered without it:
--
--   "Who is the CreditOps Processing Lead?"   → may be NOBODY
--   "Who was it in March?"                    → must not change when
--                                               somebody moves in April
--
-- A title written on a person (`agency_memberships.job_title`) answers
-- neither. It disappears when they leave — so a vacancy looks like an absence
-- of work rather than an unfilled seat — and it is overwritten when they are
-- promoted, so March quietly becomes April (rule 4: historical attribution
-- must not change when current assignments change).
--
-- Dee, §7: "Vacancy is valid. CFO — VACANT. Do not delete the Position, hide
-- it, create a fake employee, or require a placeholder account."
--
-- ---------------------------------------------------------------------------
-- THREE STATES, ALL DERIVED, NONE STORED
--
--   FILLED    somebody holds it permanently today
--   COVERED   nobody holds it, but somebody is acting, interim or temporary
--   VACANT    neither
--
-- Computed from the dated assignments rather than kept in a column. A stored
-- state drifts the first night an assignment lapses and nothing runs.
--
-- §8's example is the whole reason ACTING is its own kind rather than a flag:
-- CFO is permanently VACANT and Dee is acting in it, while Dee remains
-- permanently CEO. When a CFO is hired, the new person is assigned and the
-- acting coverage ends — nothing is restructured, and both facts were true at
-- once beforehand.
--
-- ---------------------------------------------------------------------------
-- WHAT A POSITION IS NOT
--
-- It is NOT a permission. `agency_memberships.role` is the permission set,
-- and 0173 already recorded why they are kept apart: "Operations Manager" is
-- a job, `agency_manager` is an access level, and inferring one from the
-- other is how a title grants access nobody granted. NOTHING in this
-- migration is read by any authorization helper, and nothing here may ever
-- be. A matrix probe asserts that.
-- ---------------------------------------------------------------------------

-- ── §10, §11 — where a division sits, and whether it is an operating one ──
--
-- Dee: "The three current operational Divisions are CREDITOPS, TALENTOPS, BES
-- CRM... FundingOps currently sits organizationally under CreditOps... Do not
-- display Corporate as a fourth operating Division just because a legacy
-- compatibility enum value exists."
--
-- FundingOps stays a `divisions` ROW and is NESTED under CreditOps rather
-- than converted into a department. That distinction is the whole point:
-- `departments.division` is the enum `in_scope()` reads, and 0173's trigger
-- sets it from the parent division's service. Re-parenting FundingOps'
-- seven departments under CreditOps would silently flip seven `division`
-- enums from `fundingops` to `creditops` — which is an AUTHORIZATION change
-- dressed as an org-chart tidy-up, and precisely what §28 forbids: "FundingOps
-- being organizationally under CreditOps does NOT grant FundingOps module
-- access."
--
-- So: display hierarchy moves, authorization does not move at all.
alter table public.divisions
  add column if not exists parent_division_id uuid references public.divisions(id) on delete set null,
  add column if not exists tier text not null default 'operating'
    check (tier in ('leadership', 'operating'));

comment on column public.divisions.parent_division_id is
  'Organizational nesting only. FundingOps sits under CreditOps here while keeping its own `service`, so the `departments.division` enum that in_scope() reads is untouched — the chart moves, access does not (Dee, §12 with §28).';
comment on column public.divisions.tier is
  '`leadership` sits above or outside the operating divisions and is never counted as one (Dee, §10, §11). `operating` is CreditOps, TalentOps and BES CRM.';

/* A division cannot be its own ancestor. Without this the chart renderer
   walks forever and the failure looks like a hung page. */
create or replace function public.division_no_cycle()
returns trigger language plpgsql set search_path = public as $function$
declare v_at uuid := new.parent_division_id; v_hops int := 0;
begin
  while v_at is not null loop
    if v_at = new.id then
      raise exception 'A division cannot sit under itself' using errcode = 'P0001';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 16 then
      raise exception 'Division nesting is too deep' using errcode = 'P0001';
    end if;
    select parent_division_id into v_at from public.divisions where id = v_at;
  end loop;
  return new;
end;
$function$;
drop trigger if exists divisions_no_cycle on public.divisions;
create trigger divisions_no_cycle before insert or update of parent_division_id on public.divisions
  for each row when (new.parent_division_id is not null)
  execute function public.division_no_cycle();

update public.divisions v
   set parent_division_id = (select c.id from public.divisions c
                              where c.agency_id = v.agency_id and c.service = 'creditops')
 where v.service = 'fundingops' and v.parent_division_id is null;

update public.divisions set tier = 'leadership' where service = 'corporate';

-- ── The seats ───────────────────────────────────────────────────────────
create table public.positions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 120),
  /** All three NULLABLE. A company-level seat — CEO, CFO — belongs to no
      division at all, which is §5 and is why none of these is required. */
  division_id   uuid references public.divisions(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  team_id       uuid references public.teams(id) on delete set null,
  /** §9: seat reports to seat, and the current manager is DERIVED from
      whoever occupies it. Drawing the line person-to-person would redraw the
      whole chart every time one person changed jobs. */
  reports_to_position_id uuid references public.positions(id) on delete set null,
  description   text,
  status        text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  /** How many people this seat allows. Two Processors on one line is one
      position with headcount 2, not two positions nobody can tell apart. */
  headcount     integer not null default 1 check (headcount between 1 and 500),
  sort          integer not null default 0,
  archived_at   timestamptz,
  is_fixture    boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index positions_title_idx
  on public.positions (agency_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(title)))
  where archived_at is null;
create index positions_agency_idx on public.positions (agency_id) where archived_at is null;
create index positions_department_idx on public.positions (department_id) where department_id is not null;
create index positions_team_idx on public.positions (team_id) where team_id is not null;
create index positions_reports_idx on public.positions (reports_to_position_id) where reports_to_position_id is not null;
create trigger positions_updated_at before update on public.positions
  for each row execute function public.set_updated_at();

comment on table public.positions is
  'A seat in the company. Exists whether or not anybody is in it, which is what makes a vacancy visible and what stops a promotion rewriting who held the seat last quarter. No person''s identity is stored here (Dee, §5).';

/* A seat cannot report to itself, directly or around a loop. */
create or replace function public.position_no_cycle()
returns trigger language plpgsql set search_path = public as $function$
declare v_at uuid := new.reports_to_position_id; v_hops int := 0;
begin
  while v_at is not null loop
    if v_at = new.id then
      raise exception 'A position cannot report to itself, directly or through a loop'
        using errcode = 'P0001';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 64 then
      raise exception 'Reporting line is too deep' using errcode = 'P0001';
    end if;
    select reports_to_position_id into v_at from public.positions where id = v_at;
  end loop;
  return new;
end;
$function$;
drop trigger if exists positions_no_cycle on public.positions;
create trigger positions_no_cycle
  before insert or update of reports_to_position_id on public.positions
  for each row when (new.reports_to_position_id is not null)
  execute function public.position_no_cycle();

/* A seat and its placement belong to the same agency. A foreign key proves
   the row exists, not that it is ours. */
create or replace function public.position_placement_matches()
returns trigger language plpgsql set search_path = public as $function$
declare v_agency uuid;
begin
  if new.department_id is not null then
    select agency_id into v_agency from public.departments where id = new.department_id;
    if v_agency is distinct from new.agency_id then
      raise exception 'That department belongs to a different agency' using errcode = 'P0001';
    end if;
  end if;
  if new.team_id is not null then
    select agency_id into v_agency from public.teams where id = new.team_id;
    if v_agency is distinct from new.agency_id then
      raise exception 'That team belongs to a different agency' using errcode = 'P0001';
    end if;
  end if;
  if new.division_id is not null then
    select agency_id into v_agency from public.divisions where id = new.division_id;
    if v_agency is distinct from new.agency_id then
      raise exception 'That division belongs to a different agency' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists positions_placement_matches on public.positions;
create trigger positions_placement_matches
  before insert or update of division_id, department_id, team_id, agency_id on public.positions
  for each row execute function public.position_placement_matches();

-- ── Who is in a seat, and when they were ────────────────────────────────
--
-- Append-and-end-only. An assignment is ENDED, never deleted (rule 11, and
-- §6: "Never overwrite historical holders"), which is the entire mechanism by
-- which "who held this in March" keeps its answer.
create table public.position_assignments (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  position_id     uuid not null references public.positions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  /** §6. `permanent` occupies the seat; the other three cover it. */
  assignment_type text not null default 'permanent'
    check (assignment_type in ('permanent', 'acting', 'interim', 'temporary')),
  effective_from  date not null default current_date,
  effective_until date,
  note            text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  ended_by        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz,
  updated_at      timestamptz not null default now(),
  constraint position_assignments_dates check (effective_until is null or effective_until >= effective_from)
);
create index position_assignments_position_idx on public.position_assignments (position_id);
create index position_assignments_user_idx on public.position_assignments (user_id) where effective_until is null;
/* One live assignment per person per seat per kind. Somebody can have been a
   holder before and be one now; they cannot be one twice at once. */
create unique index position_assignments_live_idx
  on public.position_assignments (position_id, user_id, assignment_type)
  where effective_until is null;
create trigger position_assignments_updated_at before update on public.position_assignments
  for each row execute function public.set_updated_at();

comment on table public.position_assignments is
  'Who sits in a seat, dated. Ended rather than deleted, so a reassignment cannot rewrite who did the work before it (rule 4, Dee §6).';

/* Headcount means something or it means nothing. Counting only LIVE
   PERMANENT holders — coverage does not consume the seat it is covering,
   which is the whole point of it being a different kind (§8). */
create or replace function public.position_respects_headcount()
returns trigger language plpgsql set search_path = public as $function$
declare v_live int; v_cap int;
begin
  if new.assignment_type <> 'permanent' or new.effective_until is not null then
    return new;
  end if;
  select headcount into v_cap from public.positions where id = new.position_id;
  select count(*) into v_live from public.position_assignments
   where position_id = new.position_id and assignment_type = 'permanent'
     and effective_until is null and id <> new.id;
  if v_live >= coalesce(v_cap, 1) then
    raise exception 'That position already has % of % seats filled. Raise the headcount or end an assignment first.', v_live, v_cap
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
drop trigger if exists position_assignments_headcount on public.position_assignments;
create trigger position_assignments_headcount
  before insert or update on public.position_assignments
  for each row execute function public.position_respects_headcount();

/* End an assignment. A function rather than a bare UPDATE so the end date
   can never precede the start, and so ending is one traceable act. */
create or replace function public.end_position_assignment(p_id uuid, p_on date default current_date)
returns void language plpgsql security invoker set search_path = public as $function$
declare v_from date;
begin
  select effective_from into v_from from public.position_assignments where id = p_id;
  if v_from is null then
    raise exception 'No such assignment' using errcode = 'P0002';
  end if;
  if p_on < v_from then
    raise exception 'An assignment cannot end before it started' using errcode = 'P0001';
  end if;
  update public.position_assignments
     set effective_until = p_on, ended_at = now(), ended_by = auth.uid()
   where id = p_id and effective_until is null;
end;
$function$;
revoke execute on function public.end_position_assignment(uuid, date) from public, anon;
grant execute on function public.end_position_assignment(uuid, date) to authenticated;

-- ── Authorization: the same key that governs the rest of the shape ──────
alter table public.positions enable row level security;
alter table public.position_assignments enable row level security;
revoke all on public.positions, public.position_assignments from public, anon, authenticated;
grant select, insert, update on public.positions to authenticated;
grant select, insert, update on public.position_assignments to authenticated;
-- No delete grant on either. A position is archived; an assignment is ended.

create policy positions_select on public.positions for select to authenticated
  using (public.is_staff_of(agency_id));
create policy positions_insert on public.positions for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
create policy positions_update on public.positions for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));

/* Reading who sits where is ordinary for staff — it is the org chart.
   Putting somebody in a seat is structure management, the same key that
   creates the seat, because the two together are what the chart says. */
create policy position_assignments_select on public.position_assignments for select to authenticated
  using (public.is_staff_of(agency_id));
create policy position_assignments_insert on public.position_assignments for insert to authenticated
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));
create policy position_assignments_update on public.position_assignments for update to authenticated
  using (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'))
  with check (public.is_staff_of(agency_id) and public.agency_can('org.structure.manage'));

-- ── The chart, in one query ─────────────────────────────────────────────
--
-- Rule 14: an org chart drawn by asking each seat who is in it is an N+1 over
-- the whole company. One function returns every seat with its live people
-- already attached, its derived state, and the person its reporting line
-- currently resolves to (§9).
create or replace function public.agency_positions(p_agency uuid)
returns table (
  id uuid, title text, description text, status text,
  division_id uuid, division_name text, division_tier text, division_parent_id uuid,
  department_id uuid, department_name text, team_id uuid, team_name text,
  reports_to_id uuid, reports_to_title text, reports_to_person text,
  headcount integer, sort integer, archived_at timestamptz,
  state text, holders jsonb, coverage jsonb
)
language sql stable security invoker set search_path = public as $function$
  select p.id, p.title, p.description, p.status,
         p.division_id, v.name, v.tier, v.parent_division_id,
         p.department_id, d.name, p.team_id, t.name,
         p.reports_to_position_id, rp.title,
         /* §9: whoever currently occupies the seat this one reports to. */
         (select coalesce(nullif(trim(mp.full_name), ''), mp.email)
            from public.position_assignments ra
            join public.profiles mp on mp.id = ra.user_id
           where ra.position_id = p.reports_to_position_id
             and ra.assignment_type = 'permanent' and ra.effective_until is null
           order by ra.effective_from limit 1),
         p.headcount, p.sort, p.archived_at,
         case
           when exists (select 1 from public.position_assignments a
                         where a.position_id = p.id and a.assignment_type = 'permanent'
                           and a.effective_until is null) then 'filled'
           when exists (select 1 from public.position_assignments a
                         where a.position_id = p.id and a.effective_until is null) then 'covered'
           else 'vacant'
         end,
         coalesce((select jsonb_agg(jsonb_build_object(
                    'assignmentId', a.id, 'userId', a.user_id,
                    'name', coalesce(nullif(trim(pr.full_name), ''), pr.email),
                    'from', a.effective_from) order by a.effective_from)
                     from public.position_assignments a
                     join public.profiles pr on pr.id = a.user_id
                    where a.position_id = p.id and a.assignment_type = 'permanent'
                      and a.effective_until is null), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                    'assignmentId', a.id, 'userId', a.user_id,
                    'name', coalesce(nullif(trim(pr.full_name), ''), pr.email),
                    'type', a.assignment_type, 'from', a.effective_from,
                    'note', a.note) order by a.effective_from)
                     from public.position_assignments a
                     join public.profiles pr on pr.id = a.user_id
                    where a.position_id = p.id and a.assignment_type <> 'permanent'
                      and a.effective_until is null), '[]'::jsonb)
    from public.positions p
    left join public.divisions v on v.id = p.division_id
    left join public.departments d on d.id = p.department_id
    left join public.teams t on t.id = p.team_id
    left join public.positions rp on rp.id = p.reports_to_position_id
   where p.agency_id = p_agency
   order by v.tier desc, v.sort nulls first, d.sort, p.sort, p.title
$function$;
revoke execute on function public.agency_positions(uuid) from public, anon;
grant execute on function public.agency_positions(uuid) to authenticated;

comment on function public.agency_positions(uuid) is
  'Every seat with its live people, derived state and current reporting person, in ONE call. SECURITY INVOKER so the caller''s own policies still decide — a definer here would hand the whole chart to somebody RLS would refuse (rule 14).';

/* The reporting line, resolved to a PERSON, for anywhere that needs "who is
   my manager" rather than the whole chart. Derived, never stored (§9). */
create or replace function public.manager_of(p_user uuid)
returns uuid
language sql stable security definer set search_path = public as $function$
  select ra.user_id
    from public.position_assignments a
    join public.positions p on p.id = a.position_id
    join public.position_assignments ra
      on ra.position_id = p.reports_to_position_id
     and ra.assignment_type = 'permanent' and ra.effective_until is null
   where a.user_id = p_user and a.assignment_type = 'permanent' and a.effective_until is null
     and p.archived_at is null
   order by a.effective_from
   limit 1
$function$;
revoke execute on function public.manager_of(uuid) from public, anon;
grant execute on function public.manager_of(uuid) to authenticated;

comment on function public.manager_of(uuid) is
  'Who this person currently reports to, derived from seat-to-seat reporting. NOT read by any authorization helper — a reporting line is an organizational fact, not a permission (Dee, §9 with §20).';
