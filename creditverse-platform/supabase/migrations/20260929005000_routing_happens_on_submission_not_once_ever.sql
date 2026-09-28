-- Routing happens on the transition into submitted — not once, ever.
--
-- Found by the end-to-end test of 20260929003000: Daniel, who holds a
-- department_manager seat, submitted and was routed `team_lead` with no
-- report built. His row for the day already existed from before the ladder
-- was added, carrying the old routing, and `eod_set_routing` only routes
-- when `routing_reason is null` — so it never ran.
--
-- The guard was protecting the wrong thing. "Do not re-route a report
-- somebody has already been asked to review" is the right rule, and it is
-- already enforced by `old.submitted_at is null`: the routing runs only on
-- the transition INTO submitted, which happens once. The extra
-- `routing_reason is null` condition added nothing to that and silently kept
-- every pre-existing row on whatever it had been routed to before — which,
-- for every lead on the roster, was a rung too low.
--
-- Now: on the transition into submitted, route and build, always. A draft
-- saved and re-saved before submission is never touched; a report already
-- submitted is never re-routed.
--
-- Cost impact: none.

begin;

create or replace function public.eod_set_routing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null) then

    select * into r from public.eod_route_up_for(new.employee_id);
    new.routed_to      := r.lead_id;
    new.routed_team_id := r.team_id;
    new.routing_reason := r.reason;

    if r.level is not null and r.scope_id is not null then
      new.report_level    := r.level;
      new.report_scope_id := r.scope_id;
      begin
        new.report := public.eod_report(r.level, r.scope_id, new.work_date);
        new.report_error := null;
      exception when others then
        new.report := null;
        new.report_error := sqlerrm;
      end;
    else
      new.report_level    := null;
      new.report_scope_id := null;
      new.report          := null;
      new.report_error    := null;
    end if;
  end if;
  return new;
end $$;

commit;
