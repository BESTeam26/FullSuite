-- An hour inherits the department of whoever logged it.
--
-- Dee, 2026-09-20: "inherit the department they belong to as much as possible,
-- then just allow them to choose admin or meeting if possible. Meaning, add
-- automatic inherit then don't remove the option to manual track."
--
-- Time was booked to a DIVISION and never to a department, so every
-- department row on a productivity report showed zero minutes worked — not
-- missing, but structurally zero, which reads as an answer.
--
-- The department is now filled in from the person's own team when they start
-- a timer, and it is a DEFAULT, not a rule: anything the caller supplies is
-- kept. Admin and meeting stay exactly as they are — they are deliberately
-- not a department, and a null department is the honest record of that.
--
-- Also here, because it is the same report that suffers from it: the timer
-- books BES CRM as `bes-crm` and every division is keyed `bes_crm`. Grouped by
-- division the same division came back as two rows, 15 production units under
-- one spelling and 57 minutes under the other.

alter table public.time_entries
  add column if not exists department_id uuid references public.departments(id) on delete set null;

comment on column public.time_entries.department_id is
  'The department this hour belongs to. Filled in from the person''s team when the entry is created, and overridable. Null is correct for admin and meeting, which are not departments.';

create index if not exists time_entries_department_idx
  on public.time_entries (department_id, work_date) where department_id is not null;

/**
 * The department somebody belongs to, for defaulting an hour.
 *
 * Their team's department. Somebody on two teams in two departments has no
 * single answer, so they get NONE rather than whichever row sorted first — a
 * wrong department is worse than an absent one, because it is counted.
 */
create or replace function public.default_department_for(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $function$
  select case when count(*) = 1 then (array_agg(x.department_id))[1] end
    from (
      select distinct d.id as department_id
        from public.team_memberships tm
        join public.teams t on t.id = tm.team_id and t.archived_at is null
        join public.departments d on d.id = t.department_id and d.archived_at is null
       where tm.user_id = p_user
    ) x
$function$;
revoke all on function public.default_department_for(uuid) from public, anon;
grant execute on function public.default_department_for(uuid) to authenticated;

/** Fill the department in, without overriding a caller who named one. */
create or replace function public.time_entry_inherits_department() returns trigger
language plpgsql set search_path = public as $function$
begin
  if new.department_id is null then
    new.department_id := public.default_department_for(new.employee_id);
  end if;
  return new;
end $function$;

drop trigger if exists time_entries_inherit_department on public.time_entries;
create trigger time_entries_inherit_department
  before insert on public.time_entries
  for each row execute function public.time_entry_inherits_department();

comment on trigger time_entries_inherit_department on public.time_entries is
  'An hour inherits the logger''s department unless one was given (Dee, 2026-09-20: automatic inherit, manual still allowed).';

-- ── One spelling for BES CRM ──────────────────────────────────────────────
-- The constraint enumerates the timer's own vocabulary, so it has to learn the
-- corrected spelling before the data can. Both spellings are accepted for the
-- length of this migration and only the corrected one survives it.
alter table public.time_entries drop constraint if exists time_entries_division_known;
alter table public.time_entries add constraint time_entries_division_known
  check (division_id is null or division_id = any (array[
    'creditops', 'fundingops', 'bes_crm', 'bes-crm', 'talentops', 'admin', 'meeting']));

update public.time_entries set division_id = 'bes_crm' where division_id = 'bes-crm';

alter table public.time_entries drop constraint time_entries_division_known;
alter table public.time_entries add constraint time_entries_division_known
  check (division_id is null or division_id = any (array[
    'creditops', 'fundingops', 'bes_crm', 'talentops', 'admin', 'meeting']));
comment on constraint time_entries_division_known on public.time_entries is
  'The timer''s divisions, spelled as the org structure spells them. `bes-crm` was corrected to `bes_crm` on 2026-09-20 — the hyphen split BES CRM into two rows on every report.';

-- ── Backfill: the hours already logged get their department too ───────────
update public.time_entries te
   set department_id = public.default_department_for(te.employee_id)
 where te.department_id is null
   and te.division_id not in ('admin', 'meeting');

do $$
declare v_filled int; v_null int;
begin
  select count(*) filter (where department_id is not null),
         count(*) filter (where department_id is null)
    into v_filled, v_null from public.time_entries;
  raise notice 'Time entries with a department: %, without (admin/meeting or no single team): %', v_filled, v_null;
end $$;
