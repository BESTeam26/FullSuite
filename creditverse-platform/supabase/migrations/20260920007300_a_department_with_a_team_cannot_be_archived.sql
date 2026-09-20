-- A department that still has a team is not finished with.
--
-- BES CRM's Automation Department was archived while CRM Team — three people,
-- live — was still attached to it. The team did not move; it was simply left
-- pointing at a department the structure no longer admits. The consequences
-- were quiet and real: those three had no department, so their hours landed
-- under "no department" on every report, and `default_department_for` could
-- not answer for them.
--
-- Restored, because the team is using it. If it should go, the team moves
-- first — which is now the only order the database allows.

do $$
declare v_teams int;
begin
  select count(*) into v_teams
    from public.teams t join public.departments d on d.id = t.department_id
   where t.archived_at is null and d.archived_at is not null;

  update public.departments d
     set archived_at = null
   where d.archived_at is not null
     and exists (select 1 from public.teams t
                  where t.department_id = d.id and t.archived_at is null);
  raise notice 'Departments restored because a live team still belongs to them: %', v_teams;
end $$;

/**
 * Refuse to archive a department that still has a live team.
 *
 * Not a style rule: an orphaned team silently loses its department everywhere
 * that derives one — hours, production, reports, the EOD routing — and
 * nothing anywhere says why.
 */
create or replace function public.department_keeps_its_teams() returns trigger
language plpgsql set search_path = public as $function$
declare v_teams text;
begin
  if new.archived_at is not null and old.archived_at is null then
    select string_agg(t.name, ', ' order by t.name) into v_teams
      from public.teams t where t.department_id = new.id and t.archived_at is null;
    if v_teams is not null then
      raise exception 'Move % to another department before archiving this one.', v_teams
        using errcode = '22023';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists departments_keep_their_teams on public.departments;
create trigger departments_keep_their_teams
  before update of archived_at on public.departments
  for each row execute function public.department_keeps_its_teams();

comment on trigger departments_keep_their_teams on public.departments is
  'Archiving a department with a live team is refused by name. An orphaned team loses its department everywhere a department is derived, silently (2026-09-20).';

/* Now that the link is whole again, the hours can find their department. */
update public.time_entries te
   set department_id = public.default_department_for(te.employee_id)
 where te.department_id is null
   and te.division_id not in ('admin', 'meeting');
