-- 0150 — a new workspace can hold a task.
--
-- A workspace needs at least one status before any item can live in it:
-- `work_items_workspace_consistency` derives an item's canonical stage from
-- its status, and refuses the item when there is none. Nothing seeded them.
-- The workspaces that work today got their statuses from a migration's own
-- seed data; every workspace created through the application since has been
-- born empty, and the first task anybody tried to put in one failed with
-- "status belongs to another workspace" — a message that describes the
-- symptom and hides the cause.
--
-- This is not specific to the new agency workspaces; the customer path has the
-- same hole. So the fix belongs in the database, where it applies to every
-- workspace however it was created, rather than in whichever screen happened
-- to create this one.
--
-- The four statuses are a starting point, not a policy: an admin renames,
-- reorders and adds to them exactly as before. What they cannot do any more is
-- end up with a workspace that silently refuses work.
create or replace function public.workspace_seed_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_statuses (workspace_id, key, label, colour, position, canonical_stage, is_terminal)
  values
    (new.id, 'todo',        'To do',       'slate',   0, 'Queued',        false),
    (new.id, 'in_progress', 'In progress', 'blue',    1, 'In Processing', false),
    (new.id, 'blocked',     'Blocked',     'amber',   2, 'Blocked',       false),
    (new.id, 'done',        'Done',        'emerald', 3, 'Completed',     true);

  insert into public.workspace_boards (workspace_id, name, position)
  values (new.id, 'Tasks', 0);

  return new;
end $$;
revoke execute on function public.workspace_seed_defaults() from public, anon, authenticated;

create trigger workspace_seed_defaults after insert on public.workspaces
  for each row execute function public.workspace_seed_defaults();

comment on function public.workspace_seed_defaults() is
  'Gives a new workspace a usable status set and one board. Without at least one status the consistency trigger refuses every item, so a workspace with none is a workspace that silently rejects work.';
