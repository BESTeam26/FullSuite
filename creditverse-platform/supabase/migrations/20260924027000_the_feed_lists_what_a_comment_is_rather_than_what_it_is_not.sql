-- The feed lists what a comment IS, rather than what it is not.
--
-- 20260924026000 dropped system rows from the Activity column by excluding
-- anything with a `field` — the mark a trigger leaves and a person does not.
-- One row survived: "Client added", written at creation with no field. So the
-- column still showed a system event, and Dee's complaint was still half
-- true.
--
-- Excluding by shape was the wrong instrument. The same mistake, in the same
-- table, cost a morning already: matching statuses by the WORDING of an
-- action lost "Update posted" out of the conversation, and the fix then was
-- to name them. Naming them is the fix now too — a comment is one of the four
-- actions that write comments, and everything else is history whatever its
-- columns happen to say.
--
-- The `field is null` test is kept beside it, because a row carrying a field
-- is never a comment however it is named, and two independent reasons to
-- exclude a status change is the right number.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.client_feed(uuid)'::regprocedure);
  v_new text;
  v_old constant text :=
E'       /* And a status change is not conversation. It is on History,\n'
'          which is the tab for consulting the record (Dee, 2026-09-24).\n'
'          `field` is what a trigger sets and a person never does. */\n'
'       and e.field is null';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'client_feed is not the shape this migration expects';
  end if;

  v_new := replace(v_def, v_old,
E'       /* A COMMENT, named. Not "anything without a field" — "Client added"\n'
'          has no field either, and slipped through when this excluded by\n'
'          shape. The conversation is what people wrote; everything else is\n'
'          History, which is the tab for consulting the record (Dee,\n'
'          2026-09-24). The field test stays as the second reason: a row\n'
'          carrying one is never a comment however it is named. */\n'
'       and e.field is null\n'
'       and (e.action in (''Internal note'', ''Update posted'', ''Comment posted'',\n'
'                         ''Imported from ClickUp'')\n'
'            or e.action ilike ''%comment%'' or e.action ilike ''%note%''\n'
'            or e.action ilike ''%clickup%'')');

  if v_new = v_def then
    raise exception 'the comment filter did not land';
  end if;
  execute v_new;
end $$;

commit;
