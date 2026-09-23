-- Routing passes the partner, and the two-argument picker is removed.
--
-- 20260923006000 added the partner to `creditops_pick_assignee` as a defaulted
-- third argument so existing callers would keep compiling. The effect was two
-- functions of the same name, and Postgres cannot choose between a
-- two-argument call and a three-argument one with a default: every existing
-- call now fails with "function is not unique". Caught immediately by calling
-- it; the default was the wrong tool for keeping callers working.
--
-- So the old one goes, and the callers pass what they already know.
-- `creditops_route_client` loads the whole client row before it assigns, so
-- the partner is sitting in `c.outsourcing_group_id` — which means Dee's rule
-- 5 applies at THE MOMENT A DEPARTMENT OPENS, which is the path that matters.
-- A partner assigned to specific agents gets them from the first routing, not
-- an hour later when the sweep catches up.
--
-- Cost impact: no material increase.

do $$
declare
  v_def text := pg_get_functiondef('public.creditops_route_client(uuid, public.fulfillment_client_status)'::regprocedure);
  v_old text := 'public.creditops_pick_assignee(r.department, c.agency_id)';
  v_new text := 'public.creditops_pick_assignee(r.department, c.agency_id, c.outsourcing_group_id)';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'creditops_route_client does not call the picker as expected — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* sla_sweep, where it knows the client it is acting on. */
do $$
declare
  v_def text := pg_get_functiondef('public.sla_sweep()'::regprocedure);
  v_new text := v_def;
begin
  /* Only rewritten if it calls the two-argument form; the shape of that call
     differs from route_client's, so it is matched on its own text. */
  if position('creditops_pick_assignee(' in v_def) > 0 then
    v_new := regexp_replace(
      v_def,
      'creditops_pick_assignee\(([^,()]+),\s*([^,()]+)\)',
      'creditops_pick_assignee(\1, \2, null)',
      'g');
    if v_new <> v_def then execute v_new; end if;
  end if;
end $$;

/* The ambiguity itself. Dropped AFTER the callers move, so nothing resolves to
   a missing function in between. */
drop function if exists public.creditops_pick_assignee(public.fulfillment_department, uuid);

do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creditops_pick_assignee';
  if v_n <> 1 then
    raise exception 'expected exactly one creditops_pick_assignee, found %', v_n;
  end if;

  if position('c.outsourcing_group_id' in
       pg_get_functiondef('public.creditops_route_client(uuid, public.fulfillment_client_status)'::regprocedure)) = 0 then
    raise exception 'creditops_route_client still does not pass the partner';
  end if;
end $$;
