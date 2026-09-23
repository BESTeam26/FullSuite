-- The hourly sweep also picks up work nobody is holding.
--
-- `creditops_assign_unclaimed()` was added in 20260923003000 and nothing
-- called it. A dry run against production says it would place 10 files and
-- flag Bureau Calling, which has 2 actionable files and no live team attached
-- to take them.
--
-- It joins the SLA sweep rather than getting a job of its own: same hour, same
-- schedule, one more statement. A second cron entry would be a second thing to
-- notice when it stops (rule 14), and these two belong together anyway — the
-- SLA sweep decides what has come due, this decides who picks it up.
--
-- Dee, 2026-09-23, on what this workspace is for: "this is where we document
-- our work and assign tasks to agents ENSURING NO MISSING CLIENTS."
--
-- Cost impact: no material increase — no new job, and the statement does
-- nothing on an hour when everything is already assigned.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sla-sweep'),
  command := $job$select public.sla_sweep(); select public.creditops_assign_unclaimed();$job$
);

do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'sla-sweep';
  if v_cmd is null or position('creditops_assign_unclaimed' in v_cmd) = 0 then
    raise exception 'the sla-sweep job does not call creditops_assign_unclaimed';
  end if;
  if position('sla_sweep' in v_cmd) = 0 then
    raise exception 'the sla-sweep job stopped calling sla_sweep — the SLA half must survive';
  end if;
end $$;
