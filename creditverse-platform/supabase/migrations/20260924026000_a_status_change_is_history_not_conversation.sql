-- A status change is history, not conversation.
--
-- Dee, 2026-09-24, looking at the System filter: "why did you duplicate these
-- on comment section, that's not needed."
--
-- She is right, and it is a duplicate in the literal sense: "LETTERS PENDING
-- → FOR COMPLAINTS" was already on the History tab, where the audit trail
-- lives. The Activity column was showing the same row a second time.
--
-- Her mockup did ask for a System filter, and this removes it — a later look
-- at the real thing beats an earlier sketch of it. The column is the
-- conversation now: what people said, what they attached, and the work they
-- finished. Every status change, assignment and handoff stays exactly where
-- it was, on History, which is the tab built to be consulted rather than
-- read.
--
-- Nothing is deleted. `client_history()` is untouched and still returns all
-- of it; this only stops the feed repeating it.
--
-- Cost impact: no material increase — the feed returns fewer rows.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.client_feed(uuid)'::regprocedure);
  v_new text;
begin
  if position('then ''comment''' in v_def) = 0 then
    raise exception 'client_feed is not the shape this migration expects';
  end if;

  /* The classifier keeps its three answers so nothing downstream has to
     change; the WHERE simply stops system rows being returned at all.
     Filtering here rather than in the browser means they are not fetched,
     not merely hidden. */
  v_new := replace(v_def,
    E'       /* Withdrawn: out of the conversation, still in the table. */\n       and e.deleted_at is null',
    E'       /* Withdrawn: out of the conversation, still in the table. */\n'
    '       and e.deleted_at is null\n'
    '       /* And a status change is not conversation. It is on History,\n'
    '          which is the tab for consulting the record (Dee, 2026-09-24).\n'
    '          `field` is what a trigger sets and a person never does. */\n'
    '       and e.field is null');

  if v_new = v_def then
    raise exception 'the system-row filter did not land';
  end if;
  execute v_new;
end $$;

commit;
