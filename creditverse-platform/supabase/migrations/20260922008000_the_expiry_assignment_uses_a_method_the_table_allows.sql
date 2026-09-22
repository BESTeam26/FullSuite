-- `sla_expiry` is not an assignment method the table accepts.
--
-- 20260922007000 assigned the file on expiry and stamped how it was assigned,
-- inventing a word for it. `client_department_statuses_assignment_method_check`
-- allows six: automatic, team_lead, manual_override, handoff,
-- system_waiting_unassign, partner_action. The insert failed the moment the
-- sweep tried to hand a file over.
--
-- `automatic` already means exactly this — the system chose the person, not a
-- lead — so the vocabulary stays six words rather than seven. A small closed
-- set is the point of the constraint.

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sla_sweep';

  if position($m$assignment_method = 'sla_expiry'$m$ in v_src) = 0 then
    raise notice 'sla_sweep does not use the invalid method; nothing to correct';
    return;
  end if;

  v_src := replace(v_src, $m$assignment_method = 'sla_expiry'$m$, $m$assignment_method = 'automatic'$m$);
  execute v_src;
end $$;
