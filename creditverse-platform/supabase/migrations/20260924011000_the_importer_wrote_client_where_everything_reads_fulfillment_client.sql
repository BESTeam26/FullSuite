-- 944 imported comments and 1,910 imported files existed and nothing showed
-- them.
--
-- Dee, 2026-09-24: "I don't see the comments and documents copied, I need
-- everything copied, all from ClickUp."
--
-- They were copied. Every one of them was written with
-- `entity_type = 'client'`, and every screen in CreditOps reads
-- `entity_type = 'fulfillment_client'`. The rows were in the database, gated
-- correctly by `entity_visible()`, and invisible.
--
-- This was already known. `use-client-work-detail.ts` carries the note, dated
-- 2026-09-12:
--
--   "`fulfillment_client`, not `client`: the canonical `clients` row is the
--    person, and these files belong to the CreditOps work file. The importer
--    used the wrong word and only got away with it because it ran as the
--    service role."
--
-- The READER was fixed that day. The writer was not, so every import since
-- has kept producing rows in the shape that had just been abandoned. Fixing
-- the consumer and leaving the producer is how a bug comes back with more
-- data behind it.
--
-- ── THE REPAIR IS UNAMBIGUOUS ─────────────────────────────────────────────
--
-- Checked before writing it: of the `'client'` rows, 950 activity events and
-- 1,979 files are keyed by a `fulfillment_clients` id, and NOT ONE by a
-- canonical `clients` id. So there is no person-level history to preserve and
-- no ambiguity about which rows mean what — every one belongs to a CreditOps
-- work file and is repointed.
--
-- 34 activity rows reference an id that is neither, left where they are: they
-- belong to the pilot clients cleared on 2026-09-23 and point at nothing.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_acts int; v_files int; v_wrong int;
begin
  /* If a person-level row has appeared since this was measured, stop. Moving
     it to 'fulfillment_client' would point it at a record that does not
     exist and hide it for good. */
  select count(*) into v_wrong from (
    select 1 from public.activity_events a
     where a.entity_type = 'client'
       and exists (select 1 from public.clients c where c.id::text = a.entity_id)
    union all
    select 1 from public.files f
     where f.entity_type = 'client'
       and exists (select 1 from public.clients c where c.id::text = f.entity_id)
  ) t;
  if v_wrong > 0 then
    raise exception '% rows are keyed by a canonical client id — decide those by hand', v_wrong;
  end if;

  update public.activity_events a set entity_type = 'fulfillment_client'
   where a.entity_type = 'client'
     and exists (select 1 from public.fulfillment_clients fc where fc.id::text = a.entity_id);
  get diagnostics v_acts = row_count;

  update public.files f set entity_type = 'fulfillment_client'
   where f.entity_type = 'client'
     and exists (select 1 from public.fulfillment_clients fc where fc.id::text = f.entity_id);
  get diagnostics v_files = row_count;

  raise notice 'repointed % comments and % files', v_acts, v_files;
end $$;

/* And the writer, so the next import does not recreate them. */
do $$
declare
  v_def text := pg_get_functiondef('public.clickup_import_client(jsonb)'::regprocedure);
  v_new text;
begin
  if position($q$'client', v_fc::text, null, v_note->>'author',$q$ in v_def) = 0 then
    raise exception 'clickup_import_client is not the shape this migration expects';
  end if;
  v_new := replace(v_def,
    $q$'client', v_fc::text, null, v_note->>'author',$q$,
    $q$'fulfillment_client', v_fc::text, null, v_note->>'author',$q$);
  execute v_new;
end $$;

/* Nothing imported is left in the shape no screen reads. */
do $$
declare v_left int;
begin
  select count(*) into v_left from (
    select 1 from public.activity_events a
     where a.entity_type = 'client'
       and exists (select 1 from public.fulfillment_clients fc where fc.id::text = a.entity_id)
    union all
    select 1 from public.files f
     where f.entity_type = 'client'
       and exists (select 1 from public.fulfillment_clients fc where fc.id::text = f.entity_id)
  ) t;
  if v_left > 0 then
    raise exception '% rows still say client', v_left;
  end if;
end $$;

commit;
