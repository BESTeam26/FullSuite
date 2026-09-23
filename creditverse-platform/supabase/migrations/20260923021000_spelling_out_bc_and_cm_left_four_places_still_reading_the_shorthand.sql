-- Spelling out BC and CM left four places still looking for the old words.
--
-- Migration 20260923005000 renamed the shorthand Dee asked me to stop using:
-- CM COMPLETED → COMPLAINT COMPLETED, BC COMPLETED → BUREAU CALLING COMPLETED,
-- and five more. It moved the enum, the stored rows, the routing table, the
-- SLA policies and the dropdown vocabulary, and it ended with a guard that
-- refused to commit if a shorthand survived in any of them.
--
-- The guard checked five places. There were nine. It never looked inside the
-- functions that CLASSIFY a status, so they went on comparing against names
-- that no longer exist anywhere:
--
--   creditops_status_is_actionable   the closed and waiting lists
--   creditops_department_queue       the same closed list, in its WHERE
--   creditops_route_client           the same list again, twice
--   creditops_closed_status_for      RETURNS 'CM COMPLETED' / 'BC COMPLETED'
--
-- ── WHAT THIS BROKE, IN THE PRODUCT ───────────────────────────────────────
--
-- A Complaints file marked COMPLAINT COMPLETED did not match 'CM COMPLETED',
-- so it stayed ACTIONABLE: still in the department queue, still counted as
-- that agent's open workload, still holding an SLA clock, still on the new
-- coverage strip as active work. Finished work that will not go away.
--
-- COMPLAINT AWAITING RESPONSE was worse, because it is the other half of
-- Dee's queue doctrine (§23): waiting on an outside party is NOT actionable
-- and NOT completed. Unmatched, it read as work BES could do right now, which
-- is the exact collapse the doctrine exists to forbid.
--
-- And creditops_closed_status_for would have WRITTEN 'CM COMPLETED' — a value
-- no longer in the vocabulary — the next time a Complaints department was
-- closed by routing.
--
-- Nothing has been lost. No row ever held the new spelling and the old rule at
-- once, because the rename moved every row in the same transaction; the damage
-- was entirely in front of the data. Complaints and Bureau Calling have no
-- live files today (CreditOps was cleared for Dee's real import this
-- afternoon), so no file was mis-queued in production.
--
-- ── WHY THIS IS A REPLACE AND NOT A REWRITE ───────────────────────────────
--
-- Each definition is read back from the database and the seven names are
-- swapped inside it, so nothing else about these functions can move by
-- accident. Each one refuses if the text it expects is not there.
--
-- OB READY FOR R1 is deliberately left alone. Unlike BC and CM it was never
-- renamed — it stands beside ONBOARDING READY FOR ROUND 1 as a legacy alias
-- for rows written before that change, and removing it would strand them.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  /* Only the seven the rename actually moved. */
  m text[][] := array[
    array['BC NOT NEEDED',        'BUREAU CALLING NOT NEEDED'],
    array['BC NEEDED',            'BUREAU CALLING NEEDED'],
    array['BC IN PROGRESS',       'BUREAU CALLING IN PROGRESS'],
    array['BC COMPLETED',         'BUREAU CALLING COMPLETED'],
    array['CM NOT NEEDED',        'COMPLAINT NOT NEEDED'],
    array['CM AWAITING RESPONSE', 'COMPLAINT AWAITING RESPONSE'],
    array['CM COMPLETED',         'COMPLAINT COMPLETED']
  ];
  fns text[] := array[
    'public.creditops_status_is_actionable(public.fulfillment_department, text)',
    'public.creditops_route_client(uuid, public.fulfillment_client_status)',
    'public.creditops_closed_status_for(public.fulfillment_department)'
  ];
  f text;
  v_def text;
  v_new text;
  i int;
begin
  foreach f in array fns loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_new := v_def;
    for i in 1 .. array_length(m, 1) loop
      v_new := replace(v_new, '''' || m[i][1] || '''', '''' || m[i][2] || '''');
    end loop;
    if v_new = v_def then
      raise exception '% held none of the shorthand — read it before replacing it', f;
    end if;
    execute v_new;
  end loop;

  /* The queue view carries the closed list a second time, in its WHERE.
     security_invoker is re-stated rather than assumed: a view without it runs
     with the owner's rights and bypasses RLS entirely, which is the one
     mistake here that would be a security hole rather than a wrong number. */
  v_def := pg_get_viewdef('public.creditops_department_queue'::regclass);
  v_new := v_def;
  for i in 1 .. array_length(m, 1) loop
    v_new := replace(v_new, '''' || m[i][1] || '''', '''' || m[i][2] || '''');
  end loop;
  if v_new = v_def then
    raise exception 'creditops_department_queue held none of the shorthand';
  end if;
  execute 'create or replace view public.creditops_department_queue '
          'with (security_invoker = true) as ' || v_new;
end $$;

/* Nothing anywhere in the database still compares against a name that no
   longer exists. This is the guard 20260923005000 should have had: it asks
   every function, view and constraint, not a list of five tables. */
do $$
declare v_bad text;
begin
  select string_agg(name, ', ') into v_bad from (
    select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ '''(BC|CM) '
    union all
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
       and pg_get_viewdef(c.oid) ~ '''(BC|CM) '
    union all
    select conname from pg_constraint where pg_get_constraintdef(oid) ~ '''(BC|CM) '
  ) t;
  if v_bad is not null then
    raise exception 'still reading the shorthand: %', v_bad;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'creditops_department_queue'
       and 'security_invoker=true' = any(c.reloptions)
  ) then
    raise exception 'the queue view lost security_invoker — it would bypass RLS';
  end if;

  if not has_table_privilege('authenticated', 'public.creditops_department_queue', 'select') then
    raise exception 'the queue view lost its grant to authenticated';
  end if;
end $$;

commit;
