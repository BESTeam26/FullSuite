-- =============================================================================
-- The canonical BES CreditOps SLA policy (Dee, 2026-09-11).
--
-- Every rule is a ROW. Dee: "Do not hard-code these independently in multiple
-- UI files." So the table below is the whole policy, and changing BES's
-- operating standard is an UPDATE rather than a deploy.
--
-- ── HOW A RULE IS CHOSEN ────────────────────────────────────────────────────
--
-- Most specific wins, and there is always an answer:
--
--   1. this department AND this status
--   2. this status, in any department
--   3. this department, any status
--   4. the default — 24 hours
--
-- Dee: "Any actionable CreditOps status/queue that does not have a more
-- specific SLA rule should default to 24 hours." A queue with no deadline is
-- how work goes quiet, so there is no such thing here.
--
-- ── THREE BEHAVIOURS BEYOND A DEADLINE ──────────────────────────────────────
--
-- `waiting`             the client is parked: no processing agent, out of My
--                       Work, still visible with a future date.
-- `max_cycles`          a follow-up that repeats — onboarding is three
--                       24-hour attempts, then a human decides. Never a
--                       fourth, and never a silent loop.
-- `escalate_after_hours`  unresolved for longer than the deadline is a
--                       different fact from being late: Ready for Processing
--                       is OVERDUE at 3 days and ESCALATED at 5.
-- `on_expiry_status`    what a waiting clock becomes when it runs out.
--
-- `dispute_timers` is untouched. Regulatory and operational stay apart.
-- =============================================================================

/* A rule may now be keyed on the status alone, or apply to everything. */
alter table public.sla_policies
  alter column department drop not null,
  add column if not exists max_cycles integer check (max_cycles is null or max_cycles > 0),
  add column if not exists escalate_after_hours integer check (escalate_after_hours is null or escalate_after_hours > 0),
  add column if not exists escalate_to_status text,
  add column if not exists on_expiry_status text,
  add column if not exists on_expiry_department public.fulfillment_department;

alter table public.sla_policies drop constraint if exists sla_policies_unique;
/* NULLS NOT DISTINCT so a department-wide or global rule can exist only once:
   an enum cast is not immutable, so coalescing into the index is not an
   option, and two "default" rows would make the lookup arbitrary. */
create unique index if not exists sla_policies_unique_key
  on public.sla_policies (agency_id, department, status) nulls not distinct;

comment on column public.sla_policies.max_cycles is
  'A follow-up that repeats this many times and then stops. Onboarding is three 24-hour attempts; after the third a human decides, and no fourth is ever created.';
comment on column public.sla_policies.escalate_after_hours is
  'Unresolved this long becomes a different state, not merely a later one. Ready for Processing is overdue at 3 days and escalated at 5.';

-- ── The policy ──────────────────────────────────────────────────────────────
delete from public.sla_policies;

insert into public.sla_policies
  (agency_id, department, status, hours, waiting, max_cycles,
   escalate_after_hours, escalate_to_status, on_expiry_status, on_expiry_department, label)
select a.id, v.dept::public.fulfillment_department, v.status, v.hours, v.waiting, v.cycles,
       v.esc_h, v.esc_to, v.exp_status, v.exp_dept::public.fulfillment_department, v.label
  from public.agencies a
 cross join (values
   -- Onboarding: three consecutive 24-hour follow-ups, then a human decides.
   ('Onboarding', 'Incomplete Onboarding', 24, false, 3, null::int, null::text,
      null::text, null::text, 'Onboarding follow-up — 24h, three attempts'),
   ('Onboarding', 'OB INCOMPLETE', 24, false, 3, null, null, null, null,
      'Onboarding follow-up — 24h, three attempts'),
   ('Onboarding', 'INCOMPLETE ONBOARDING', 24, false, 3, null, null, null, null,
      'Onboarding follow-up — 24h, three attempts'),

   -- Processing.
   (null, 'Ready for Round 1', 24, false, null, null, null, null, null,
      'Ready for Round 1 — 24h'),
   (null, 'Ready for Processing', 72, false, null, 120, 'Prio Processing', null, null,
      'Ready for Processing — 3 days, escalates at 5'),
   (null, 'Prio Processing', 24, false, null, null, null, null, null,
      'Priority processing — 24h'),

   -- The waiting clock, and what it becomes.
   ('Dispute', 'Mailed', 720, true, null, null, null,
      'Ready for Reimport / Review', 'Dispute',
      'Mailed — 30 days waiting, returns for review'),
   (null, 'Ready for Reimport / Review', 24, false, null, null, null, null, null,
      'Back for review — 24h'),
   (null, 'Ready For Reimport/ Credit Update', 24, false, null, null, null, null, null,
      'Back for review — 24h'),

   -- Departments with one rule for everything in them.
   ('Support', null, 24, false, null, null, null, null, null, 'Support — 24 hours'),
   ('Complaints', null, 120, false, null, null, null, null, null, 'Complaints — 5 days'),

   -- And the answer when nothing else matches.
   (null, null, 24, false, null, null, null, null, null, 'Default — 24 hours')
 ) as v(dept, status, hours, waiting, cycles, esc_h, esc_to, exp_status, exp_dept, label);

-- ── Which follow-up this is ─────────────────────────────────────────────────
alter table public.client_department_statuses
  add column if not exists cycle_number integer not null default 1,
  /* Set when the last permitted follow-up has been made and the decision is a
     person's. Nothing is deleted or archived automatically (Dee). */
  add column if not exists needs_lead_review boolean not null default false;

comment on column public.client_department_statuses.cycle_number is
  'Which attempt this is, for a repeating follow-up: the "1 of 3" an agent reads. Counted by the system so nobody works out which day they are on.';

-- ── Choosing the rule ───────────────────────────────────────────────────────
create or replace function public.sla_policy_for(
  p_agency uuid, p_department public.fulfillment_department, p_status text)
returns public.sla_policies
language sql stable security definer set search_path = public as $function$
  select s.* from public.sla_policies s
   where s.agency_id = p_agency
     and (s.department is null or s.department = p_department)
     and (s.status is null or s.status = p_status)
   order by (s.department is not null)::int + (s.status is not null)::int desc,
            (s.status is not null)::int desc
   limit 1
$function$;
revoke execute on function public.sla_policy_for(uuid, public.fulfillment_department, text) from public, anon;
grant execute on function public.sla_policy_for(uuid, public.fulfillment_department, text) to authenticated;

create or replace function public.compute_department_due(
  p_agency uuid, p_department public.fulfillment_department,
  p_status text, p_opened_at timestamptz)
returns timestamptz
language sql stable security definer set search_path = public as $function$
  select p_opened_at + make_interval(hours => (public.sla_policy_for(p_agency, p_department, p_status)).hours)
$function$;

create or replace function public.department_is_waiting(
  p_agency uuid, p_department public.fulfillment_department, p_status text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((public.sla_policy_for(p_agency, p_department, p_status)).waiting, false)
$function$;
