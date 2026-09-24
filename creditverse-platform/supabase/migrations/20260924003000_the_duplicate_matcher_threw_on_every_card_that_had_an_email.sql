-- The duplicate matcher threw on every card that had an email.
--
-- `client_match_for_import` counts the candidates a lookup found and keeps the
-- single one, written as:
--
--     select count(*), min(fc.id) into v_n, v_id from ...
--
-- There is no `min(uuid)` in Postgres. The statement does not fail to
-- COMPILE — PL/pgSQL resolves it at execution — so the function has sat here
-- since it was written, looking correct, and raising 42883 the first time
-- anything reached it. All FOUR of the lookups that need it are affected:
-- the legacy id, email, phone, and name + date of birth.
--
-- Nothing reaches it until step 1 (the ClickUp task crosswalk) and step 2 (the
-- legacy id) both miss, which is exactly what happens on the FIRST import of a
-- card that carries an email. So Tiffany Hunter's 72 clients would have
-- stopped on the first one. The client import has never been run — only the
-- partner import went — which is why this was still here to find.
--
-- Found by writing D-023's probe rather than by reading the function again.
-- A SQL function that is never executed is not tested by being correct-looking.
--
-- `(array_agg(...))[1]` in place of `min(...)`: it is the same intent — the
-- one row, when there is exactly one — and it is type-agnostic, so the next
-- identifier added here cannot reintroduce this.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_def text := pg_get_functiondef('public.client_match_for_import(uuid,text,text,text,text,text,text,date)'::regprocedure);
  v_new text;
  v_hits int;
begin
  v_hits := (length(v_def) - length(replace(v_def, 'min(fc.id)', ''))) / length('min(fc.id)');
  if v_hits <> 4 then
    raise exception 'expected 4 uses of min(fc.id), found % — read the function before replacing it', v_hits;
  end if;

  v_new := replace(v_def, 'min(fc.id)', '(array_agg(fc.id))[1]');
  execute v_new;
end $$;

/* Proved, not assumed: the lookups now run. Each is asked against a
   partner that holds nothing, so the answer is a clean null rather than a
   match — the point is that it ANSWERS. */
do $$
declare v_id uuid; v_group uuid;
begin
  select id into v_group from public.outsourcing_groups order by created_at limit 1;

  v_id := public.client_match_for_import(
    v_group, 'clickup', 'probe-no-such-task', 'no-such-legacy-id',
    null, null, null, null);

  v_id := public.client_match_for_import(
    v_group, 'clickup', 'probe-no-such-task', null,
    'nobody-20260924@example.invalid', null, null, null);

  v_id := public.client_match_for_import(
    v_group, 'clickup', 'probe-no-such-task', null,
    null, '5550000000', null, null);

  v_id := public.client_match_for_import(
    v_group, 'clickup', 'probe-no-such-task', null,
    null, null, 'Nobody At All 20260924', '1900-01-01');
end $$;

commit;
