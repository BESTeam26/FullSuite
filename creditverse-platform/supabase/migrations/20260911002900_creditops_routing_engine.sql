-- =============================================================================
-- The CreditOps routing and assignment engine.
--
-- Dee, 2026-09-11: "STATUS / WORKFLOW CHANGES → SYSTEM DETERMINES RESPONSIBLE
-- DEPARTMENT → SYSTEM READS DEPARTMENT ASSIGNMENT POLICY → … I do not want
-- people manually moving and assigning files all day."
--
-- ── WHY THIS IS IN THE DATABASE ─────────────────────────────────────────────
--
-- "React should display the result, not decide who gets the work." A browser
-- that picks the assignee can be bypassed by any other caller — the importer,
-- an Edge Function, a person with the anon key and curl — and every one of
-- those changes statuses today. Routing that runs in a trigger cannot be
-- skipped by the client that skipped the screen (rule 1).
--
-- ── WHAT IS DATA AND WHAT IS CODE ───────────────────────────────────────────
--
-- The status → department map is ROWS (`creditops_status_routing`). It lived
-- in React as queue filter predicates, duplicated across QUEUE_SPECS, the
-- dashboards and the handoff planner, and no two copies agreed. Adding a
-- status is now an INSERT.
--
-- The fairness rule is CODE, because it is arithmetic over live workload and
-- there is exactly one of it (`creditops_pick_assignee`).
--
-- ── WHAT THIS ENGINE DELIBERATELY DOES NOT DO ───────────────────────────────
--
-- · It never closes department work it did not open. Dee: "Support can remain
--   open while Dispute is waiting… Do not turn the routing table into a 'one
--   client = one department' model."
-- · It never assigns when a department has no eligible member. The work stays
--   Assignment Required — an explicit exception state — rather than landing on
--   an admin or the previous agent.
-- · It never reassigns existing work because team membership changed.
-- · It never runs because a note, a phone number or a document changed. The
--   trigger fires on the status column and nothing else.
-- =============================================================================

-- ── How an assignment came about ────────────────────────────────────────────
alter table public.client_department_statuses
  add column if not exists assignment_method text
    check (assignment_method is null or assignment_method in
      ('automatic', 'team_lead', 'manual_override', 'handoff',
       'system_waiting_unassign', 'partner_action')),
  add column if not exists assigned_at timestamptz;

comment on column public.client_department_statuses.assignment_method is
  'How the current assignee got this file: automatic (fair distribution), team_lead (Support), manual_override, handoff, system_waiting_unassign (cleared for a waiting stage), partner_action (external owner). History is in activity_events; this is the current state (Dee, 2026-09-11).';

-- ── The routing map, as rows ────────────────────────────────────────────────
create table if not exists public.creditops_status_routing (
  status public.fulfillment_client_status primary key,
  /** The department that owns work in this status. Null for states nobody at BES works. */
  department public.fulfillment_department,
  /**
   * actionable      somebody at BES should be working it now
   * waiting         open, but the clock belongs to a third party — no assignee
   * partner_action  owned by the partner, not by BES
   * terminal        nothing to route
   */
  kind text not null check (kind in ('actionable', 'waiting', 'partner_action', 'terminal')),
  /** The department status the file is opened at. Validated below. */
  entry_status text,
  note text,
  /* Work somebody holds has to say WHERE and AT WHAT STATUS. A finished
     status still names its department — SUPPORT RESOLVED is Support's — but
     opens nothing. Partner-owned work belongs to no BES department at all. */
  constraint routing_department_matches_kind check (
    (kind in ('actionable', 'waiting') and department is not null and entry_status is not null)
    or (kind = 'terminal' and entry_status is null)
    or (kind = 'partner_action' and department is null and entry_status is null)
  )
);

comment on table public.creditops_status_routing is
  'Credit status → responsible department, and whether that work is actionable, waiting, partner-owned or finished. Rows, not code: this used to be queue predicates duplicated across React (Dee, 2026-09-11). A status absent from this table is UNROUTED and is surfaced for review rather than guessed.';

alter table public.creditops_status_routing enable row level security;

drop policy if exists creditops_status_routing_select on public.creditops_status_routing;
create policy creditops_status_routing_select on public.creditops_status_routing
  for select to authenticated using (true);
/* No insert/update/delete policy: the map is changed by migration, so a
   compromised session cannot re-point a status at another department. */

insert into public.creditops_status_routing (status, department, kind, entry_status, note) values
  -- Onboarding
  ('New Client',                       'Onboarding',     'actionable', 'OB NOT STARTED',   null),
  ('NEW ONBOARDING',                   'Onboarding',     'actionable', 'OB NOT STARTED',   null),
  ('Onboarding',                       'Onboarding',     'actionable', 'OB IN REVIEW',     null),
  ('Incomplete Onboarding',            'Onboarding',     'actionable', 'OB INCOMPLETE',    null),
  ('INCOMPLETE ONBOARDING',            'Onboarding',     'actionable', 'OB INCOMPLETE',    null),
  -- Dispute Processing
  ('Ready for Round 1',                'Dispute',        'actionable', 'READY FOR ROUND 1',   null),
  ('Ready for Processing',             'Dispute',        'actionable', 'READY FOR PROCESSING', null),
  ('In Processing',                    'Dispute',        'actionable', 'READY FOR PROCESSING', null),
  ('Prio Processing',                  'Dispute',        'actionable', 'READY FOR PROCESSING',
     'Priority, not a different department. Keeps a valid existing assignment rather than churning it.'),
  ('Ready for QA',                     'Dispute',        'actionable', 'READY FOR PROCESSING', null),
  ('Round Sent - Awaiting Results',    'Dispute',        'waiting',    'ROUND SENT - AWAITING RESULTS',
     'The 30-day wait. Locked: no internal assignee while waiting (Dee).'),
  ('In Dispute',                       'Dispute',        'waiting',    'ROUND SENT - AWAITING RESULTS',
     'The round is out with the bureaus; nobody at BES can act until results return.'),
  -- Client Success / Support
  ('Ready for Reimport / Review',      'Support',        'actionable', 'READY FOR REIMPORT', null),
  ('Ready For Reimport/ Credit Update','Support',        'actionable', 'READY FOR REIMPORT',
     'Locked: Support, and NOT back to the previous processor (Dee).'),
  ('READY FOR REIMPORT',               'Support',        'actionable', 'READY FOR REIMPORT', null),
  ('On Hold (Non Workable)',           'Support',        'actionable', 'SUPPORT NEW',
     'Cannot be worked; needs client-facing recovery. Locked to Support (Dee).'),
  ('SUPPORT NEW',                      'Support',        'actionable', 'SUPPORT NEW',        null),
  ('ONBOARDING FOLLOWUP',              'Support',        'actionable', 'ONBOARDING FOLLOWUP', null),
  ('Monitoring Issue',                 'Support',        'actionable', 'MONITORING ISSUE',   null),
  ('BILLING ISSUE',                    'Support',        'actionable', 'BILLING ISSUE',      null),
  ('Attention',                        'Support',        'actionable', 'SUPPORT NEW',        null),
  ('ESCALATED TO MANAGEMENT',          'Support',        'actionable', 'ESCALATED TO MANAGEMENT', null),
  ('WAITING CLIENT RESPONSE',          'Support',        'waiting',    'WAITING CLIENT RESPONSE', null),
  ('Awaiting Response',                'Support',        'waiting',    'WAITING CLIENT RESPONSE', null),
  ('SUPPORT RESOLVED',                 'Support',        'terminal',   null,                 null),
  -- Complaints & Mailing
  ('For Complaints',                   'Complaints',     'actionable', 'LETTERS PENDING',    null),
  ('LETTERS PENDING',                  'Complaints',     'actionable', 'LETTERS PENDING',    null),
  ('LETTERS MAILED',                   'Complaints',     'actionable', 'CM AWAITING RESPONSE', null),
  ('CFPB FILED',                       'Complaints',     'actionable', 'CM AWAITING RESPONSE', null),
  ('FTC FILED',                        'Complaints',     'actionable', 'CM AWAITING RESPONSE', null),
  ('CM COMPLETED',                     'Complaints',     'terminal',   null,                 null),
  -- Bureau Calling
  ('BC NEEDED',                        'Bureau Calling', 'actionable', 'BC NEEDED',          null),
  ('BC IN PROGRESS',                   'Bureau Calling', 'actionable', 'BC IN PROGRESS',     null),
  ('BC COMPLETED',                     'Bureau Calling', 'terminal',   null,                 null),
  ('BC NOT NEEDED',                    'Bureau Calling', 'terminal',   null,                 null),
  -- Owned by the partner, not by BES
  ('For Partner Confirmation',         null,             'partner_action', null,
     'Locked: no BES assignee, a Partner Action Required item, visible in the Partner Portal (Dee).'),
  ('Waiting for Partner Approval',     null,             'partner_action', null, null),
  -- Nothing to route
  ('Completed',                        null,             'terminal',   null, null),
  ('Graduated',                        null,             'terminal',   null, null),
  ('Archived',                         null,             'terminal',   null, null)
on conflict (status) do update
  set department = excluded.department, kind = excluded.kind,
      entry_status = excluded.entry_status, note = excluded.note;

/* Every entry status must belong to its department's own vocabulary, or the
   engine would open work at a status the department does not have. Checked
   here rather than trusted: the seed above is long enough to get wrong. */
do $$
declare bad text;
begin
  select string_agg(r.status::text || ' → ' || r.department::text || ' @ ' || r.entry_status, ', ')
    into bad
    from public.creditops_status_routing r
   where r.entry_status is not null
     and not (r.entry_status = any (public.creditops_department_statuses(r.department)));
  if bad is not null then
    raise exception 'Routing rows name a status the department does not have: %', bad;
  end if;
end $$;

/** Open, and something a person can act on now — not waiting on a third party. */
create or replace function public.creditops_status_is_actionable(
  p_department public.fulfillment_department,
  p_status text
) returns boolean
language sql immutable set search_path = public as $function$
  select upper(trim(p_status)) not in (
    -- closed: nothing open for this department
    'BC NOT NEEDED', 'BC COMPLETED', 'CM NOT NEEDED', 'CM COMPLETED',
    'SUPPORT RESOLVED', 'OB READY FOR R1', 'PARTNER ENDORSED',
    'COMPLETED', 'ARCHIVED / INACTIVE',
    -- open, but the clock belongs to somebody else
    'ROUND SENT - AWAITING RESULTS', 'WAITING FOR PARTNER APPROVAL',
    'WAITING CLIENT RESPONSE', 'CM AWAITING RESPONSE',
    'MONITORING PENDING', 'DOCS PENDING'
  )
$function$;

comment on function public.creditops_status_is_actionable(public.fulfillment_department, text) is
  'Work somebody can pick up now. The one definition shared by fair distribution, My Work and the Waiting figures — two lists would drift and the drift shows up as a workload number nobody can reconcile (Dee, 2026-09-11).';

-- ── Fair distribution ───────────────────────────────────────────────────────
/**
 * Who should take the next actionable file in this department.
 *
 * Dee: "least active actionable assignments among eligible active team
 * members, with deterministic round-robin/tie-breaking when counts are equal…
 * The goal is equal practical workload, not simply equal lifetime assignment
 * counts."
 *
 * ELIGIBLE means: a member of a live team pointed at this department, whose
 * agency membership is still active. Nothing about rank — a Team Lead who
 * works files is eligible like anybody else.
 *
 * WORKLOAD counts only what the person can actually act on today. A waiting
 * row, a resolved row, an archived client and a completed file are all
 * excluded, so somebody holding fifty files in the 30-day wait is not treated
 * as the busiest person on the team.
 *
 * THE TIE-BREAK rotates rather than settling on one person. Ordering by user
 * id would hand every tie to the same member for ever; ordering by who was
 * assigned least recently in this department spreads them, and the id is the
 * last resort so the result is still deterministic.
 *
 * Returns null when nobody is eligible. That is an answer, not a failure —
 * the caller leaves the work unassigned and flags it.
 */
create or replace function public.creditops_pick_assignee(
  p_department public.fulfillment_department,
  p_agency uuid
) returns uuid
language sql stable security definer set search_path = public as $function$
  with eligible as (
    select distinct m.user_id
      from public.team_memberships m
      join public.teams t on t.id = m.team_id and t.archived_at is null
      join public.departments d on d.id = t.department_id
      join public.agency_memberships am
        on am.user_id = m.user_id and am.agency_id = p_agency
     where t.agency_id = p_agency
       and d.division = 'creditops'
       and d.archived_at is null
       and d.key = case p_department
                     when 'Onboarding'     then 'onboarding'
                     when 'Dispute'        then 'dispute'
                     when 'Support'        then 'support'
                     when 'Complaints'     then 'complaints'
                     when 'Bureau Calling' then 'bureau_calling'
                   end
       and coalesce(am.status, 'active') = 'active'
  ), load as (
    select e.user_id,
           (select count(*)
              from public.client_department_statuses s
              join public.fulfillment_clients c on c.id = s.client_id
             where s.assignee_id = e.user_id
               and coalesce(c.lifecycle, 'active') = 'active'
               and c.archived_at is null
               and public.creditops_status_is_actionable(s.department, s.status)
           ) as active_files,
           (select max(s2.assigned_at)
              from public.client_department_statuses s2
             where s2.assignee_id = e.user_id and s2.department = p_department
           ) as last_given
      from eligible e
  )
  select user_id from load
   order by active_files asc,
            /* Longest since this department last handed them one. Never
               assigned in it sorts first, which is how a new member starts
               receiving work immediately. */
            last_given asc nulls first,
            user_id asc
   limit 1
$function$;

revoke execute on function public.creditops_pick_assignee(public.fulfillment_department, uuid) from public, anon;
grant execute on function public.creditops_pick_assignee(public.fulfillment_department, uuid) to authenticated;
grant execute on function public.creditops_status_is_actionable(public.fulfillment_department, text) to authenticated, anon;
