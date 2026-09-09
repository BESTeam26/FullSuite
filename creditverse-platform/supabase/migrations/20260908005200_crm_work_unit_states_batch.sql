----------------------------------------------------------------------
-- 0229  Work unit state for many units at once.
--
-- `crm_work_unit_state(uuid)` answers for ONE unit, which is right when a
-- screen shows one. A project workspace shows thirty, and asking thirty times
-- over the network is the N+1 rule 14 forbids — the round trips, not the
-- computation, are the cost.
--
-- Same function, applied inside the database. It deliberately does NOT
-- reimplement the rule: a second copy of "what state is this in" is how two
-- screens start disagreeing about the same task.
--
-- SECURITY INVOKER, so a caller sees state only for units their own policies
-- return. Passing somebody else's unit id yields no row rather than an error:
-- "this does not exist for you" and "you may not see this" are the same
-- answer, and telling them apart would confirm the row exists.
----------------------------------------------------------------------

create or replace function public.crm_work_unit_states(p_units uuid[])
returns table (id uuid, state text)
language sql stable security invoker set search_path = public as $function$
  select w.id, public.crm_work_unit_state(w.id)
    from public.work_items w
   where w.id = any(p_units)
$function$;

revoke execute on function public.crm_work_unit_states(uuid[]) from public, anon;
grant execute on function public.crm_work_unit_states(uuid[]) to authenticated;

comment on function public.crm_work_unit_states(uuid[]) is
  'The derived state of many work units in one call, so a project workspace does not make one request per task. Calls crm_work_unit_state rather than restating its rule. SECURITY INVOKER: a unit the caller may not see simply does not come back.';
