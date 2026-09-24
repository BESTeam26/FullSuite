-- The newest comment is the one somebody needs, so it goes at the top.
--
-- Dee, 2026-09-24: "I want the Activity LATEST to be at the top and not at
-- the bottom, i see kaori's message as the first message, should be showing
-- the latest for easy referrence."
--
-- `client_posts()` ordered oldest-first, the way a chat window reads. That is
-- right for a conversation you are IN and wrong for a file you are picking
-- up: eleven months of imported ClickUp comments means the first thing on
-- screen was from last year, and the thing that actually matters was a
-- scroll away.
--
-- Replies keep their own order. A thread reads oldest-first however the list
-- around it is sorted — a reply before the thing it replies to is nonsense —
-- and that ordering is assembled in the client, so only the top level moves.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.client_posts(uuid)'::regprocedure);
  v_new text;
begin
  if position('order by e.created_at asc' in v_def) = 0 then
    raise exception 'client_posts is not ordered the way this migration expects';
  end if;
  v_new := replace(v_def, 'order by e.created_at asc', 'order by e.created_at desc');
  execute v_new;
end $$;

commit;
