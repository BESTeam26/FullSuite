-- =============================================================================
-- A retired division cannot come back through a stale browser tab.
--
-- Found by phase 70's own probe during the live pilot ("no time entry still
-- says 'general' — one value per meaning"): ONE real entry, Dee's, logged
-- 2026-09-11, two days after 0283 renamed `general` to `admin`.
--
-- The rename fixed the rows that existed. It could not fix the cause:
-- `time_entries.division_id` is TEXT with no constraint, so any client can
-- write any string — including a browser tab still running the bundle from
-- before the rename, which is exactly what happened. A value nobody can
-- select in the current interface kept flowing in.
--
-- Two entries meaning "admin work" under two different names split the
-- division totals on My Time, the EOD figure and every production report that
-- groups by division — quietly, and only for whoever had the old tab open.
--
-- So the set is closed at the database, where a stale client cannot argue with
-- it. `meeting` and `admin` are timer-only values (0283) and belong here
-- beside the four services; `general` is normalised on the way in rather than
-- rejected, because a person's recorded hours are not the place to lose data
-- over a client-side cache.
-- =============================================================================

update public.time_entries set division_id = 'admin' where division_id = 'general';

create or replace function public.time_entry_division_normalise()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  /* The one retired name, mapped rather than refused: an agent whose tab is a
     release behind should still get credit for the hours they worked. */
  if new.division_id = 'general' then
    new.division_id := 'admin';
  end if;
  return new;
end $function$;
revoke execute on function public.time_entry_division_normalise() from public, anon, authenticated;

drop trigger if exists time_entries_division_normalise on public.time_entries;
create trigger time_entries_division_normalise
  before insert or update of division_id on public.time_entries
  for each row execute function public.time_entry_division_normalise();

alter table public.time_entries drop constraint if exists time_entries_division_known;
alter table public.time_entries add constraint time_entries_division_known
  check (division_id is null or division_id in
    ('creditops', 'fundingops', 'bes-crm', 'talentops', 'admin', 'meeting'));

comment on constraint time_entries_division_known on public.time_entries is
  'The timer''s divisions, closed (0300). A value the interface cannot offer must not be storable: it splits division totals on My Time, EOD and production reporting. `general` is normalised to `admin` by trigger before this check sees it.';
