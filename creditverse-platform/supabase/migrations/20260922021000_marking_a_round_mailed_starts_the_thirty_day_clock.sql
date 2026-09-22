-- Marking a round mailed must start the THIRTY-day clock, not a one-day one.
--
-- A regression I introduced this morning. Migration 20260922006000 re-keyed
-- the Dispute SLA policy from the department status `Mailed` onto
-- `ROUND SENT - AWAITING RESULTS`, and deleted the `Mailed` row, on the stated
-- grounds that "`Mailed` is not a Dispute status and nothing writes it".
--
-- Something does write it: `mark_client_mailed()`, which is the "Mark as
-- mailed" action on the client file (ClientWorkflowActions) and the mailed-date
-- picker (ClientAssignmentCard). Its own doc comment says "waiting, due in 30
-- days". I checked the department VOCABULARY lists and did not check the
-- function bodies, so I deleted the policy that gave that action its deadline.
--
-- Effect, had this stood: the next agent to mark a round mailed would open a
-- Dispute queue row with no matching policy, fall through to the 24-hour
-- default, and have the file pulled back for review the following day —
-- eleven months early on a bureau's 30-day window, and exactly the runaway
-- `sla_sweep` shape that fired on two clients this morning.
--
-- Caught before anybody hit it: no client is on department status `Mailed`
-- and none is on credit status `In Dispute`, so no live record needs
-- repairing. This is prospective damage only.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
-- One word. `mark_client_mailed` opens the queue on the status the rest of
-- CreditOps uses for a round in the post — the one that now carries 720 hours,
-- waiting = true, and an expiry that closes the Dispute row and returns the
-- file as `Ready for Credit Review`. There is no second policy row and no
-- second name for one state (rules 2 and 5).
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ──────────────────────────────────────
--
-- The function also sets the client's credit status to `In Dispute`, which Dee
-- retired this morning in favour of the twelve `Round N Sent` stages. Which
-- round a given "Mark as mailed" click represents is a product decision — the
-- round enum stops at `Round 4+` while the stages run to 12, so it cannot be
-- derived without guessing — and rule 20 says a product decision is put to Dee
-- rather than invented inside a defect fix. `In Dispute` remains a valid enum
-- value and the dropdown still offers a record its own value, so nothing
-- breaks in the meantime. Recorded in PRODUCTION_BACKLOG.md.
--
-- Cost impact: no material increase.

do $$
declare
  v_def text := pg_get_functiondef('public.mark_client_mailed(uuid, timestamptz)'::regprocedure);
  v_old text := $q$public.enter_department_queue(p_client, 'Dispute', 'Mailed', v_when)$q$;
  v_new text := $q$public.enter_department_queue(p_client, 'Dispute', 'ROUND SENT - AWAITING RESULTS', v_when)$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'mark_client_mailed no longer opens the queue on ''Mailed'' — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* The rule this restores, asserted against the live policy rather than
   assumed: the status mark_client_mailed now opens must be the one that waits
   thirty days. If a future migration re-keys the policy again, this fails
   here instead of silently shortening a bureau window. */
do $$
declare v_hours int; v_waiting boolean;
begin
  select hours, waiting into v_hours, v_waiting
    from public.sla_policies
   where department = 'Dispute' and status = 'ROUND SENT - AWAITING RESULTS'
   limit 1;

  if v_hours is null then
    raise exception 'no Dispute policy for ROUND SENT - AWAITING RESULTS; the mailed clock would fall back to 24 hours';
  end if;
  if v_hours <> 720 or not v_waiting then
    raise exception 'a mailed round must wait 720 hours externally, found % hours waiting=%', v_hours, v_waiting;
  end if;
end $$;
