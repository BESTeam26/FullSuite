-- =============================================================================
-- The timer records WHO the work was for (Dee, 2026-09-09: "add an option to
-- choose the partner they are working with… so we can filter out how many
-- hours has been dedicated for the partner and what tasks was that just like
-- in clockify"), and its buckets get the names the team actually uses:
-- "General" becomes "Admin", and "Meeting" joins it.
--
-- `division_id` is free text on this table, so the rename is a data change,
-- not a schema one — and the seven existing 'general' rows move with it,
-- because two values meaning the same thing is how one truth becomes several
-- (rule 2). Nothing else stores that string.
--
-- The partner is a nullable reference: admin time and meetings belong to no
-- partner, and forcing one would make people pick a lie. Which partners a
-- person may choose is decided where it always is — `can_see_partner`, so an
-- agent sees only the partners assigned to them (Dee: "They don't get to see
-- all partners, only the assigned one so it's not too chaotic").
-- =============================================================================

alter table public.time_entries
  add column if not exists partner_group_id uuid references public.outsourcing_groups(id) on delete set null;

comment on column public.time_entries.partner_group_id is
  'The partner this time was worked for, when it was worked for one. NULL for admin time, meetings and internal work. Choosing one is limited by can_see_partner, so nobody can log time against a partner they cannot see.';

create index if not exists time_entries_partner on public.time_entries (partner_group_id, work_date);

update public.time_entries set division_id = 'admin' where division_id = 'general';

/* The insert policy gates rows, not columns, so nothing else changes — but a
   person must not be able to attribute their hours to a partner they have no
   business seeing. A CHECK cannot call a stable function per row here, so the
   guard trigger enforces it beside the rules it already carries. */
create or replace function public.time_entry_partner_visible()
returns trigger
language plpgsql security invoker set search_path = public as $function$
begin
  if new.partner_group_id is not null and not public.can_see_partner(new.partner_group_id) then
    raise exception 'You can only log time against a partner assigned to you'
      using errcode = '42501';
  end if;
  return new;
end $function$;

drop trigger if exists time_entries_partner_visible on public.time_entries;
create trigger time_entries_partner_visible
  before insert or update of partner_group_id on public.time_entries
  for each row execute function public.time_entry_partner_visible();
