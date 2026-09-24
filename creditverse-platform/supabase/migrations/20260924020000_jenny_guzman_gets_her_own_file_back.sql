-- Jenny Guzman gets her own file back.
--
-- Her ClickUp card (86eykmp6g) carries Estebania De La Cruz's email and phone
-- number — a copied card — so the importer matched on those and filed Jenny's
-- comments onto Estebania's record. Dee: "2 Different names so why merge? -
-- DONT MERGE THEM."
--
-- 20260924019000 stops it happening again. This undoes the one that already
-- happened: the crosswalk row pointing Jenny's card at Estebania is removed,
-- so the next import treats that card as new and builds Jenny her own client.
--
-- ── WHAT ABOUT THE COMMENTS ALREADY ON ESTEBANIA'S FILE ───────────────────
--
-- They stay for now, and that is a deliberate, stated compromise rather than
-- an oversight. The comment crosswalk records WHICH COMMENT was imported, not
-- which card it arrived on, so there is nothing in the database that can tell
-- Jenny's comments from Estebania's on that file. Guessing by content would
-- be moving somebody's dispute history on a hunch.
--
-- Re-importing Jenny's card re-reads every one of her comments from ClickUp
-- and writes them to HER file, so nothing is lost — the cost is that a
-- handful of duplicates remain on Estebania's, visibly labelled "from
-- ClickUp" and dated. Deleting them needs a person to read them, and that is
-- Dee's call, not this migration's.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_fc uuid;
  v_name text;
  v_removed int;
begin
  select l.entity_id::uuid into v_fc
    from public.import_links l
   where l.source_system = 'clickup' and l.source_kind = 'task'
     and l.source_id = '86eykmp6g' and l.entity_type = 'fulfillment_client';

  if v_fc is null then
    raise notice 'Jenny Guzman''s card is already unlinked; nothing to undo';
    return;
  end if;

  select name into v_name from public.fulfillment_clients where id = v_fc;

  /* Only if it is still pointing at the wrong person. If somebody has already
     separated them by hand, that stands. */
  if v_name is distinct from 'Estebania De La Cruz' then
    raise exception 'that card now points at "%", not Estebania — look before undoing', v_name;
  end if;

  delete from public.import_links
   where source_system = 'clickup' and source_kind = 'task' and source_id = '86eykmp6g';
  get diagnostics v_removed = row_count;

  raise notice 'unlinked Jenny Guzman''s card (% row) — re-import to build her own file', v_removed;
end $$;

commit;
