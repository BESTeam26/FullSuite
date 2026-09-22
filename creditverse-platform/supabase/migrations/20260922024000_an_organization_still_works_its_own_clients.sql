-- An organization can work its own clients again.
--
-- Third regression of mine that today's gate has surfaced. Migration
-- 20260922003000 moved the department gate out of the browser and into the
-- database, which was right: any BES staff member could previously set any
-- status on any department of any file they could see, and the restriction
-- Dee describes existed only as `canLogDepartment` in React (rule 1).
--
-- But it gated `set_client_department_status` and `handoff_client_departments`
-- on `creditops_may_work()` ALONE. That function answers a purely BES-side
-- question — the `creditops.work.manage` capability, the person's own BES
-- team departments, a BES department- or division-manager seat. An
-- ORGANIZATION user can never satisfy any of those arms, so since this morning
-- a customer running its own CreditOps has been unable to set a department
-- status on its own client, or hand one of its own files between departments.
--
-- That contradicts the doctrine the whole model rests on (rule 16b): the
-- ORGANIZATION owns and operates its canonical records; BES sees them only
-- where an engagement authorizes it. The customer is not a junior BES agent.
--
-- ── THE NARROW FIX ────────────────────────────────────────────────────────
--
-- One more arm, and nothing about BES scope is widened: you may write a
-- department on this file if you work that BES queue, OR if you are acting
-- inside the organization that owns the file. `is_org_member` is exactly the
-- test `client_department_writable` applied before 003000, so organization
-- users get back the reach they had yesterday and no more — and which of its
-- clients they can touch is still decided by `org_scope_allows` in the row
-- policy, not here.
--
-- `creditops_may_work()` itself is deliberately NOT changed. It answers "which
-- BES queues does this person work", it is read by other callers, and giving
-- it an organization arm would quietly make every BES-side check true for
-- customers too.
--
-- Cost impact: no material increase. One extra boolean on a path that already
-- reads the client row.

do $$
declare
  v_def  text;
  v_old  text;
  v_new  text;
  v_fn   text;
begin
  foreach v_fn in array array[
    'public.set_client_department_status(uuid, public.fulfillment_department, text, uuid, text)',
    'public.handoff_client_departments(uuid, public.fulfillment_department, public.fulfillment_department[], text[], text)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);

    /* Each raises a different message, so each is matched on its own text —
       a blind replace would be a guess about code I have not read. */
    if v_fn like 'public.set_client_department_status%' then
      v_old := 'if not public.creditops_may_work(p_department) then';
      v_new := 'if not (public.creditops_may_work(p_department) or public.is_org_member(c.organization_id)) then';
    else
      v_old := 'if not public.creditops_may_work(p_from) then';
      v_new := 'if not (public.creditops_may_work(p_from) or public.is_org_member(c.organization_id)) then';
    end if;

    if position(v_old in v_def) = 0 then
      raise exception '% no longer gates on creditops_may_work as expected — read it before replacing it', v_fn;
    end if;

    execute replace(v_def, v_old, v_new);
  end loop;
end $$;
