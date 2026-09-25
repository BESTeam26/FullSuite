-- A crosswalk row pointing at a deleted work file is worse than no row.
--
-- Seven of Kevin Hernandez's cards imported as nothing, with
-- "client_department_statuses_client_id_fkey". The import was writing a
-- department row against a work file that does not exist.
--
-- ── HOW ───────────────────────────────────────────────────────────────────
--
-- `client_match_for_import` starts at the ClickUp crosswalk: "we imported this
-- card before, here is the row". Its comment says "True by construction: we
-- recorded it last time." That stopped being true on 2026-09-23, when the
-- pilot clear deleted every non-fixture `fulfillment_clients` row and left
-- `import_links` untouched — my migration, and the same omission that left
-- eighteen canonical people without a work file.
--
-- So the matcher confidently returned an id for a row that had been deleted.
-- The importer took the "already exists" branch, updated nothing, and then
-- inserted a department row against the dead id. Nothing about that is
-- visible until the foreign key refuses it.
--
-- ── THE FIX IS IN BOTH PLACES ─────────────────────────────────────────────
--
-- The matcher now confirms the row is still there. "True by construction" is
-- exactly the kind of assumption that survives long after the construction
-- changed, and a crosswalk is a pointer into another table — a pointer
-- nobody checks is a pointer that is eventually wrong.
--
-- And the seven dangling rows are deleted, so a re-import treats those cards
-- as new. They record that a card was imported into something that no longer
-- exists; there is nothing to preserve.
--
-- Cost impact: no material increase — one existence check on a primary key,
-- on a path that already reads the table.
--
-- A NOTE FOR THE NEXT CLEAR: deleting work files leaves behind their
-- canonical people, their crosswalk rows, and anything else keyed to them.
-- `20260923017000` did all three. A clear should say what it is NOT deleting.

begin;

delete from public.import_links l
 where l.source_kind = 'task'
   and l.entity_type = 'fulfillment_client'
   and not exists (select 1 from public.fulfillment_clients fc where fc.id::text = l.entity_id);

do $$
declare
  v_def text := pg_get_functiondef(
    'public.client_match_for_import(uuid,text,text,text,text,text,text,date)'::regprocedure);
  v_new text;
  v_old constant text :=
E'  select entity_id::uuid into v_id from public.import_links\n'
'   where source_system = p_source_system and source_kind = ''task''\n'
'     and source_id = p_task_id and entity_type = ''fulfillment_client'';\n'
'  if v_id is not null then return v_id; end if;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'client_match_for_import is not the shape this migration expects';
  end if;

  v_new := replace(v_def, v_old,
E'  select l.entity_id::uuid into v_id from public.import_links l\n'
'   where l.source_system = p_source_system and l.source_kind = ''task''\n'
'     and l.source_id = p_task_id and l.entity_type = ''fulfillment_client''\n'
'     /* …and the row is STILL THERE. This said "true by construction: we\n'
'        recorded it last time", which stopped being true the day the pilot\n'
'        clear deleted the work files and left the crosswalk behind. The\n'
'        matcher then handed back a dead id and the import wrote a department\n'
'        row against it (2026-09-25). */\n'
'     and exists (select 1 from public.fulfillment_clients fc\n'
'                  where fc.id::text = l.entity_id);\n'
'  if v_id is not null then return v_id; end if;');

  execute v_new;
end $$;

/* Nothing points at a work file that is not there. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.import_links l
   where l.source_kind = 'task' and l.entity_type = 'fulfillment_client'
     and not exists (select 1 from public.fulfillment_clients fc where fc.id::text = l.entity_id);
  if v_bad > 0 then
    raise exception '% crosswalk rows still dangle', v_bad;
  end if;
end $$;

commit;
