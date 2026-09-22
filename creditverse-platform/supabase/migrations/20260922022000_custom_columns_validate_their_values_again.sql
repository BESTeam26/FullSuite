-- Custom columns must still refuse a value that is not their type.
--
-- A regression I introduced this morning. Migration 20260922005000 replaced
-- `work_item_field_values` with the generic `custom_field_values`, so a custom
-- column could describe a CreditOps client and not only a work item. It
-- carried the rows across, the policies and the marketing views — and not the
-- validation trigger, which was defined in a different migration
-- (20260904001600) and which I never saw while writing the new table.
--
-- So since this morning `custom_field_values` has had NO trigger of any kind:
--   · a date column accepts "soon"
--   · a select column accepts a choice that is not one of its choices
--   · a number column accepts a string
--   · an ARCHIVED column still accepts new values
--   · a field belonging to one workspace can be written onto another's item
--   · updated_at is never maintained
--
-- Nothing invalid was written in the meantime — the three stored values are a
-- number in a number column and two nulls — so this only has to start being
-- true, not repair anything.
--
-- ── WHY THE TESTS DID NOT CATCH IT ────────────────────────────────────────
--
-- They did, silently, in the worst way. Four probes wrote to the dropped
-- table; three of them EXPECT a refusal, so "relation does not exist" read as
-- a pass. Only the fourth — the one expecting a write to succeed — failed.
-- Three checks were green because the thing they tested had been deleted.
--
-- ── THE GENERALISED RULE ──────────────────────────────────────────────────
--
-- The old trigger asked one ownership question: does the field's workspace
-- match the item's? A column now belongs to a workspace (work items) OR to an
-- agency (its CreditOps clients), so the question is asked per entity_type,
-- and a value whose kind disagrees with its field's kind is refused outright.
-- Per-type checking is the 0904 logic unchanged — same types, same messages,
-- same errcode — because the rule was right; only its table moved.
--
-- Cost impact: no material increase. One STABLE lookup per value written, on
-- a table holding three rows.

create or replace function public.custom_field_values_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_options jsonb; v_archived timestamptz;
  v_field_entity text; v_ws uuid; v_agency uuid;
  v_owner_ok boolean;
begin
  select f.field_type, f.options, f.archived_at, f.entity_type, f.workspace_id, f.agency_id
    into v_type, v_options, v_archived, v_field_entity, v_ws, v_agency
    from public.workspace_fields f where f.id = new.field_id;

  if v_type is null then
    raise exception 'no such custom column' using errcode = '23514';
  end if;

  /* A column describes ONE kind of record. Writing a work-item column onto a
     client (or the reverse) is how a vocabulary stops meaning anything. */
  if v_field_entity is distinct from new.entity_type then
    raise exception 'that column describes a %, not a %', v_field_entity, new.entity_type
      using errcode = '23514';
  end if;

  v_owner_ok := case new.entity_type
    when 'work_item' then exists (
      select 1 from public.work_items w
       where w.id = new.entity_id and w.workspace_id is not distinct from v_ws)
    when 'fulfillment_client' then exists (
      select 1 from public.fulfillment_clients c
       where c.id = new.entity_id and c.agency_id is not distinct from v_agency)
    else false
  end;
  if not v_owner_ok then
    raise exception 'field belongs to another workspace' using errcode = '23514';
  end if;

  if v_archived is not null then
    raise exception 'field is archived' using errcode = '23514';
  end if;

  /* Clearing a value is always allowed — it is how a column is emptied. */
  if new.value is null or jsonb_typeof(new.value) = 'null' then
    new.updated_at := now();
    return new;
  end if;

  case v_type
    when 'text' then
      if jsonb_typeof(new.value) <> 'string' or length(new.value #>> '{}') > 2000 then
        raise exception 'text field expects a string of at most 2000 characters' using errcode = '23514'; end if;
    when 'number' then
      if jsonb_typeof(new.value) <> 'number' then
        raise exception 'number field expects a number' using errcode = '23514'; end if;
    when 'date' then
      if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'date field expects YYYY-MM-DD' using errcode = '23514'; end if;
      perform (new.value #>> '{}')::date;
    when 'select' then
      if jsonb_typeof(new.value) <> 'string'
         or not (coalesce(v_options -> 'choices', '[]'::jsonb) ? (new.value #>> '{}')) then
        raise exception 'select field expects one of its choices' using errcode = '23514'; end if;
    when 'checkbox' then
      if jsonb_typeof(new.value) <> 'boolean' then
        raise exception 'checkbox field expects true or false' using errcode = '23514'; end if;
    else
      raise exception 'unsupported field type %', v_type using errcode = '23514';
  end case;

  new.updated_at := now();
  return new;
end $$;

revoke execute on function public.custom_field_values_validate() from public, anon, authenticated;

drop trigger if exists custom_field_values_validate on public.custom_field_values;
create trigger custom_field_values_validate
  before insert or update on public.custom_field_values
  for each row execute function public.custom_field_values_validate();

/* Every value already stored must satisfy the rule being introduced. If one
   does not, the trigger would silently accept it on read and refuse the next
   edit of a row somebody is using — so this fails here instead. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.custom_field_values v
    join public.workspace_fields f on f.id = v.field_id
   where v.value is not null and jsonb_typeof(v.value) <> 'null'
     and ((f.field_type = 'number'   and jsonb_typeof(v.value) <> 'number')
       or (f.field_type = 'checkbox' and jsonb_typeof(v.value) <> 'boolean')
       or (f.field_type = 'text'     and jsonb_typeof(v.value) <> 'string')
       or (f.field_type = 'date'     and (jsonb_typeof(v.value) <> 'string'
                                       or (v.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'))
       or (f.field_type = 'select'   and not (coalesce(f.options -> 'choices', '[]'::jsonb) ? (v.value #>> '{}'))));
  if v_bad > 0 then
    raise exception '% stored custom values do not match their column type; repair them before enforcing', v_bad;
  end if;
end $$;
